-- Migration: Phase 3 — B2B Onboarding, Driver Registration, Secure Storage, and Admin Verification Queue (v1.1 Corrections)

-- 1. Idempotency Keys Table (Race-safe & Transactional)
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
    key TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_status INTEGER,
    response_body JSONB,
    locked_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON public.idempotency_keys(created_at);
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- 2. Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Admins / Verification agents can view audit logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.audit_logs;
CREATE POLICY "Admins can view audit logs"
    ON public.audit_logs FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.id = (SELECT auth.uid())
            AND p.platform_role IN ('super_admin', 'admin', 'operator', 'verification_agent')
        )
    );

GRANT SELECT ON TABLE public.audit_logs TO authenticated;

-- 3. Storage Bucket: driver-documents (Private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'driver-documents',
    'driver-documents',
    false,
    10485760, -- 10MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage Policies for driver-documents: strict RLS blocking bypass
DROP POLICY IF EXISTS "Drivers can upload own documents" ON storage.objects;
CREATE POLICY "Drivers can upload own documents"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'driver-documents'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

DROP POLICY IF EXISTS "Drivers and Admins can view driver documents" ON storage.objects;
CREATE POLICY "Drivers and Admins can view driver documents"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'driver-documents'
        AND (
            (storage.foldername(name))[1] = (SELECT auth.uid())::text
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = (SELECT auth.uid())
                AND p.platform_role IN ('super_admin', 'admin', 'verification_agent')
            )
        )
    );

DROP POLICY IF EXISTS "Drivers can update own documents" ON storage.objects;
CREATE POLICY "Drivers can update own documents"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'driver-documents'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    );

-- 4. Partial Unique Index on Driver Documents (Active Documents Unique per Type)
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_documents_active_type 
ON public.driver_documents (driver_id, document_type) 
WHERE (verification_status != 'REJECTED');

