-- Migration: 20260819000002_phase3_closure_v1_2.sql
-- Description: Phase 3 Closure v1.2: Strict Storage upload authorization, canonical Idempotency & Audit schemas, and security hardening

BEGIN;

-- 0. Table Alterations / Schema Upgrades for existing foundation tables
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.driver_documents
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS mime_type TEXT,
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

-- 1. Storage Bucket and RLS Hardening (Section 1 & 4)
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
WHERE id = 'driver-documents';

DROP POLICY IF EXISTS "Drivers can upload own documents" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can upload documents to own folder" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can update documents in own folder" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can delete documents in own folder" ON storage.objects;
DROP POLICY IF EXISTS "Drivers can update own documents" ON storage.objects;

-- 2. Schema private for upload authorizations and idempotency (Section 2)
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO service_role;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

-- 3. Private Upload Authorizations Table (Section 3 & 4)
CREATE TABLE IF NOT EXISTS private.driver_document_upload_authorizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION')),
    storage_path TEXT NOT NULL,
    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'application/pdf')),
    max_size_bytes BIGINT NOT NULL CHECK (max_size_bytes <= 10485760),
    expires_at TIMESTAMPTZ NOT NULL,
    committed_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_doc_upload_auth_driver_id ON private.driver_document_upload_authorizations(driver_id);
CREATE INDEX IF NOT EXISTS idx_doc_upload_auth_upload_id ON private.driver_document_upload_authorizations(upload_id);

-- 4. Canonical Idempotency Responses in private schema (Section 6 & 8)
DROP TABLE IF EXISTS private.idempotency_responses CASCADE;
CREATE TABLE private.idempotency_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT idempotency_responses_scope_key_unique UNIQUE (scope, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_responses_expires ON private.idempotency_responses(expires_at);

-- 5. Canonical Public Idempotency Table (Section 6 & 12)
DROP TABLE IF EXISTS public.idempotency_keys CASCADE;
CREATE TABLE public.idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_type TEXT NOT NULL DEFAULT 'user' CHECK (actor_type IN ('user', 'service', 'anonymous')),
    actor_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    external_actor_key TEXT DEFAULT NULL,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    response_status INTEGER NOT NULL,
    response_body_ref TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT idempotency_keys_scope_key_unique UNIQUE (scope, key)
);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.idempotency_keys FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.idempotency_keys TO service_role;

-- 6. Canonical Audit Logs Table (Section 11)
DROP TABLE IF EXISTS public.audit_logs CASCADE;
CREATE TABLE public.audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    action TEXT NOT NULL CHECK (action IN ('DRIVER_VERIFIED', 'DRIVER_REJECTED')),
    reason TEXT NOT NULL,
    ip_address TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

-- SELECT policy strictly for super_admin (Section 11)
CREATE POLICY "Super Admins can read audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = (SELECT auth.uid())
          AND platform_role = 'super_admin'
    )
);

-- Partial Unique Index on driver_documents (Section 9)
DROP INDEX IF EXISTS public.idx_driver_documents_active_type;
CREATE UNIQUE INDEX idx_driver_documents_active_type
ON public.driver_documents (driver_id, document_type)
WHERE verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED');

-- Unique Index on vehicles(driver_id) for 1:1 vehicle registration
CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicles_driver_id_unique ON public.vehicles(driver_id);

-- Dynamically drop ALL overloaded signatures of existing Phase 3 RPCs to prevent "function is not unique" (Rule 2)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT oid::regprocedure AS func_sig
        FROM pg_proc
        WHERE proname IN (
            'create_business',
            'create_business_location',
            'add_business_member',
            'register_driver',
            'register_vehicle',
            'authorize_driver_document_upload',
            'commit_driver_document',
            'admin_verify_driver',
            'execute_idempotent_operation',
            'acquire_idempotency_lock',
            'commit_idempotency_response'
        )
        AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_sig || ' CASCADE;';
    END LOOP;
END $$;

