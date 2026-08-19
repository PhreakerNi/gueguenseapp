-- Migration: Phase 3 Closure v1.2
-- Tight corrections for B2B & Driver Onboarding, Document Upload Authorization, Canonical Audit & Idempotency

-- 1. Storage Direct Bypass Closure & Strict Allowlist
-- Drop any direct client mutation policies on storage.objects for driver-documents
DO $$
BEGIN
    DROP POLICY IF EXISTS "Drivers can upload documents to own folder" ON storage.objects;
    DROP POLICY IF EXISTS "Drivers can view own documents" ON storage.objects;
    DROP POLICY IF EXISTS "Drivers can update own documents" ON storage.objects;
    DROP POLICY IF EXISTS "Super admins and verification agents can view driver documents" ON storage.objects;
    DROP POLICY IF EXISTS "Public Access" ON storage.objects;
END $$;

-- 2. Create Private Schema & Internal Tables
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.driver_document_upload_authorizations (
    upload_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'CRIMINAL_RECORD', 'INSURANCE')),
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
    max_size_bytes BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    committed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE private.driver_document_upload_authorizations FROM PUBLIC, anon, authenticated;

-- Internal table to store cached idempotency responses
CREATE TABLE IF NOT EXISTS private.idempotency_responses (
    ref_id TEXT PRIMARY KEY,
    response_status INTEGER NOT NULL,
    response_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

REVOKE ALL ON TABLE private.idempotency_responses FROM PUBLIC, anon, authenticated;

-- 3. Canonical Audit Logs Table (Section 11)
DROP TABLE IF EXISTS public.audit_logs CASCADE;
CREATE TABLE public.audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('DRIVER_VERIFIED', 'DRIVER_REJECTED')),
    reason TEXT NOT NULL,
    ip_address TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_admin_user_id ON public.audit_logs(admin_user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.audit_logs FROM PUBLIC, anon, authenticated;

-- RLS: SELECT allowed ONLY for super_admin (Section 11)
CREATE POLICY "Super admins can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND platform_role = 'super_admin'
        )
    );

GRANT SELECT ON TABLE public.audit_logs TO authenticated;

-- 4. Canonical Idempotency Keys Table (Section 12)
DROP TABLE IF EXISTS public.idempotency_keys CASCADE;
CREATE TABLE public.idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type TEXT NOT NULL DEFAULT 'USER',
    actor_user_id UUID NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    external_actor_key TEXT NULL,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body_ref TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE (scope, key)
);

CREATE INDEX idx_idempotency_keys_lookup ON public.idempotency_keys(scope, key);
CREATE INDEX idx_idempotency_keys_expires_at ON public.idempotency_keys(expires_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.idempotency_keys FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.idempotency_keys TO authenticated;

-- 5. Partial Unique Index for Active Documents (Section 9)
DROP INDEX IF EXISTS public.idx_driver_documents_active_type;
CREATE UNIQUE INDEX idx_driver_documents_active_type ON public.driver_documents (driver_id, document_type)
WHERE (verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED'));

-- 6. Business Creation RPC (brand_name optional, Section 16)
CREATE OR REPLACE FUNCTION public.create_business(
    p_actor_id UUID,
    p_legal_name TEXT,
    p_brand_name TEXT DEFAULT NULL,
    p_tax_id TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_legal TEXT;
    v_clean_brand TEXT;
    v_clean_tax TEXT;
    v_business_id UUID;
    v_member_id UUID;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.business_members
        WHERE user_id = p_actor_id AND role = 'business_owner'
    ) THEN
        RAISE EXCEPTION 'BUSINESS_ALREADY_EXISTS: User already owns a business entity';
    END IF;

    v_clean_legal := NULLIF(pg_catalog.btrim(p_legal_name), '');
    v_clean_brand := NULLIF(pg_catalog.btrim(p_brand_name), '');
    v_clean_tax := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_tax_id)), '');

    IF v_clean_legal IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: legal_name is required';
    END IF;

    IF v_clean_tax IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: tax_id is required';
    END IF;

    IF EXISTS (SELECT 1 FROM public.businesses WHERE tax_id = v_clean_tax) THEN
        RAISE EXCEPTION 'TAX_ID_EXISTS: Business with tax_id % already exists', v_clean_tax;
    END IF;

    INSERT INTO public.businesses (
        legal_name,
        brand_name,
        tax_id,
        verification_status,
        account_status
    )
    VALUES (
        v_clean_legal,
        v_clean_brand,
        v_clean_tax,
        'PENDING',
        'ACTIVE'
    )
    RETURNING id INTO v_business_id;

    INSERT INTO public.business_members (
        business_id,
        user_id,
        role,
        status
    )
    VALUES (
        v_business_id,
        p_actor_id,
        'business_owner',
        'ACTIVE'
    )
    RETURNING id INTO v_member_id;

    RETURN jsonb_build_object(
        'business_id', v_business_id,
        'legal_name', v_clean_legal,
        'brand_name', v_clean_brand,
        'tax_id', v_clean_tax,
        'verification_status', 'PENDING',
        'account_status', 'ACTIVE',
        'owner_membership_id', v_member_id
    );