-- 5. Idempotency Lock Helpers (Service Role Only)
CREATE OR REPLACE FUNCTION public.acquire_idempotency_lock(
    p_user_id UUID,
    p_key TEXT,
    p_endpoint TEXT,
    p_request_hash TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT * INTO v_rec
    FROM public.idempotency_keys
    WHERE user_id = p_user_id AND key = p_key
    FOR UPDATE;

    IF FOUND THEN
        IF v_rec.response_status IS NOT NULL THEN
            IF v_rec.request_hash <> p_request_hash THEN
                RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT: Key was already used with a different request payload';
            END IF;
            RETURN jsonb_build_object(
                'status', 'CACHED',
                'response_status', v_rec.response_status,
                'response_body', v_rec.response_body
            );
        END IF;

        -- Check if request is currently processing and lock is recent (< 30s)
        IF v_rec.locked_at > pg_catalog.now() - INTERVAL '30 seconds' THEN
            RAISE EXCEPTION 'REQUEST_IN_PROGRESS: Request with this idempotency key is currently processing';
        ELSE
            -- Stale lock recovery
            UPDATE public.idempotency_keys
            SET locked_at = pg_catalog.now(),
                request_hash = p_request_hash,
                endpoint = p_endpoint
            WHERE user_id = p_user_id AND key = p_key;

            RETURN jsonb_build_object('status', 'ACQUIRED');
        END IF;
    END IF;

    -- Insert new idempotency lock
    INSERT INTO public.idempotency_keys (
        user_id,
        key,
        endpoint,
        request_hash,
        locked_at
    )
    VALUES (
        p_user_id,
        p_key,
        p_endpoint,
        p_request_hash,
        pg_catalog.now()
    );

    RETURN jsonb_build_object('status', 'ACQUIRED');
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_idempotency_response(
    p_user_id UUID,
    p_key TEXT,
    p_response_status INTEGER,
    p_response_body JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.idempotency_keys
    SET response_status = p_response_status,
        response_body = p_response_body
    WHERE user_id = p_user_id AND key = p_key;
END;
$$;

-- 6. Business Creation RPC (Separated from Location)
CREATE OR REPLACE FUNCTION public.create_business(
    p_actor_id UUID,
    p_legal_name TEXT,
    p_brand_name TEXT,
    p_tax_id TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_legal_name TEXT;
    v_clean_brand_name TEXT;
    v_clean_tax_id TEXT;
    v_business_id UUID;
    v_member_id UUID;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    v_clean_legal_name := pg_catalog.nullif(pg_catalog.trim(p_legal_name), '');
    v_clean_brand_name := pg_catalog.nullif(pg_catalog.trim(p_brand_name), '');
    v_clean_tax_id := pg_catalog.nullif(pg_catalog.trim(p_tax_id), '');

    IF v_clean_legal_name IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: legal_name is required';
    END IF;
    IF v_clean_brand_name IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: brand_name is required';
    END IF;
    IF v_clean_tax_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: tax_id is required';
    END IF;

    -- Check if user is already an active member of any business
    IF EXISTS (
        SELECT 1 FROM public.business_members bm
        WHERE bm.user_id = p_actor_id AND bm.status = 'ACTIVE'
    ) THEN
        RAISE EXCEPTION 'ALREADY_REGISTERED: User is already an active member of a business';
    END IF;

    -- Check if tax_id already exists
    IF EXISTS (
        SELECT 1 FROM public.businesses b
        WHERE b.tax_id = v_clean_tax_id
    ) THEN
        RAISE EXCEPTION 'TAX_ID_EXISTS: A business with this tax_id is already registered';
    END IF;

    -- 1. Create Business with verification_status = 'PENDING'
    INSERT INTO public.businesses (
        legal_name,
        brand_name,
        tax_id,
        verification_status,
        account_status
    )
    VALUES (
        v_clean_legal_name,
        v_clean_brand_name,
        v_clean_tax_id,
        'PENDING',
        'ACTIVE'
    )
    RETURNING id INTO v_business_id;

    -- 2. Create Business Owner Member
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
        'member_id', v_member_id,
        'legal_name', v_clean_legal_name,
        'brand_name', v_clean_brand_name,
        'tax_id', v_clean_tax_id,
        'verification_status', 'PENDING',
        'account_status', 'ACTIVE'
    );
END;
$$;

-- 7. Business Location Creation RPC
CREATE OR REPLACE FUNCTION public.create_business_location(
    p_actor_id UUID,
    p_business_id UUID,
    p_name TEXT,
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
    v_member_id UUID;
    v_member_role TEXT;
    v_clean_name TEXT;
    v_clean_address TEXT;
    v_location_id UUID;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    -- Check authorization
    SELECT id, role INTO v_member_id, v_member_role
    FROM public.business_members
    WHERE business_id = p_business_id AND user_id = p_actor_id AND status = 'ACTIVE';

    IF v_member_id IS NULL OR v_member_role NOT IN ('business_owner', 'business_manager') THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MEMBER: Only active business owners or managers can create branch locations';
    END IF;

    v_clean_name := pg_catalog.nullif(pg_catalog.trim(p_name), '');
    v_clean_address := pg_catalog.nullif(pg_catalog.trim(p_address_text), '');

    IF v_clean_name IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: branch name is required';
    END IF;
    IF v_clean_address IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: address_text is required';
    END IF;

    IF p_latitude IS NULL OR p_latitude < -90 OR p_latitude > 90 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: latitude must be between -90 and 90';
    END IF;
    IF p_longitude IS NULL OR p_longitude < -180 OR p_longitude > 180 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: longitude must be between -180 and 180';
    END IF;

    -- Insert Location
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
        v_clean_address,
        extensions.ST_SetSRID(extensions.ST_MakePoint(p_longitude, p_latitude), 4326)::extensions.geography,
        pg_catalog.nullif(pg_catalog.trim(p_pickup_instructions), ''),
        true
    )
    RETURNING id INTO v_location_id;

    -- Link creator to location
    INSERT INTO public.business_member_locations (
        business_member_id,
        business_location_id
    )
    VALUES (
        v_member_id,
        v_location_id
    )
    ON CONFLICT (business_member_id, business_location_id) DO NOTHING;

    RETURN jsonb_build_object(
        'location_id', v_location_id,
        'business_id', p_business_id,
        'name', v_clean_name,
        'address_text', v_clean_address
    );
END;
$$;

-- 8. Business Member Management RPC (N:M Scope Support)
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
    v_actor_role TEXT;
    v_clean_role TEXT;
    v_member_id UUID;
    v_loc_id UUID;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    -- Only business_owner can add members
    SELECT role INTO v_actor_role
    FROM public.business_members
    WHERE business_id = p_business_id AND user_id = p_actor_id AND status = 'ACTIVE';

    IF v_actor_role IS NULL OR v_actor_role <> 'business_owner' THEN
        RAISE EXCEPTION 'UNAUTHORIZED_MEMBER: Only the business owner can add members';
    END IF;

    v_clean_role := pg_catalog.nullif(pg_catalog.trim(p_role), '');
    IF v_clean_role NOT IN ('business_manager', 'business_employee') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: role must be business_manager or business_employee';
    END IF;

    -- Check if target user is already a member
    IF EXISTS (
        SELECT 1 FROM public.business_members
        WHERE business_id = p_business_id AND user_id = p_target_user_id
    ) THEN
        RAISE EXCEPTION 'MEMBER_ALREADY_EXISTS: User is already a member of this business';
    END IF;

    -- Create member
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

    -- Associate N:M locations
    IF p_location_ids IS NOT NULL AND pg_catalog.array_length(p_location_ids, 1) > 0 THEN
        FOREACH v_loc_id IN ARRAY p_location_ids LOOP
            -- Verify location belongs to business
            IF EXISTS (SELECT 1 FROM public.business_locations WHERE id = v_loc_id AND business_id = p_business_id) THEN
                INSERT INTO public.business_member_locations (business_member_id, business_location_id)
                VALUES (v_member_id, v_loc_id)
                ON CONFLICT (business_member_id, business_location_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    RETURN jsonb_build_object(
        'member_id', v_member_id,
        'business_id', p_business_id,
        'user_id', p_target_user_id,
        'role', v_clean_role,
        'location_ids', p_location_ids
    );
END;
$$;

-- 9. Driver Registration RPC (Separated from Vehicle)
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

    v_clean_nid := pg_catalog.nullif(pg_catalog.trim(p_national_id_number), '');
    v_clean_lic := pg_catalog.nullif(pg_catalog.trim(p_license_number), '');

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
    );

    RETURN jsonb_build_object(
        'driver_id', p_actor_id,
        'verification_status', 'PENDING',
        'account_status', 'REGISTERED',
        'operational_state', 'OFFLINE'
    );
END;
$$;

-- 10. Vehicle Registration RPC (Separated Step)
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
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.drivers WHERE id = p_actor_id) THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Driver must register personal profile before registering vehicle';
    END IF;

    v_clean_make := pg_catalog.nullif(pg_catalog.trim(p_make), '');
    v_clean_model := pg_catalog.nullif(pg_catalog.trim(p_model), '');
    v_clean_color := pg_catalog.nullif(pg_catalog.trim(p_color), '');
    v_clean_plate := pg_catalog.nullif(pg_catalog.upper(pg_catalog.trim(p_license_plate)), '');

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
        RAISE EXCEPTION 'LICENSE_PLATE_EXISTS: Vehicle license plate is already registered';
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

-- 11. Driver Document Commit RPC
CREATE OR REPLACE FUNCTION public.commit_driver_document(
    p_actor_id UUID,
    p_document_type TEXT,
    p_storage_path TEXT,
    p_file_size BIGINT,
    p_mime_type TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_clean_type TEXT;
    v_clean_path TEXT;
    v_current_driver_status TEXT;
    v_doc_id UUID;
    v_expected_prefix TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    SELECT verification_status INTO v_current_driver_status
    FROM public.drivers
    WHERE id = p_actor_id;

    IF v_current_driver_status IS NULL THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Driver profile must exist before committing documents';
    END IF;

    v_clean_type := pg_catalog.upper(pg_catalog.trim(p_document_type));
    v_clean_path := pg_catalog.trim(p_storage_path);

    IF v_clean_type NOT IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'CRIMINAL_RECORD', 'INSURANCE') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid document_type';
    END IF;

    IF v_clean_path IS NULL OR v_clean_path = '' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: storage_path is required';
    END IF;

    -- Enforce actor folder prefix
    v_expected_prefix := p_actor_id::text || '/';
    IF NOT (v_clean_path LIKE v_expected_prefix || '%') THEN
        RAISE EXCEPTION 'INVALID_STORAGE_PATH: Storage path must reside within actor driver directory';
    END IF;

    IF p_file_size IS NULL OR p_file_size <= 0 OR p_file_size > 10485760 THEN
        RAISE EXCEPTION 'INVALID_FILE_SIZE: File size must be between 1 byte and 10MB';
    END IF;

    IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
        RAISE EXCEPTION 'INVALID_MIME_TYPE: File MIME type must be JPEG, PNG, WEBP or PDF';
    END IF;

    -- Upsert active document
    IF EXISTS (
        SELECT 1 FROM public.driver_documents
        WHERE driver_id = p_actor_id AND document_type = v_clean_type AND verification_status != 'REJECTED'
    ) THEN
        UPDATE public.driver_documents
        SET storage_path = v_clean_path,
            verification_status = 'PENDING',
            rejection_reason = NULL,
            created_at = pg_catalog.now()
        WHERE driver_id = p_actor_id AND document_type = v_clean_type AND verification_status != 'REJECTED'
        RETURNING id INTO v_doc_id;
    ELSE
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
            v_clean_path,
            'PENDING',
            NULL
        )
        RETURNING id INTO v_doc_id;
    END IF;

    -- If driver was REJECTED, reset driver to PENDING
    IF v_current_driver_status = 'REJECTED' THEN
        UPDATE public.drivers
        SET verification_status = 'PENDING'
        WHERE id = p_actor_id;
    END IF;

    RETURN jsonb_build_object(
        'document_id', v_doc_id,
        'driver_id', p_actor_id,
        'document_type', v_clean_type,
        'storage_path', v_clean_path,
        'verification_status', 'PENDING'
    );