-- 7. Create Business RPC (brand_name optional, Section 16)
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

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor_id) THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: User does not exist';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.business_members
        WHERE user_id = p_actor_id AND status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'ALREADY_REGISTERED: User is already an active member of a business';
    END IF;

    v_clean_legal := NULLIF(pg_catalog.btrim(p_legal_name), '');
    v_clean_brand := NULLIF(pg_catalog.btrim(p_brand_name), '');
    v_clean_tax := NULLIF(pg_catalog.btrim(p_tax_id), '');

    IF v_clean_legal IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: legal_name is required and cannot be empty';
    END IF;

    IF v_clean_tax IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: tax_id is required and cannot be empty';
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

-- 8. Create Business Location RPC (ACTIVE business check & correct columns, Section 17 & 18)
CREATE OR REPLACE FUNCTION public.create_business_location(
    p_actor_id UUID,
    p_business_id UUID,
    p_location_name TEXT,
    p_address_text TEXT,
    p_latitude DOUBLE PRECISION,
    p_longitude DOUBLE PRECISION,
    p_pickup_instructions TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_name TEXT;
    v_clean_addr TEXT;
    v_clean_instructions TEXT;
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

    IF v_member_role IS NULL OR v_member_role NOT IN ('business_owner', 'business_manager', 'manager') THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: Only active business owners or managers can create locations';
    END IF;

    v_clean_name := NULLIF(pg_catalog.btrim(p_location_name), '');
    v_clean_addr := NULLIF(pg_catalog.btrim(p_address_text), '');
    v_clean_instructions := NULLIF(pg_catalog.btrim(p_pickup_instructions), '');

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
        name,
        address_text,
        location,
        pickup_instructions,
        is_active
    )
    VALUES (
        p_business_id,
        v_clean_name,
        v_clean_addr,
        extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography,
        v_clean_instructions,
        true
    )
    RETURNING id INTO v_location_id;

    -- If created by manager, assign location to manager (Section 18)
    IF v_member_role IN ('business_manager', 'manager') THEN
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
        'is_active', true,
        'status', 'ACTIVE'
    );
END;
$$;

-- 9. Add Business Member RPC (Fail-Closed, Section 19)
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
    v_input_role TEXT;
    v_canonical_role TEXT;
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

    v_input_role := pg_catalog.btrim(p_role);
    IF v_input_role IN ('manager', 'business_manager') THEN
        v_canonical_role := 'business_manager';
    ELSIF v_input_role IN ('employee', 'business_employee') THEN
        v_canonical_role := 'business_employee';
    ELSE
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
      AND is_active = true
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
        v_canonical_role,
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
        'role', v_canonical_role,
        'status', 'ACTIVE',
        'location_count', pg_catalog.cardinality(p_location_ids)
    );
END;
$$;

-- 10. Register Driver RPC (Separated Step, Section 20)
CREATE OR REPLACE FUNCTION public.register_driver(
    p_actor_id UUID,
    p_national_id_number TEXT,
    p_license_number TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_nid TEXT;
    v_clean_lic TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_actor_id) THEN
        RAISE EXCEPTION 'USER_NOT_FOUND: User does not exist';
    END IF;

    v_clean_nid := NULLIF(pg_catalog.btrim(p_national_id_number), '');
    v_clean_lic := NULLIF(pg_catalog.btrim(p_license_number), '');

    IF v_clean_nid IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: national_id_number is required';
    END IF;
    IF v_clean_lic IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: license_number is required';
    END IF;

    -- Check if user is already registered as driver
    IF EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.id = p_actor_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_REGISTERED: User is already registered as a driver';
    END IF;

    -- Check uniqueness
    IF EXISTS (SELECT 1 FROM public.drivers WHERE national_id_number = v_clean_nid) THEN
        RAISE EXCEPTION 'NATIONAL_ID_EXISTS: National ID number is already registered';
    END IF;
    IF EXISTS (SELECT 1 FROM public.drivers WHERE license_number = v_clean_lic) THEN
        RAISE EXCEPTION 'LICENSE_EXISTS: Driver license number is already registered';
    END IF;

    -- 1. Create Driver Record
    INSERT INTO public.drivers (
        id,
        national_id_number,
        license_number,
        verification_status,
        account_status,
        rating_avg,
        total_deliveries
    )
    VALUES (
        p_actor_id,
        v_clean_nid,
        v_clean_lic,
        'PENDING',
        'REGISTERED',
        5.00,
        0
    );

    -- 2. Create Driver Presence (OFFLINE)
    INSERT INTO public.driver_presence (
        driver_id,
        operational_state,
        current_location,
        location_updated_at
    )
    VALUES (
        p_actor_id,
        'OFFLINE',
        NULL,
        NULL
    )
    ON CONFLICT (driver_id) DO NOTHING;

    RETURN jsonb_build_object(
        'driver_id', p_actor_id,
        'verification_status', 'PENDING',
        'account_status', 'REGISTERED',
        'operational_state', 'OFFLINE'
    );
