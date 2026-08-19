-- Migration: Phase 3 — B2B Onboarding, Driver Registration, Secure Storage, and Admin Verification Queue

-- 1. Audit Logs Table (if not exists)
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
            WHERE p.id = auth.uid()
            AND p.platform_role IN ('super_admin', 'admin', 'operator', 'verification_agent')
        )
    );

GRANT SELECT ON TABLE public.audit_logs TO authenticated;

-- 2. Storage Bucket: driver-documents (Private)
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

-- Storage Policies for driver-documents
DROP POLICY IF EXISTS "Drivers can upload own documents" ON storage.objects;
CREATE POLICY "Drivers can upload own documents"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'driver-documents'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS "Drivers and Admins can view driver documents" ON storage.objects;
CREATE POLICY "Drivers and Admins can view driver documents"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'driver-documents'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR EXISTS (
                SELECT 1 FROM public.profiles p
                WHERE p.id = auth.uid()
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
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- 3. Business Onboarding RPC
CREATE OR REPLACE FUNCTION public.register_business_onboarding(
    p_legal_name text,
    p_brand_name text,
    p_tax_id text,
    p_branch_name text,
    p_branch_address text,
    p_branch_latitude double precision,
    p_branch_longitude double precision,
    p_pickup_instructions text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_user_id UUID;
    v_business_id UUID;
    v_member_id UUID;
    v_location_id UUID;
    v_clean_legal_name TEXT;
    v_clean_brand_name TEXT;
    v_clean_tax_id TEXT;
    v_clean_branch_name TEXT;
    v_clean_address TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: User must be authenticated to register a business';
    END IF;

    -- Clean & Validate inputs
    v_clean_legal_name := NULLIF(TRIM(p_legal_name), '');
    v_clean_brand_name := NULLIF(TRIM(p_brand_name), '');
    v_clean_tax_id := NULLIF(TRIM(p_tax_id), '');
    v_clean_branch_name := NULLIF(TRIM(p_branch_name), '');
    v_clean_address := NULLIF(TRIM(p_branch_address), '');

    IF v_clean_legal_name IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: legal_name is required';
    END IF;
    IF v_clean_brand_name IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: brand_name is required';
    END IF;
    IF v_clean_tax_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: tax_id is required';
    END IF;
    IF v_clean_branch_name IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: branch_name is required';
    END IF;
    IF v_clean_address IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: branch_address is required';
    END IF;

    IF p_branch_latitude IS NULL OR p_branch_latitude < -90 OR p_branch_latitude > 90 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: branch_latitude must be between -90 and 90';
    END IF;
    IF p_branch_longitude IS NULL OR p_branch_longitude < -180 OR p_branch_longitude > 180 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: branch_longitude must be between -180 and 180';
    END IF;

    -- Check if user is already an active member of any business
    IF EXISTS (
        SELECT 1 FROM public.business_members bm
        WHERE bm.user_id = v_user_id AND bm.status = 'ACTIVE'
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

    -- 1. Create Business
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
        'NOT_REQUIRED',
        'ACTIVE'
    )
    RETURNING id INTO v_business_id;

    -- 2. Create Business Member (Owner)
    INSERT INTO public.business_members (
        business_id,
        user_id,
        role,
        status
    )
    VALUES (
        v_business_id,
        v_user_id,
        'business_owner',
        'ACTIVE'
    )
    RETURNING id INTO v_member_id;

    -- 3. Create First Required Location
    INSERT INTO public.business_locations (
        business_id,
        name,
        address_text,
        location,
        pickup_instructions,
        is_active
    )
    VALUES (
        v_business_id,
        v_clean_branch_name,
        v_clean_address,
        extensions.ST_SetSRID(extensions.ST_MakePoint(p_branch_longitude, p_branch_latitude), 4326)::extensions.geography,
        NULLIF(TRIM(p_pickup_instructions), ''),
        true
    )
    RETURNING id INTO v_location_id;

    -- 4. Scope N:M Association
    INSERT INTO public.business_member_locations (
        business_member_id,
        business_location_id
    )
    VALUES (
        v_member_id,
        v_location_id
    );

    RETURN jsonb_build_object(
        'business_id', v_business_id,
        'member_id', v_member_id,
        'location_id', v_location_id,
        'legal_name', v_clean_legal_name,
        'brand_name', v_clean_brand_name,
        'tax_id', v_clean_tax_id,
        'role', 'business_owner',
        'status', 'ACTIVE'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_business_onboarding FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_business_onboarding TO authenticated;

-- 4. Driver Onboarding RPC
CREATE OR REPLACE FUNCTION public.register_driver_onboarding(
    p_national_id_number text,
    p_license_number text,
    p_vehicle_make text,
    p_vehicle_model text,
    p_vehicle_year integer,
    p_vehicle_color text,
    p_vehicle_license_plate text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_vehicle_id UUID;
    v_clean_nid TEXT;
    v_clean_lic TEXT;
    v_clean_make TEXT;
    v_clean_model TEXT;
    v_clean_color TEXT;
    v_clean_plate TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: User must be authenticated to register as driver';
    END IF;

    -- Clean & Validate inputs
    v_clean_nid := NULLIF(TRIM(p_national_id_number), '');
    v_clean_lic := NULLIF(TRIM(p_license_number), '');
    v_clean_make := NULLIF(TRIM(p_vehicle_make), '');
    v_clean_model := NULLIF(TRIM(p_vehicle_model), '');
    v_clean_color := NULLIF(TRIM(p_vehicle_color), '');
    v_clean_plate := NULLIF(UPPER(TRIM(p_vehicle_license_plate)), '');

    IF v_clean_nid IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: national_id_number is required';
    END IF;
    IF v_clean_lic IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: license_number is required';
    END IF;
    IF v_clean_make IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: vehicle_make is required';
    END IF;
    IF v_clean_model IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: vehicle_model is required';
    END IF;
    IF p_vehicle_year IS NULL OR p_vehicle_year < 1980 OR p_vehicle_year > EXTRACT(YEAR FROM NOW()) + 1 THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: vehicle_year is invalid';
    END IF;
    IF v_clean_color IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: vehicle_color is required';
    END IF;
    IF v_clean_plate IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: vehicle_license_plate is required';
    END IF;

    -- Check if user is already registered as driver
    IF EXISTS (
        SELECT 1 FROM public.drivers d
        WHERE d.id = v_user_id
    ) THEN
        RAISE EXCEPTION 'ALREADY_REGISTERED: User is already registered as a driver';
    END IF;

    -- Check if national_id_number or license_number or plate already exists
    IF EXISTS (SELECT 1 FROM public.drivers WHERE national_id_number = v_clean_nid) THEN
        RAISE EXCEPTION 'NATIONAL_ID_EXISTS: National ID number is already registered';
    END IF;
    IF EXISTS (SELECT 1 FROM public.drivers WHERE license_number = v_clean_lic) THEN
        RAISE EXCEPTION 'LICENSE_EXISTS: Driver license number is already registered';
    END IF;
    IF EXISTS (SELECT 1 FROM public.vehicles WHERE license_plate = v_clean_plate) THEN
        RAISE EXCEPTION 'LICENSE_PLATE_EXISTS: Vehicle license plate is already registered';
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
        v_user_id,
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
        v_user_id,
        'OFFLINE',
        NULL,
        NULL
    );

    -- 3. Create Initial Vehicle
    INSERT INTO public.vehicles (
        driver_id,
        make,
        model,
        year,
        color,
        license_plate
    )
    VALUES (
        v_user_id,
        v_clean_make,
        v_clean_model,
        p_vehicle_year,
        v_clean_color,
        v_clean_plate
    )
    RETURNING id INTO v_vehicle_id;

    RETURN jsonb_build_object(
        'driver_id', v_user_id,
        'vehicle_id', v_vehicle_id,
        'verification_status', 'PENDING',
        'account_status', 'REGISTERED',
        'operational_state', 'OFFLINE'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_driver_onboarding FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_driver_onboarding TO authenticated;

-- 5. Driver Document Submission RPC
CREATE OR REPLACE FUNCTION public.submit_driver_document(
    p_document_type text,
    p_storage_path text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
    v_doc_id UUID;
    v_clean_type TEXT;
    v_clean_path TEXT;
    v_current_driver_status TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: User must be authenticated to upload documents';
    END IF;

    -- Check driver existence
    SELECT verification_status INTO v_current_driver_status
    FROM public.drivers
    WHERE id = v_user_id;

    IF v_current_driver_status IS NULL THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Driver profile must be created before uploading documents';
    END IF;

    v_clean_type := UPPER(TRIM(p_document_type));
    v_clean_path := TRIM(p_storage_path);

    IF v_clean_type NOT IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'CRIMINAL_RECORD', 'INSURANCE') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid document_type';
    END IF;
    IF v_clean_path IS NULL OR v_clean_path = '' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: storage_path is required';
    END IF;

    -- Insert or update document
    INSERT INTO public.driver_documents (
        driver_id,
        document_type,
        storage_path,
        verification_status,
        rejection_reason
    )
    VALUES (
        v_user_id,
        v_clean_type,
        v_clean_path,
        'PENDING',
        NULL
    )
    RETURNING id INTO v_doc_id;

    -- If driver was REJECTED, transition driver back to PENDING for review queue
    IF v_current_driver_status = 'REJECTED' THEN
        UPDATE public.drivers
        SET verification_status = 'PENDING'
        WHERE id = v_user_id;
    END IF;

    RETURN jsonb_build_object(
        'document_id', v_doc_id,
        'driver_id', v_user_id,
        'document_type', v_clean_type,
        'storage_path', v_clean_path,
        'verification_status', 'PENDING'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_driver_document FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_driver_document TO authenticated;

-- 6. Admin Verification RPC
CREATE OR REPLACE FUNCTION public.admin_verify_driver(
    p_driver_id uuid,
    p_decision text,
    p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_id UUID;
    v_actor_role TEXT;
    v_actor_aal TEXT;
    v_clean_decision TEXT;
    v_clean_reason TEXT;
    v_driver_exists BOOLEAN;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Authentication required';
    END IF;

    -- Verify platform role
    SELECT platform_role INTO v_actor_role
    FROM public.profiles
    WHERE id = v_actor_id;

    IF v_actor_role IS NULL OR v_actor_role NOT IN ('super_admin', 'admin', 'verification_agent') THEN
        RAISE EXCEPTION 'AUTH_ADMIN_ROLE_REQUIRED: Only verification_agent, admin or super_admin can verify drivers';
    END IF;

    -- Verify MFA AAL level
    v_actor_aal := auth.jwt() ->> 'aal';
    IF v_actor_aal IS NULL OR v_actor_aal <> 'aal2' THEN
        RAISE EXCEPTION 'AUTH_MFA_REQUIRED: AAL2 MFA is required for administrative verification';
    END IF;

    -- Check target driver existence
    SELECT EXISTS (SELECT 1 FROM public.drivers WHERE id = p_driver_id) INTO v_driver_exists;
    IF NOT v_driver_exists THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Target driver does not exist';
    END IF;

    v_clean_decision := UPPER(TRIM(p_decision));
    v_clean_reason := NULLIF(TRIM(p_rejection_reason), '');

    IF v_clean_decision = 'APPROVE' THEN
        -- Transition to VERIFIED + ACTIVE + OFFLINE
        UPDATE public.drivers
        SET
            verification_status = 'VERIFIED',
            account_status = 'ACTIVE'
        WHERE id = p_driver_id;

        UPDATE public.driver_presence
        SET operational_state = 'OFFLINE'
        WHERE driver_id = p_driver_id;

        UPDATE public.driver_documents
        SET
            verification_status = 'VERIFIED',
            rejection_reason = NULL
        WHERE driver_id = p_driver_id;

        INSERT INTO public.audit_logs (
            actor_id,
            action,
            entity_type,
            entity_id,
            metadata
        )
        VALUES (
            v_actor_id,
            'DRIVER_VERIFICATION_APPROVED',
            'driver',
            p_driver_id,
            jsonb_build_object('decision', 'APPROVE', 'actor_role', v_actor_role)
        );

        RETURN jsonb_build_object(
            'driver_id', p_driver_id,
            'verification_status', 'VERIFIED',
            'account_status', 'ACTIVE',
            'operational_state', 'OFFLINE'
        );

    ELSIF v_clean_decision = 'REJECT' THEN
        IF v_clean_reason IS NULL THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: rejection_reason is required when rejecting driver';
        END IF;

        -- Transition to REJECTED + REGISTERED
        UPDATE public.drivers
        SET
            verification_status = 'REJECTED',
            account_status = 'REGISTERED'
        WHERE id = p_driver_id;

        UPDATE public.driver_documents
        SET
            verification_status = 'REJECTED',
            rejection_reason = v_clean_reason
        WHERE driver_id = p_driver_id AND verification_status = 'PENDING';

        INSERT INTO public.audit_logs (
            actor_id,
            action,
            entity_type,
            entity_id,
            reason,
            metadata
        )
        VALUES (
            v_actor_id,
            'DRIVER_VERIFICATION_REJECTED',
            'driver',
            p_driver_id,
            v_clean_reason,
            jsonb_build_object('decision', 'REJECT', 'actor_role', v_actor_role)
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

REVOKE EXECUTE ON FUNCTION public.admin_verify_driver FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_verify_driver TO authenticated;