END;
$$;

-- 7. Business Location Creation RPC (ACTIVE business check, Section 17 & 18)
CREATE OR REPLACE FUNCTION public.create_business_location(
    p_actor_id UUID,
    p_business_id UUID,
    p_location_name TEXT,
    p_address_text TEXT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_phone TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_name TEXT;
    v_clean_addr TEXT;
    v_clean_phone TEXT;
    v_location_id UUID;
    v_member_role TEXT;
    v_member_id UUID;
    v_biz_status TEXT;
    v_biz_account TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    -- Verify business account status is ACTIVE (Section 17)
    SELECT verification_status, account_status
    INTO v_biz_status, v_biz_account
    FROM public.businesses
    WHERE id = p_business_id;

    IF v_biz_status IS NULL THEN
        RAISE EXCEPTION 'BUSINESS_NOT_FOUND: Business does not exist';
    END IF;

    IF v_biz_account <> 'ACTIVE' THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Cannot create location for business with status %', v_biz_account;
    END IF;

    -- Verify actor membership
    SELECT id, role INTO v_member_id, v_member_role
    FROM public.business_members
    WHERE business_id = p_business_id AND user_id = p_actor_id AND status = 'ACTIVE';

    IF v_member_role IS NULL OR v_member_role NOT IN ('business_owner', 'manager') THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: Only active business owners or managers can create locations';
    END IF;

    v_clean_name := NULLIF(pg_catalog.btrim(p_location_name), '');
    v_clean_addr := NULLIF(pg_catalog.btrim(p_address_text), '');
    v_clean_phone := NULLIF(pg_catalog.btrim(p_phone), '');

    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: location_name is required';
    END IF;
    IF v_clean_addr IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: address_text is required';
    END IF;
    IF p_latitude IS NULL OR p_latitude < -90.0 OR p_latitude > 90.0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: valid latitude between -90 and 90 is required';
    END IF;
    IF p_longitude IS NULL OR p_longitude < -180.0 OR p_longitude > 180.0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: valid longitude between -180 and 180 is required';
    END IF;

    INSERT INTO public.business_locations (
        business_id,
        location_name,
        address_text,
        location_point,
        phone,
        status
    )
    VALUES (
        p_business_id,
        v_clean_name,
        v_clean_addr,
        extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
        v_clean_phone,
        'ACTIVE'
    )
    RETURNING id INTO v_location_id;

    -- If created by manager, assign location to manager (Section 18)
    IF v_member_role = 'manager' THEN
        INSERT INTO public.business_member_locations (business_member_id, business_location_id)
        VALUES (v_member_id, v_location_id)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN jsonb_build_object(
        'location_id', v_location_id,
        'business_id', p_business_id,
        'location_name', v_clean_name,
        'address_text', v_clean_addr,
        'latitude', p_latitude,
        'longitude', p_longitude,
        'status', 'ACTIVE'
    );
END;
$$;

-- 8. Add Business Member RPC (Fail-Closed, Section 19)
CREATE OR REPLACE FUNCTION public.add_business_member(
    p_actor_id UUID,
    p_business_id UUID,
    p_target_user_id UUID,
    p_role TEXT,
    p_location_ids UUID[] DEFAULT ARRAY[]::UUID[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_role TEXT;
    v_member_id UUID;
    v_loc_id UUID;
    v_biz_status TEXT;
    v_biz_account TEXT;
    v_valid_loc_count BIGINT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    -- Verify business status
    SELECT verification_status, account_status
    INTO v_biz_status, v_biz_account
    FROM public.businesses
    WHERE id = p_business_id;

    IF v_biz_status IS NULL THEN
        RAISE EXCEPTION 'BUSINESS_NOT_FOUND: Business does not exist';
    END IF;

    IF v_biz_account <> 'ACTIVE' THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Business is not active';
    END IF;

    -- Only active business_owner can add members
    IF NOT EXISTS (
        SELECT 1 FROM public.business_members
        WHERE business_id = p_business_id AND user_id = p_actor_id AND role = 'business_owner' AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: Only active business owners can add members';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_target_user_id) THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: Target user does not exist';
    END IF;

    v_clean_role := pg_catalog.btrim(p_role);
    IF v_clean_role NOT IN ('manager', 'employee') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Role must be manager or employee';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.business_members
        WHERE business_id = p_business_id AND user_id = p_target_user_id
    ) THEN
        RAISE EXCEPTION 'MEMBER_ALREADY_EXISTS: User is already a member of this business';
    END IF;

    -- Fail-closed location validation (Section 19)
    IF p_location_ids IS NULL OR pg_catalog.cardinality(p_location_ids) = 0 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: At least one valid location_id is required for manager or employee';
    END IF;

    -- Verify ALL locations exist, belong to this business, and are ACTIVE
    SELECT count(*) INTO v_valid_loc_count
    FROM public.business_locations
    WHERE business_id = p_business_id
      AND status = 'ACTIVE'
      AND id = ANY(p_location_ids);

    IF v_valid_loc_count <> pg_catalog.cardinality(p_location_ids) THEN
        RAISE EXCEPTION 'INVALID_LOCATION_SCOPE: One or more location_ids are invalid, inactive, or belong to another business';
    END IF;

    INSERT INTO public.business_members (
        business_id,
        user_id,
        role,
        status
    )
    VALUES (
        p_business_id,
        p_target_user_id,
        v_clean_role,
        'ACTIVE'
    )
    RETURNING id INTO v_member_id;

    FOREACH v_loc_id IN ARRAY p_location_ids LOOP
        INSERT INTO public.business_member_locations (
            business_member_id,
            business_location_id
        )
        VALUES (
            v_member_id,
            v_loc_id
        );
    END LOOP;

    RETURN jsonb_build_object(
        'business_member_id', v_member_id,
        'business_id', p_business_id,
        'user_id', p_target_user_id,
        'role', v_clean_role,
        'status', 'ACTIVE',
        'location_count', pg_catalog.cardinality(p_location_ids)
    );
END;
$$;

-- 9. Register Vehicle RPC (Account status gate, Section 24)
CREATE OR REPLACE FUNCTION public.register_vehicle(
    p_actor_id UUID,
    p_make TEXT,
    p_model TEXT,
    p_year INTEGER,
    p_color TEXT,
    p_license_plate TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_make TEXT;
    v_clean_model TEXT;
    v_clean_color TEXT;
    v_clean_plate TEXT;
    v_vehicle_id UUID;
    v_driver_acc_status TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    SELECT account_status INTO v_driver_acc_status
    FROM public.drivers
    WHERE id = p_actor_id;

    IF v_driver_acc_status IS NULL THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Driver must register personal profile before registering vehicle';
    END IF;

    -- Gate: Account status cannot be SUSPENDED, BLOCKED, or CLOSED (Section 24)
    IF v_driver_acc_status IN ('SUSPENDED', 'BLOCKED', 'CLOSED') THEN
        RAISE EXCEPTION 'ACCOUNT_RESTRICTED: Restricted drivers cannot register vehicles';
    END IF;

    v_clean_make := NULLIF(pg_catalog.btrim(p_make), '');
    v_clean_model := NULLIF(pg_catalog.btrim(p_model), '');
    v_clean_color := NULLIF(pg_catalog.btrim(p_color), '');
    v_clean_plate := NULLIF(pg_catalog.upper(pg_catalog.btrim(p_license_plate)), '');

    IF v_clean_make IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: vehicle make is required';
    END IF;
    IF v_clean_model IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: vehicle model is required';
    END IF;
    IF p_year IS NULL OR p_year < 1980 OR p_year > (EXTRACT(YEAR FROM pg_catalog.now()) + 1) THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: vehicle year is invalid';
    END IF;
    IF v_clean_color IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: vehicle color is required';
    END IF;
    IF v_clean_plate IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: license_plate is required';
    END IF;

    IF EXISTS (SELECT 1 FROM public.vehicles WHERE license_plate = v_clean_plate) THEN
        RAISE EXCEPTION 'LICENSE_PLATE_EXISTS: Vehicle with license_plate % is already registered', v_clean_plate;
    END IF;

    INSERT INTO public.vehicles (
        driver_id,
        make,
        model,
        year,
        color,
        license_plate
    )
    VALUES (
        p_actor_id,
        v_clean_make,
        v_clean_model,
        p_year,
        v_clean_color,
        v_clean_plate
    )
    RETURNING id INTO v_vehicle_id;

    RETURN jsonb_build_object(
        'vehicle_id', v_vehicle_id,
        'driver_id', p_actor_id,
        'make', v_clean_make,
        'model', v_clean_model,
        'year', p_year,
        'color', v_clean_color,
        'license_plate', v_clean_plate
    );
END;
$$;

-- 10. Document Upload Authorization RPC (Section 5 & 6)
CREATE OR REPLACE FUNCTION public.authorize_driver_document_upload(
    p_actor_id UUID,
    p_document_type TEXT,
    p_mime_type TEXT,
    p_size_bytes BIGINT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_type TEXT;
    v_clean_mime TEXT;
    v_upload_id UUID;
    v_storage_path TEXT;
    v_expires_at TIMESTAMPTZ;
    v_driver_acc TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    SELECT account_status INTO v_driver_acc
    FROM public.drivers
    WHERE id = p_actor_id;

    IF v_driver_acc IS NULL THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Driver profile must exist before authorizing document upload';
    END IF;

    IF v_driver_acc IN ('SUSPENDED', 'BLOCKED', 'CLOSED') THEN
        RAISE EXCEPTION 'ACCOUNT_RESTRICTED: Restricted drivers cannot upload documents';
    END IF;

    v_clean_type := pg_catalog.upper(pg_catalog.btrim(p_document_type));
    v_clean_mime := pg_catalog.lower(pg_catalog.btrim(p_mime_type));

    IF v_clean_type NOT IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'CRIMINAL_RECORD', 'INSURANCE') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid document_type';
    END IF;

    -- Strict allowed MIME types (Section 4: ONLY jpeg, png, pdf)
    IF v_clean_mime NOT IN ('image/jpeg', 'image/png', 'application/pdf') THEN
        RAISE EXCEPTION 'INVALID_MIME_TYPE: Allowed document MIME types are image/jpeg, image/png, application/pdf';
    END IF;

    IF p_size_bytes IS NULL OR p_size_bytes < 1 OR p_size_bytes > 10485760 THEN
        RAISE EXCEPTION 'INVALID_FILE_SIZE: File size must be between 1 byte and 10MB';
    END IF;

    v_upload_id := gen_random_uuid();
    v_storage_path := p_actor_id::text || '/' || v_clean_type || '/' || v_upload_id::text;
    -- TTL <= 15 minutes (Section 6)
    v_expires_at := pg_catalog.now() + interval '15 minutes';

    INSERT INTO private.driver_document_upload_authorizations (
        upload_id,
        driver_id,
        document_type,
        storage_path,
        mime_type,
        max_size_bytes,
        expires_at
    )
    VALUES (
        v_upload_id,
        p_actor_id,
        v_clean_type,
        v_storage_path,
        v_clean_mime,
        p_size_bytes,
        v_expires_at
    );

    RETURN jsonb_build_object(
        'upload_id', v_upload_id,
        'driver_id', p_actor_id,
        'document_type', v_clean_type,
        'storage_path', v_storage_path,
        'mime_type', v_clean_mime,
        'expires_at', v_expires_at
    );
END;
$$;

-- 11. Document Commit RPC (by upload_id, Fail-Closed, Section 7 & 10)
CREATE OR REPLACE FUNCTION public.commit_driver_document(
    p_actor_id UUID,
    p_upload_id UUID,
    p_document_type TEXT,
    p_file_size BIGINT,
    p_mime_type TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_auth_record RECORD;
    v_clean_type TEXT;
    v_clean_mime TEXT;
    v_doc_id UUID;
    v_driver_status TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    SELECT verification_status INTO v_driver_status
    FROM public.drivers
    WHERE id = p_actor_id;

    IF v_driver_status IS NULL THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Driver profile must exist before committing documents';
    END IF;

    v_clean_type := pg_catalog.upper(pg_catalog.btrim(p_document_type));
    v_clean_mime := pg_catalog.lower(pg_catalog.btrim(p_mime_type));

    -- Look up authorization in private schema
    SELECT * INTO v_auth_record
    FROM private.driver_document_upload_authorizations
    WHERE upload_id = p_upload_id AND driver_id = p_actor_id;

    IF v_auth_record.upload_id IS NULL THEN
        RAISE EXCEPTION 'UPLOAD_UNVERIFIED: Valid upload authorization not found';
    END IF;

    IF v_auth_record.document_type <> v_clean_type THEN
        RAISE EXCEPTION 'UPLOAD_UNVERIFIED: Document type does not match authorized upload';
    END IF;

    IF v_auth_record.expires_at < pg_catalog.now() THEN
        RAISE EXCEPTION 'EXPIRED_UPLOAD_REF: Upload authorization has expired';
    END IF;

    IF v_auth_record.committed_at IS NOT NULL THEN
        RAISE EXCEPTION 'UPLOAD_UNVERIFIED: Upload authorization has already been committed';
    END IF;

    -- Fail-closed size and MIME checks (Section 7)
    IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > v_auth_record.max_size_bytes OR p_file_size > 10485760 THEN
        RAISE EXCEPTION 'INVALID_FILE_SIZE: Uploaded file size is invalid or exceeds authorized size';
    END IF;

    IF v_clean_mime <> v_auth_record.mime_type OR v_clean_mime NOT IN ('image/jpeg', 'image/png', 'application/pdf') THEN
        RAISE EXCEPTION 'INVALID_MIME_TYPE: Uploaded file MIME type does not match authorized MIME type';
    END IF;

    -- Active duplicate check (Section 10)
    IF EXISTS (
        SELECT 1 FROM public.driver_documents
        WHERE driver_id = p_actor_id
          AND document_type = v_clean_type
          AND verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED')
    ) THEN
        RAISE EXCEPTION 'DOCUMENT_ALREADY_SUBMITTED: Active document already exists for this document type';
    END IF;

    -- Insert new document record (preserving historical rejected records)
    INSERT INTO public.driver_documents (
        driver_id,
        document_type,
        storage_path,
        verification_status,
        rejection_reason
    )
    VALUES (
        p_actor_id,
        v_clean_type,
        v_auth_record.storage_path,
        'PENDING',
        NULL
    )
    RETURNING id INTO v_doc_id;

    -- Mark authorization as committed
    UPDATE private.driver_document_upload_authorizations
    SET committed_at = pg_catalog.now()
    WHERE upload_id = p_upload_id;

    -- If driver was REJECTED, reset driver to PENDING
    IF v_driver_status = 'REJECTED' THEN
        UPDATE public.drivers
        SET verification_status = 'PENDING'
        WHERE id = p_actor_id;
    END IF;

    RETURN jsonb_build_object(
        'document_id', v_doc_id,
        'driver_id', p_actor_id,
        'document_type', v_clean_type,
        'storage_path', v_auth_record.storage_path,
        'verification_status', 'PENDING'
    );
END;
$$;

-- 12. Admin Driver Verification RPC (No role override, Canonical Audit, Section 11 & 27)
CREATE OR REPLACE FUNCTION public.admin_verify_driver(
    p_actor_id UUID,
    p_driver_id UUID,
    p_decision TEXT,
    p_rejection_reason TEXT DEFAULT NULL,
    p_actor_aal TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_decision TEXT;
    v_clean_reason TEXT;
    v_doc_count BIGINT;
    v_has_vehicle BOOLEAN;
    v_actual_role TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Authentication required';
    END IF;

    -- Direct DB lookup for role: No client override allowed (Section 27)
    SELECT platform_role INTO v_actual_role
    FROM public.profiles
    WHERE id = p_actor_id;

    IF v_actual_role IS NULL OR v_actual_role NOT IN ('super_admin', 'admin', 'verification_agent') THEN
        RAISE EXCEPTION 'AUTH_ADMIN_ROLE_REQUIRED: Only verification_agent, admin or super_admin can verify drivers';
    END IF;

    -- Check MFA AAL2
    IF p_actor_aal IS NULL OR p_actor_aal <> 'aal2' THEN
        RAISE EXCEPTION 'AUTH_MFA_REQUIRED: AAL2 MFA is required for administrative verification';
    END IF;

    -- Check target driver existence
    IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = p_driver_id) THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Target driver does not exist';
    END IF;

    v_clean_decision := pg_catalog.upper(pg_catalog.btrim(p_decision));
    v_clean_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');

    IF v_clean_decision = 'APPROVE' THEN
        -- Verify registered vehicle
        SELECT EXISTS (SELECT 1 FROM public.vehicles WHERE driver_id = p_driver_id) INTO v_has_vehicle;
        IF NOT v_has_vehicle THEN
            RAISE EXCEPTION 'DOCUMENTATION_INCOMPLETE: Driver must have a registered vehicle before approval';
        END IF;

        -- Verify all 3 required active documents (NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION)
        SELECT count(DISTINCT document_type) INTO v_doc_count
        FROM public.driver_documents
        WHERE driver_id = p_driver_id
          AND document_type IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION')
          AND verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED');

        IF v_doc_count < 3 THEN
            RAISE EXCEPTION 'DOCUMENTATION_INCOMPLETE: Driver must have all 3 mandatory documents (NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION)';
        END IF;

        -- Update driver status
        UPDATE public.drivers
        SET verification_status = 'VERIFIED',
            account_status = 'ACTIVE'
        WHERE id = p_driver_id;

        UPDATE public.driver_presence
        SET operational_state = 'OFFLINE'
        WHERE driver_id = p_driver_id;

        -- Only approve current pending/under_review documents; historical REJECTED rows remain REJECTED (Section 10)
        UPDATE public.driver_documents
        SET verification_status = 'VERIFIED',
            rejection_reason = NULL
        WHERE driver_id = p_driver_id AND verification_status IN ('PENDING', 'UNDER_REVIEW');

        -- Canonical audit log: DRIVER_VERIFIED (Section 11)
        INSERT INTO public.audit_logs (
            admin_user_id,
            action,
            reason
        )
        VALUES (
            p_actor_id,
            'DRIVER_VERIFIED',
            'DOCUMENTATION_COMPLETE'
        );

        RETURN jsonb_build_object(
            'driver_id', p_driver_id,
            'verification_status', 'VERIFIED',
            'account_status', 'ACTIVE',
            'operational_state', 'OFFLINE'
        );

    ELSIF v_clean_decision = 'REJECT' THEN
        IF v_clean_reason IS NULL OR pg_catalog.length(v_clean_reason) < 3 THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: rejection_reason is required and must be at least 3 characters when rejecting driver';
        END IF;

        -- Transition driver to REJECTED + REGISTERED
        UPDATE public.drivers
        SET verification_status = 'REJECTED',
            account_status = 'REGISTERED'
        WHERE id = p_driver_id;

        -- Reject current pending/under_review documents
        UPDATE public.driver_documents
        SET verification_status = 'REJECTED',
            rejection_reason = v_clean_reason
        WHERE driver_id = p_driver_id AND verification_status IN ('PENDING', 'UNDER_REVIEW');

        -- Canonical audit log: DRIVER_REJECTED (Section 11)
        INSERT INTO public.audit_logs (
            admin_user_id,
            action,
            reason
        )
        VALUES (
            p_actor_id,
            'DRIVER_REJECTED',
            v_clean_reason
        );

        RETURN jsonb_build_object(
            'driver_id', p_driver_id,
            'verification_status', 'REJECTED',
            'account_status', 'REGISTERED',
            'rejection_reason', v_clean_reason
        );
    ELSE
        RAISE EXCEPTION 'INVALID_ARGUMENT: decision must be APPROVE or REJECT';
    END IF;
END;
$$;

-- 13. Transactional Advisory-Locked Idempotency RPC (Section 14 & 15)
CREATE OR REPLACE FUNCTION public.execute_idempotent_operation(
    p_actor_id UUID,
    p_scope TEXT,
    p_key TEXT,
    p_fingerprint TEXT,
    p_operation TEXT,
    p_args JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing_id UUID;
    v_existing_fp TEXT;
    v_existing_status INTEGER;
    v_existing_ref TEXT;
    v_cached_body JSONB;
    v_res_json JSONB;
    v_status INTEGER;
    v_ref_id TEXT;
BEGIN
    IF p_key IS NULL OR pg_catalog.btrim(p_key) = '' THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED: Idempotency-Key is required';
    END IF;

    -- Enforce advisory transaction lock on hash of scope:key (Section 15)
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_scope || ':' || p_key));

    -- Check if key exists
    SELECT id, request_fingerprint, response_status, response_body_ref
    INTO v_existing_id, v_existing_fp, v_existing_status, v_existing_ref
    FROM public.idempotency_keys
    WHERE scope = p_scope AND key = p_key AND expires_at > pg_catalog.now();

    IF v_existing_id IS NOT NULL THEN
        -- Check fingerprint match
        IF v_existing_fp <> p_fingerprint THEN
            RAISE EXCEPTION 'IDEMPOTENCY_FINGERPRINT_MISMATCH: Request payload fingerprint does not match original request';
        END IF;

        -- Replay cached response
        SELECT response_json INTO v_cached_body
        FROM private.idempotency_responses
        WHERE ref_id = v_existing_ref;

        RETURN jsonb_build_object(
            'is_cached', true,
            'response_status', v_existing_status,
            'response_body', COALESCE(v_cached_body, '{}'::jsonb)
        );
    END IF;

    -- Delete any expired key with same scope and key
    DELETE FROM public.idempotency_keys
    WHERE scope = p_scope AND key = p_key;

    -- Execute requested operation
    IF p_operation = 'create_business' THEN
        v_res_json := public.create_business(
            p_actor_id,
            p_args->>'legal_name',
            p_args->>'brand_name',
            p_args->>'tax_id'
        );
        v_status := 201;

    ELSIF p_operation = 'create_business_location' THEN
        v_res_json := public.create_business_location(
            p_actor_id,
            (p_args->>'business_id')::uuid,
            p_args->>'location_name',
            p_args->>'address_text',
            (p_args->>'latitude')::double precision,
            (p_args->>'longitude')::double precision,
            p_args->>'phone'
        );
        v_status := 201;

    ELSIF p_operation = 'add_business_member' THEN
        v_res_json := public.add_business_member(
            p_actor_id,
            (p_args->>'business_id')::uuid,
            (p_args->>'target_user_id')::uuid,
            p_args->>'role',
            ARRAY(SELECT jsonb_array_elements_text(p_args->'location_ids')::uuid)
        );
        v_status := 201;

    ELSIF p_operation = 'register_driver' THEN
        v_res_json := public.register_driver(
            p_actor_id,
            p_args->>'national_id_number',
            p_args->>'license_number'
        );
        v_status := 201;

    ELSIF p_operation = 'register_vehicle' THEN
        v_res_json := public.register_vehicle(
            p_actor_id,
            p_args->>'make',
            p_args->>'model',
            (p_args->>'year')::integer,
            p_args->>'color',
            p_args->>'license_plate'
        );
        v_status := 201;

    ELSIF p_operation = 'commit_driver_document' THEN
        v_res_json := public.commit_driver_document(
            p_actor_id,
            (p_args->>'upload_id')::uuid,
            p_args->>'document_type',
            (p_args->>'file_size')::bigint,
            p_args->>'mime_type'
        );
        v_status := 200;

    ELSIF p_operation = 'admin_verify_driver' THEN
        v_res_json := public.admin_verify_driver(
            p_actor_id,
            (p_args->>'driver_id')::uuid,
            p_args->>'decision',
            p_args->>'rejection_reason',
            p_args->>'actor_aal'
        );
        v_status := 200;

    ELSE
        RAISE EXCEPTION 'INVALID_OPERATION: Operation % is not supported', p_operation;
    END IF;

    -- Store response ref in same transaction
    v_ref_id := gen_random_uuid()::text;
    INSERT INTO private.idempotency_responses (ref_id, response_status, response_json)
    VALUES (v_ref_id, v_status, v_res_json);

    INSERT INTO public.idempotency_keys (
        actor_type,
        actor_user_id,
        scope,
        key,
        request_fingerprint,
        response_status,
        response_body_ref,
        expires_at
    )
    VALUES (
        'USER',
        p_actor_id,
        p_scope,
        p_key,
        p_fingerprint,
        v_status,
        v_ref_id,
        pg_catalog.now() + interval '24 hours'
    );

    RETURN jsonb_build_object(
        'is_cached', false,
        'response_status', v_status,
        'response_body', v_res_json
    );
END;
$$;

-- 14. Revoke/Grant Security Matrix
REVOKE EXECUTE ON FUNCTION public.create_business(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_business_location(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_business_member(UUID, UUID, UUID, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_driver(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_vehicle(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.authorize_driver_document_upload(UUID, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_driver_document(UUID, UUID, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_verify_driver(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_business(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_business_location(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_business_member(UUID, UUID, UUID, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_driver(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_vehicle(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.authorize_driver_document_upload(UUID, TEXT, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_driver_document(UUID, UUID, TEXT, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_verify_driver(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