END;
$$;

-- 11. Register Vehicle RPC (Account status gate, Section 24)
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
    v_clean_plate := NULLIF(pg_catalog.btrim(p_license_plate), '');

    IF v_clean_make IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: make is required';
    END IF;
    IF v_clean_model IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: model is required';
    END IF;
    IF p_year IS NULL OR p_year < 1990 OR p_year > 2030 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: year must be between 1990 and 2030';
    END IF;
    IF v_clean_color IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: color is required';
    END IF;
    IF v_clean_plate IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: license_plate is required';
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.vehicles
        WHERE license_plate = v_clean_plate AND driver_id <> p_actor_id
    ) THEN
        RAISE EXCEPTION 'LICENSE_PLATE_EXISTS: Vehicle license plate is already registered to another driver';
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
    ON CONFLICT (driver_id) DO UPDATE SET
        make = EXCLUDED.make,
        model = EXCLUDED.model,
        year = EXCLUDED.year,
        color = EXCLUDED.color,
        license_plate = EXCLUDED.license_plate
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

-- 12. Authorize Driver Document Upload RPC (Section 3 & 4)
CREATE OR REPLACE FUNCTION public.authorize_driver_document_upload(
    p_actor_id UUID,
    p_document_type TEXT,
    p_mime_type TEXT,
    p_file_size BIGINT
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
    v_file_ext TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = p_actor_id) THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Driver profile does not exist';
    END IF;

    v_clean_type := pg_catalog.btrim(p_document_type);
    IF v_clean_type NOT IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION') THEN
        RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE: Allowed types are NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION';
    END IF;

    v_clean_mime := pg_catalog.btrim(p_mime_type);
    -- Strict MIME allowlist: image/jpeg, image/png, application/pdf ONLY (webp is DENIED, Section 4)
    IF v_clean_mime NOT IN ('image/jpeg', 'image/png', 'application/pdf') THEN
        RAISE EXCEPTION 'INVALID_MIME_TYPE: Allowed document MIME types are image/jpeg, image/png, application/pdf';
    END IF;

    IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > 10485760 THEN
        RAISE EXCEPTION 'INVALID_FILE_SIZE: File size must be between 1 byte and 10MB';
    END IF;

    IF v_clean_mime = 'image/jpeg' THEN
        v_file_ext := 'jpg';
    ELSIF v_clean_mime = 'image/png' THEN
        v_file_ext := 'png';
    ELSE
        v_file_ext := 'pdf';
    END IF;

    v_upload_id := gen_random_uuid();
    v_storage_path := p_actor_id::text || '/' || pg_catalog.lower(v_clean_type) || '_' || v_upload_id::text || '.' || v_file_ext;
    v_expires_at := NOW() + interval '15 minutes';

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
        p_file_size,
        v_expires_at
    );

    RETURN jsonb_build_object(
        'upload_id', v_upload_id,
        'storage_path', v_storage_path,
        'expires_at', v_expires_at,
        'document_type', v_clean_type,
        'mime_type', v_clean_mime,
        'max_size_bytes', p_file_size
    );
END;
$$;