END;
$$;

-- 12. Admin Driver Verification RPC
CREATE OR REPLACE FUNCTION public.admin_verify_driver(
    p_actor_id UUID,
    p_driver_id UUID,
    p_decision TEXT,
    p_rejection_reason TEXT DEFAULT NULL,
    p_actor_role TEXT DEFAULT NULL,
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
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Authentication required';
    END IF;

    -- Check platform role
    IF p_actor_role IS NULL OR p_actor_role NOT IN ('super_admin', 'admin', 'verification_agent') THEN
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

    v_clean_decision := pg_catalog.upper(pg_catalog.trim(p_decision));
    v_clean_reason := pg_catalog.nullif(pg_catalog.trim(p_rejection_reason), '');

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
          AND verification_status != 'REJECTED';

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

        UPDATE public.driver_documents
        SET verification_status = 'VERIFIED',
            rejection_reason = NULL
        WHERE driver_id = p_driver_id AND verification_status = 'PENDING';

        -- Canonical audit action: DRIVER_VERIFIED (Priority 21)
        INSERT INTO public.audit_logs (
            actor_id,
            action,
            entity_type,
            entity_id,
            metadata
        )
        VALUES (
            p_actor_id,
            'DRIVER_VERIFIED',
            'driver',
            p_driver_id,
            jsonb_build_object('decision', 'APPROVE', 'actor_role', p_actor_role)
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

        -- Transition to REJECTED + REGISTERED
        UPDATE public.drivers
        SET verification_status = 'REJECTED',
            account_status = 'REGISTERED'
        WHERE id = p_driver_id;

        UPDATE public.driver_documents
        SET verification_status = 'REJECTED',
            rejection_reason = v_clean_reason
        WHERE driver_id = p_driver_id AND verification_status = 'PENDING';

        -- Canonical audit action: DRIVER_REJECTED (Priority 21)
        INSERT INTO public.audit_logs (
            actor_id,
            action,
            entity_type,
            entity_id,
            reason,
            metadata
        )
        VALUES (
            p_actor_id,
            'DRIVER_REJECTED',
            'driver',
            p_driver_id,
            v_clean_reason,
            jsonb_build_object('decision', 'REJECT', 'actor_role', p_actor_role)
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

-- 13. Revoke direct execution from PUBLIC, anon, and authenticated (Priority 3, 5)
REVOKE EXECUTE ON FUNCTION public.acquire_idempotency_lock FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_idempotency_response FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_business FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_business_location FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_business_member FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_driver FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_vehicle FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_driver_document FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_verify_driver FROM PUBLIC, anon, authenticated;

-- Grant execution exclusively to service_role (used by Edge Function api-v1)
GRANT EXECUTE ON FUNCTION public.acquire_idempotency_lock TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_idempotency_response TO service_role;
GRANT EXECUTE ON FUNCTION public.create_business TO service_role;
GRANT EXECUTE ON FUNCTION public.create_business_location TO service_role;
GRANT EXECUTE ON FUNCTION public.add_business_member TO service_role;
GRANT EXECUTE ON FUNCTION public.register_driver TO service_role;
GRANT EXECUTE ON FUNCTION public.register_vehicle TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_driver_document TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_verify_driver TO service_role;