-- 13. Commit Driver Document RPC (Validates against authorization, preserves rejected history, Section 5 & 10)
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
    v_doc_id UUID;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    SELECT * INTO v_auth_record
    FROM private.driver_document_upload_authorizations
    WHERE upload_id = p_upload_id;

    IF v_auth_record.id IS NULL THEN
        RAISE EXCEPTION 'UPLOAD_UNAUTHORIZED: Upload authorization not found';
    END IF;

    IF v_auth_record.driver_id <> p_actor_id THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: Upload authorization belongs to another driver';
    END IF;

    IF v_auth_record.expires_at < NOW() THEN
        RAISE EXCEPTION 'UPLOAD_EXPIRED: Upload authorization has expired';
    END IF;

    IF v_auth_record.committed_at IS NOT NULL THEN
        RAISE EXCEPTION 'UPLOAD_UNVERIFIED: Upload authorization has already been committed';
    END IF;

    IF v_auth_record.document_type <> p_document_type THEN
        RAISE EXCEPTION 'DOCUMENT_TYPE_MISMATCH: Declared document type does not match authorization';
    END IF;

    -- Delete any existing non-rejected active record for this document type (Section 9)
    DELETE FROM public.driver_documents
    WHERE driver_id = p_actor_id
      AND document_type = p_document_type
      AND verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED');

    INSERT INTO public.driver_documents (
        driver_id,
        document_type,
        storage_path,
        file_size,
        mime_type,
        verification_status
    )
    VALUES (
        p_actor_id,
        p_document_type,
        v_auth_record.storage_path,
        p_file_size,
        p_mime_type,
        'PENDING'
    )
    RETURNING id INTO v_doc_id;

    -- Mark authorization committed
    UPDATE private.driver_document_upload_authorizations
    SET committed_at = NOW()
    WHERE id = v_auth_record.id;

    -- Reset driver verification status to PENDING if previously REJECTED
    UPDATE public.drivers
    SET verification_status = 'PENDING',
        updated_at = NOW()
    WHERE id = p_actor_id AND verification_status = 'REJECTED';

    RETURN jsonb_build_object(
        'document_id', v_doc_id,
        'driver_id', p_actor_id,
        'document_type', p_document_type,
        'storage_path', v_auth_record.storage_path,
        'verification_status', 'PENDING'
    );
END;
$$;

-- 14. Admin Verify Driver RPC (Canonical Audit, Direct Role Lookup, Section 11 & 12)
CREATE OR REPLACE FUNCTION public.admin_verify_driver(
    p_actor_id UUID,
    p_driver_id UUID,
    p_decision TEXT,
    p_rejection_reason TEXT DEFAULT NULL,
    p_actor_aal TEXT DEFAULT 'aal1'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_decision TEXT;
    v_clean_reason TEXT;
    v_actor_role TEXT;
    v_current_ver_status TEXT;
    v_current_acc_status TEXT;
    v_mandatory_doc_count BIGINT;
    v_vehicle_count BIGINT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid admin user ID is required';
    END IF;

    -- Direct role lookup from profiles (Section 12)
    SELECT platform_role INTO v_actor_role
    FROM public.profiles
    WHERE id = p_actor_id;

    IF v_actor_role IS NULL OR v_actor_role NOT IN ('super_admin', 'admin', 'verification_agent') THEN
        RAISE EXCEPTION 'AUTH_ADMIN_ROLE_REQUIRED: Only verification_agent, admin or super_admin can verify drivers';
    END IF;

    IF p_actor_aal IS NULL OR p_actor_aal <> 'aal2' THEN
        RAISE EXCEPTION 'AUTH_MFA_REQUIRED: AAL2 MFA is required for administrative verification';
    END IF;

    SELECT verification_status, account_status
    INTO v_current_ver_status, v_current_acc_status
    FROM public.drivers
    WHERE id = p_driver_id;

    IF v_current_ver_status IS NULL THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Driver does not exist';
    END IF;

    v_clean_decision := pg_catalog.upper(pg_catalog.btrim(p_decision));
    IF v_clean_decision NOT IN ('APPROVE', 'REJECT') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Decision must be APPROVE or REJECT';
    END IF;

    IF v_clean_decision = 'APPROVE' THEN
        -- Check vehicle exists (Section 14)
        SELECT count(*) INTO v_vehicle_count
        FROM public.vehicles
        WHERE driver_id = p_driver_id;

        IF v_vehicle_count = 0 THEN
            RAISE EXCEPTION 'VEHICLE_MISSING: Driver must have at least one registered vehicle to be approved';
        END IF;

        -- Check all 3 mandatory documents exist with status PENDING/UNDER_REVIEW/VERIFIED (Section 14)
        SELECT count(DISTINCT document_type) INTO v_mandatory_doc_count
        FROM public.driver_documents
        WHERE driver_id = p_driver_id
          AND document_type IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION')
          AND verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED');

        IF v_mandatory_doc_count < 3 THEN
            RAISE EXCEPTION 'DOCUMENTATION_INCOMPLETE: Driver must have all 3 mandatory documents (NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION)';
        END IF;

        -- Update driver documents to VERIFIED (only active ones)
        UPDATE public.driver_documents
        SET verification_status = 'VERIFIED',
            reviewed_at = NOW(),
            reviewed_by = p_actor_id
        WHERE driver_id = p_driver_id
          AND verification_status IN ('PENDING', 'UNDER_REVIEW');

        -- Update driver record
        UPDATE public.drivers
        SET verification_status = 'VERIFIED',
            account_status = 'ACTIVE',
            updated_at = NOW()
        WHERE id = p_driver_id;

        -- Insert Canonical Audit Log (Section 11)
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
            'decision', 'APPROVE',
            'verification_status', 'VERIFIED',
            'account_status', 'ACTIVE'
        );
    ELSE
        v_clean_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');
        IF v_clean_reason IS NULL THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: rejection_reason is mandatory when rejecting a driver';
        END IF;

        -- Update current active documents to REJECTED (historical preservation, Section 10)
        UPDATE public.driver_documents
        SET verification_status = 'REJECTED',
            reviewed_at = NOW(),
            reviewed_by = p_actor_id
        WHERE driver_id = p_driver_id
          AND verification_status IN ('PENDING', 'UNDER_REVIEW');

        UPDATE public.drivers
        SET verification_status = 'REJECTED',
            updated_at = NOW()
        WHERE id = p_driver_id;

        -- Insert Canonical Audit Log (Section 11)
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
            'decision', 'REJECT',
            'verification_status', 'REJECTED',
            'rejection_reason', v_clean_reason
        );
    END IF;
END;
$$;

-- 15. Execute Idempotent Operation Wrapper (Single Transaction & Advisory Lock, Section 8 & 15)
CREATE OR REPLACE FUNCTION public.execute_idempotent_operation(
    p_actor_user_id UUID,
    p_scope TEXT,
    p_key TEXT,
    p_request_fingerprint TEXT,
    p_operation_fn TEXT,
    p_operation_params JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lock_key BIGINT;
    v_cached RECORD;
    v_result JSONB;
    v_status INTEGER := 200;
    v_expires_at TIMESTAMPTZ;
BEGIN
    IF p_key IS NULL OR p_scope IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: key and scope are required';
    END IF;

    -- Compute stable 64-bit advisory lock key from scope + key
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_scope || ':' || p_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    -- Check if already executed
    SELECT * INTO v_cached
    FROM private.idempotency_responses
    WHERE scope = p_scope AND key = p_key;

    IF v_cached.id IS NOT NULL THEN
        -- Fingerprint validation (Section 7 & 14)
        IF v_cached.request_fingerprint <> p_request_fingerprint THEN
            RAISE EXCEPTION 'IDEMPOTENCY_FINGERPRINT_MISMATCH: Idempotency key reused with different request payload';
        END IF;

        RETURN jsonb_build_object(
            'cached', true,
            'status', v_cached.response_status,
            'body', v_cached.response_body
        );
    END IF;

    -- Execute specific operation
    IF p_operation_fn = 'create_business' THEN
        v_result := public.create_business(
            p_actor_user_id,
            p_operation_params->>'legal_name',
            p_operation_params->>'brand_name',
            p_operation_params->>'tax_id'
        );
        v_status := 201;
    ELSIF p_operation_fn = 'create_business_location' THEN
        v_result := public.create_business_location(
            p_actor_user_id,
            (p_operation_params->>'business_id')::uuid,
            p_operation_params->>'location_name',
            p_operation_params->>'address_text',
            (p_operation_params->>'latitude')::double precision,
            (p_operation_params->>'longitude')::double precision,
            p_operation_params->>'pickup_instructions'
        );
        v_status := 201;
    ELSIF p_operation_fn = 'add_business_member' THEN
        v_result := public.add_business_member(
            p_actor_user_id,
            (p_operation_params->>'business_id')::uuid,
            (p_operation_params->>'target_user_id')::uuid,
            p_operation_params->>'role',
            ARRAY(SELECT jsonb_array_elements_text(p_operation_params->'location_ids')::uuid)
        );
        v_status := 201;
    ELSIF p_operation_fn = 'register_driver' THEN
        v_result := public.register_driver(
            p_actor_user_id,
            p_operation_params->>'national_id_number',
            p_operation_params->>'license_number'
        );
        v_status := 201;
    ELSIF p_operation_fn = 'register_vehicle' THEN
        v_result := public.register_vehicle(
            p_actor_user_id,
            p_operation_params->>'make',
            p_operation_params->>'model',
            (p_operation_params->>'year')::integer,
            p_operation_params->>'color',
            p_operation_params->>'license_plate'
        );
        v_status := 201;
    ELSIF p_operation_fn = 'commit_driver_document' THEN
        v_result := public.commit_driver_document(
            p_actor_user_id,
            (p_operation_params->>'upload_id')::uuid,
            p_operation_params->>'document_type',
            (p_operation_params->>'file_size')::bigint,
            p_operation_params->>'mime_type'
        );
        v_status := 200;
    ELSIF p_operation_fn = 'admin_verify_driver' THEN
        v_result := public.admin_verify_driver(
            p_actor_user_id,
            (p_operation_params->>'driver_id')::uuid,
            p_operation_params->>'decision',
            p_operation_params->>'rejection_reason',
            p_operation_params->>'actor_aal'
        );
        v_status := 200;
    ELSE
        RAISE EXCEPTION 'UNKNOWN_OPERATION: Operation % is not supported', p_operation_fn;
    END IF;

    v_expires_at := NOW() + interval '24 hours';

    -- Atomic persistence into private response cache (Section 8 & 12)
    INSERT INTO private.idempotency_responses (
        actor_user_id,
        scope,
        key,
        request_fingerprint,
        response_status,
        response_body,
        expires_at
    )
    VALUES (
        p_actor_user_id,
        p_scope,
        p_key,
        p_request_fingerprint,
        v_status,
        v_result,
        v_expires_at
    );

    -- Also mirror to canonical public table
    INSERT INTO public.idempotency_keys (
        actor_type,
        actor_user_id,
        scope,
        key,
        request_fingerprint,
        response_status,
        expires_at
    )
    VALUES (
        'user',
        p_actor_user_id,
        p_scope,
        p_key,
        p_request_fingerprint,
        v_status,
        v_expires_at
    )
    ON CONFLICT (scope, key) DO UPDATE SET
        response_status = EXCLUDED.response_status,
        request_fingerprint = EXCLUDED.request_fingerprint;

    RETURN jsonb_build_object(
        'cached', false,
        'status', v_status,
        'body', v_result
    );
END;
$$;

-- 16. Revoke direct execution on all sensitive RPCs from PUBLIC, anon, and authenticated (Section 13)
REVOKE EXECUTE ON FUNCTION public.create_business(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_business_location(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_business_member(UUID, UUID, UUID, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_driver(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_vehicle(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.authorize_driver_document_upload(UUID, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_driver_document(UUID, UUID, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_verify_driver(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;

-- Grant EXECUTE to service_role only
GRANT EXECUTE ON FUNCTION public.create_business(UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_business_location(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_business_member(UUID, UUID, UUID, TEXT, UUID[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_driver(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_vehicle(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.authorize_driver_document_upload(UUID, TEXT, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_driver_document(UUID, UUID, TEXT, BIGINT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_verify_driver(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

COMMIT;
