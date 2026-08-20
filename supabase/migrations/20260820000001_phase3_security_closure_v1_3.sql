-- ============================================================================
-- Migration: 20260820000001_phase3_security_closure_v1_3.sql
-- Description: Phase 3 Security & Real Evidence Closure v1.3
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Update check constraints on private.driver_document_upload_authorizations
-- ----------------------------------------------------------------------------

ALTER TABLE private.driver_document_upload_authorizations
    DROP CONSTRAINT IF EXISTS driver_document_upload_authorizations_document_type_check;

ALTER TABLE private.driver_document_upload_authorizations
    ADD CONSTRAINT driver_document_upload_authorizations_document_type_check
    CHECK (document_type IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'CRIMINAL_RECORD', 'INSURANCE'));

-- ----------------------------------------------------------------------------
-- 1. Idempotency Engine with Enforced 24h Expiry & Atomic Handling
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.execute_idempotent_operation(
    p_actor_user_id UUID,
    p_scope TEXT,
    p_key TEXT,
    p_request_fingerprint TEXT,
    p_operation_fn TEXT,
    p_operation_params JSONB
)
RETURNS JSONB
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
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor user ID is required';
    END IF;

    IF p_key IS NULL OR p_scope IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: key and scope are required';
    END IF;

    IF p_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Idempotency key must be a valid UUID v4';
    END IF;

    -- Generate consistent 64-bit advisory lock key from scope + key
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_scope || ':' || p_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    -- Check if record exists in private.idempotency_responses
    SELECT * INTO v_cached
    FROM private.idempotency_responses
    WHERE scope = p_scope AND key = p_key;

    IF v_cached.id IS NOT NULL THEN
        -- If expired (expires_at <= now()), purge expired record and proceed as fresh operation (Section 15)
        IF v_cached.expires_at <= pg_catalog.clock_timestamp() THEN
            DELETE FROM private.idempotency_responses WHERE id = v_cached.id;
            DELETE FROM public.idempotency_keys WHERE scope = p_scope AND key = p_key;
            v_cached := NULL;
        ELSE
            -- Validate fingerprint
            IF v_cached.request_fingerprint <> p_request_fingerprint THEN
                RAISE EXCEPTION 'IDEMPOTENCY_FINGERPRINT_MISMATCH: Request payload fingerprint does not match original request';
            END IF;

            RETURN jsonb_build_object(
                'cached', true,
                'status', v_cached.response_status,
                'body', v_cached.response_body
            );
        END IF;
    END IF;

    -- Execute target operation dynamically
    IF p_operation_fn IN ('create_business') THEN
        v_result := public.create_business(
            p_actor_user_id,
            p_operation_params->>'legal_name',
            p_operation_params->>'brand_name',
            p_operation_params->>'tax_id'
        );
        v_status := 201;

    ELSIF p_operation_fn IN ('create_business_location') THEN
        v_result := public.create_business_location(
            p_actor_user_id,
            (p_operation_params->>'business_id')::uuid,
            COALESCE(p_operation_params->>'location_name', p_operation_params->>'name'),
            COALESCE(p_operation_params->>'address_text', p_operation_params->>'address_line_1'),
            (p_operation_params->>'latitude')::double precision,
            (p_operation_params->>'longitude')::double precision,
            p_operation_params->>'pickup_instructions'
        );
        v_status := 201;

    ELSIF p_operation_fn IN ('add_business_member', 'create_business_member') THEN
        v_result := public.add_business_member(
            p_actor_user_id,
            (p_operation_params->>'business_id')::uuid,
            (p_operation_params->>'target_user_id')::uuid,
            p_operation_params->>'role',
            CASE 
                WHEN p_operation_params->'location_ids' IS NOT NULL AND jsonb_typeof(p_operation_params->'location_ids') = 'array' 
                THEN ARRAY(SELECT jsonb_array_elements_text(p_operation_params->'location_ids')::uuid)
                WHEN p_operation_params->'authorized_location_ids' IS NOT NULL AND jsonb_typeof(p_operation_params->'authorized_location_ids') = 'array' 
                THEN ARRAY(SELECT jsonb_array_elements_text(p_operation_params->'authorized_location_ids')::uuid)
                ELSE ARRAY[]::uuid[]
            END
        );
        v_status := 201;

    ELSIF p_operation_fn IN ('register_driver', 'create_driver_profile') THEN
        v_result := public.register_driver(
            p_actor_user_id,
            p_operation_params->>'national_id_number',
            p_operation_params->>'license_number'
        );
        v_status := 201;

    ELSIF p_operation_fn IN ('register_vehicle', 'create_driver_vehicle') THEN
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
            p_operation_params->>'document_type'
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
        RAISE EXCEPTION 'INVALID_ARGUMENT: Unknown operation function %', p_operation_fn;
    END IF;

    v_expires_at := pg_catalog.clock_timestamp() + INTERVAL '24 hours';

    -- Store idempotent response with 24h TTL in private schema
    INSERT INTO private.idempotency_responses (
        actor_user_id,
        scope,
        key,
        request_fingerprint,
        response_status,
        response_body,
        expires_at
    ) VALUES (
        p_actor_user_id,
        p_scope,
        p_key,
        p_request_fingerprint,
        v_status,
        v_result,
        v_expires_at
    );

    -- Also record in public.idempotency_keys for tracking and public RLS compliance
    INSERT INTO public.idempotency_keys (
        actor_type,
        actor_user_id,
        scope,
        key,
        request_fingerprint,
        response_status,
        response_body_ref,
        expires_at
    ) VALUES (
        'user',
        p_actor_user_id,
        p_scope,
        p_key,
        p_request_fingerprint,
        v_status,
        p_scope || ':' || p_key,
        v_expires_at
    )
    ON CONFLICT (scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body_ref = EXCLUDED.response_body_ref,
        expires_at = EXCLUDED.expires_at;

    RETURN jsonb_build_object(
        'cached', false,
        'status', v_status,
        'body', v_result
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 2. Driver Document Commit with Real Storage Verification
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commit_driver_document(
    p_actor_id UUID,
    p_upload_id UUID,
    p_document_type TEXT,
    p_file_size BIGINT DEFAULT NULL,
    p_mime_type TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_auth_record RECORD;
    v_clean_type TEXT;
    v_storage_obj RECORD;
    v_obj_size BIGINT;
    v_obj_mime TEXT;
    v_doc_id UUID;
    v_active_exists BOOLEAN;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Valid actor user ID is required';
    END IF;

    IF p_upload_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: upload_id is required';
    END IF;

    v_clean_type := pg_catalog.upper(pg_catalog.btrim(p_document_type));
    IF v_clean_type NOT IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'CRIMINAL_RECORD', 'INSURANCE') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Invalid document_type %', p_document_type;
    END IF;

    -- 1. Query upload authorization in private schema
    SELECT * INTO v_auth_record
    FROM private.driver_document_upload_authorizations
    WHERE upload_id = p_upload_id;

    IF v_auth_record.id IS NULL THEN
        RAISE EXCEPTION 'UPLOAD_UNVERIFIED: Upload authorization not found';
    END IF;

    -- 2. Validate actor ownership
    IF v_auth_record.driver_id <> p_actor_id THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: Upload authorization belongs to another driver';
    END IF;

    -- 3. Validate document type matches authorization
    IF pg_catalog.upper(pg_catalog.btrim(v_auth_record.document_type)) <> v_clean_type THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Document type does not match authorization';
    END IF;

    -- 4. Check Güegüense 15m authorization window expiration
    IF v_auth_record.expires_at < pg_catalog.clock_timestamp() THEN
        RAISE EXCEPTION 'EXPIRED_UPLOAD_REF: Upload authorization window has expired';
    END IF;

    -- 5. Check if already committed
    IF v_auth_record.committed_at IS NOT NULL THEN
        RAISE EXCEPTION 'UPLOAD_UNVERIFIED: Upload authorization has already been committed';
    END IF;

    -- 6. Verify real object existence and metadata in storage.objects
    SELECT name, bucket_id, metadata
    INTO v_storage_obj
    FROM storage.objects
    WHERE bucket_id = 'driver-documents'
      AND name = v_auth_record.storage_path;

    IF v_storage_obj.name IS NULL THEN
        RAISE EXCEPTION 'UPLOAD_UNVERIFIED: Uploaded file not found in storage bucket';
    END IF;

    -- Extract size and mimetype from storage.objects.metadata
    v_obj_size := COALESCE(
        (v_storage_obj.metadata->>'size')::bigint,
        (v_storage_obj.metadata->>'content-length')::bigint
    );
    v_obj_mime := COALESCE(
        v_storage_obj.metadata->>'mimetype',
        v_storage_obj.metadata->>'contentType',
        v_storage_obj.metadata->>'content-type'
    );

    IF v_obj_size IS NULL OR v_obj_mime IS NULL THEN
        RAISE EXCEPTION 'UPLOAD_UNVERIFIED: Cannot verify uploaded file metadata';
    END IF;

    -- Validate actual size: 1 <= size <= max_size <= 10MB
    IF v_obj_size < 1 OR v_obj_size > v_auth_record.max_size_bytes OR v_obj_size > 10485760 THEN
        RAISE EXCEPTION 'INVALID_FILE_SIZE: Actual file size % does not match authorization', v_obj_size;
    END IF;

    -- Validate actual MIME: matches authorized MIME exactly
    IF pg_catalog.lower(v_obj_mime) <> pg_catalog.lower(v_auth_record.mime_type) THEN
        RAISE EXCEPTION 'INVALID_MIME_TYPE: Actual file MIME type % does not match authorization %', v_obj_mime, v_auth_record.mime_type;
    END IF;

    -- 7. Check if an active document of the same type already exists (PENDING, UNDER_REVIEW, VERIFIED)
    SELECT EXISTS (
        SELECT 1 FROM public.driver_documents
        WHERE driver_id = p_actor_id
          AND document_type = v_clean_type
          AND verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED')
    ) INTO v_active_exists;

    IF v_active_exists THEN
        RAISE EXCEPTION 'DOCUMENT_ALREADY_SUBMITTED: Active document already submitted for type %', v_clean_type;
    END IF;

    -- 8. Mark authorization committed
    UPDATE private.driver_document_upload_authorizations
    SET committed_at = pg_catalog.clock_timestamp()
    WHERE id = v_auth_record.id;

    -- 9. Insert new driver document (historical rejected/expired rows remain untouched!)
    INSERT INTO public.driver_documents (
        driver_id,
        document_type,
        storage_path,
        verification_status
    ) VALUES (
        p_actor_id,
        v_clean_type,
        v_auth_record.storage_path,
        'PENDING'
    )
    RETURNING id INTO v_doc_id;

    -- Automatically reset driver verification_status to PENDING if previously REJECTED
    UPDATE public.drivers
    SET verification_status = 'PENDING'
    WHERE id = p_actor_id AND verification_status = 'REJECTED';

    RETURN jsonb_build_object(
        'document_id', v_doc_id,
        'driver_id', p_actor_id,
        'document_type', v_clean_type,
        'storage_path', v_auth_record.storage_path,
        'file_size_bytes', v_obj_size,
        'mime_type', v_obj_mime,
        'verification_status', 'PENDING'
    );
END;
$$;


-- ----------------------------------------------------------------------------
-- 3. Strict Admin Driver Verification (Approve / Reject)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_verify_driver(
    p_actor_id UUID,
    p_driver_id UUID,
    p_decision TEXT,
    p_rejection_reason TEXT DEFAULT NULL,
    p_actor_aal TEXT DEFAULT 'aal1'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_role TEXT;
    v_current_ver_status TEXT;
    v_current_acc_status TEXT;
    v_clean_decision TEXT;
    v_vehicle_count INT;
    v_mandatory_doc_count INT;
    v_clean_reason TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor user ID is required';
    END IF;

    -- 1. Validate actor role from public.profiles ONLY (Section 4)
    SELECT platform_role INTO v_actor_role
    FROM public.profiles
    WHERE id = p_actor_id;

    IF v_actor_role IS NULL OR v_actor_role NOT IN ('super_admin', 'admin', 'verification_agent') THEN
        RAISE EXCEPTION 'AUTH_ADMIN_ROLE_REQUIRED: Only verification_agent, admin or super_admin can verify drivers';
    END IF;

    -- 2. Validate actor AAL2 strictly (Section 2)
    IF p_actor_aal IS NULL OR p_actor_aal <> 'aal2' THEN
        RAISE EXCEPTION 'AUTH_MFA_REQUIRED: AAL2 MFA is required for administrative verification';
    END IF;

    -- 3. Check Driver existence
    SELECT verification_status, account_status
    INTO v_current_ver_status, v_current_acc_status
    FROM public.drivers
    WHERE id = p_driver_id;

    IF v_current_ver_status IS NULL THEN
        RAISE EXCEPTION 'DRIVER_NOT_FOUND: Driver % not found', p_driver_id;
    END IF;

    v_clean_decision := pg_catalog.upper(pg_catalog.btrim(p_decision));
    IF v_clean_decision NOT IN ('APPROVE', 'REJECT') THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Decision must be APPROVE or REJECT';
    END IF;

    IF v_clean_decision = 'APPROVE' THEN
        -- Driver must be in PENDING or UNDER_REVIEW
        IF v_current_ver_status NOT IN ('PENDING', 'UNDER_REVIEW') THEN
            RAISE EXCEPTION 'INVALID_STATE: Driver verification status is %', v_current_ver_status;
        END IF;

        -- Account status must be REGISTERED
        IF v_current_acc_status <> 'REGISTERED' THEN
            RAISE EXCEPTION 'INVALID_STATE: Driver account status must be REGISTERED, currently %', v_current_acc_status;
        END IF;

        -- Check driver presence exists (Approve MUST NOT create driver_presence)
        IF NOT EXISTS (SELECT 1 FROM public.driver_presence WHERE driver_id = p_driver_id) THEN
            RAISE EXCEPTION 'INVALID_STATE: Driver presence record missing';
        END IF;

        -- Check vehicle exists
        SELECT count(*) INTO v_vehicle_count
        FROM public.vehicles
        WHERE driver_id = p_driver_id;

        IF v_vehicle_count = 0 THEN
            RAISE EXCEPTION 'VEHICLE_MISSING: Driver must have at least one registered vehicle to be approved';
        END IF;

        -- Check all 3 mandatory documents exist with status PENDING or UNDER_REVIEW (REJECTED and EXPIRED DO NOT COUNT!)
        SELECT count(DISTINCT document_type) INTO v_mandatory_doc_count
        FROM public.driver_documents
        WHERE driver_id = p_driver_id
          AND document_type IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION')
          AND verification_status IN ('PENDING', 'UNDER_REVIEW');

        IF v_mandatory_doc_count < 3 THEN
            RAISE EXCEPTION 'DOCUMENTATION_INCOMPLETE: Driver must have current PENDING/UNDER_REVIEW documents for NATIONAL_ID, DRIVER_LICENSE, and VEHICLE_REGISTRATION';
        END IF;

        -- Update ONLY current pending/under_review documents to VERIFIED (historical rejected rows remain untouched!)
        UPDATE public.driver_documents
        SET verification_status = 'VERIFIED',
            rejection_reason = NULL
        WHERE driver_id = p_driver_id
          AND verification_status IN ('PENDING', 'UNDER_REVIEW');

        -- Update driver status
        UPDATE public.drivers
        SET verification_status = 'VERIFIED',
            account_status = 'ACTIVE'
        WHERE id = p_driver_id;

        -- Update driver presence to OFFLINE (Approve does NOT insert driver_presence)
        UPDATE public.driver_presence
        SET operational_state = 'OFFLINE',
            location_updated_at = pg_catalog.clock_timestamp()
        WHERE driver_id = p_driver_id;

        -- Insert audit log
        INSERT INTO public.audit_logs (
            admin_user_id,
            action,
            reason
        ) VALUES (
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

    ELSE -- REJECT
        v_clean_reason := NULLIF(pg_catalog.btrim(p_rejection_reason), '');
        IF v_clean_reason IS NULL THEN
            RAISE EXCEPTION 'INVALID_ARGUMENT: rejection_reason is required when rejecting driver';
        END IF;

        -- Reject is ONLY permitted when driver is in (PENDING, UNDER_REVIEW) and account_status = REGISTERED
        IF v_current_ver_status NOT IN ('PENDING', 'UNDER_REVIEW') THEN
            RAISE EXCEPTION 'INVALID_STATE: Driver verification status is %, cannot be rejected', v_current_ver_status;
        END IF;

        IF v_current_acc_status <> 'REGISTERED' THEN
            RAISE EXCEPTION 'INVALID_STATE: Driver account status must be REGISTERED, currently %', v_current_acc_status;
        END IF;

        -- Update current pending/under_review documents to REJECTED (historical rows remain untouched!)
        UPDATE public.driver_documents
        SET verification_status = 'REJECTED',
            rejection_reason = v_clean_reason
        WHERE driver_id = p_driver_id
          AND verification_status IN ('PENDING', 'UNDER_REVIEW');

        -- Update driver status
        UPDATE public.drivers
        SET verification_status = 'REJECTED',
            account_status = 'REGISTERED'
        WHERE id = p_driver_id;

        -- Insert audit log
        INSERT INTO public.audit_logs (
            admin_user_id,
            action,
            reason
        ) VALUES (
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
    END IF;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Canonical Platform Role & Admin Verification RPCs (Strictly public schema)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_platform_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT COALESCE(
        (SELECT platform_role FROM public.profiles WHERE id = p_user_id),
        'none'
    );
$$;

CREATE OR REPLACE FUNCTION public.get_admin_driver_verification_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_drivers jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', d.id,
            'verification_status', d.verification_status,
            'account_status', d.account_status,
            'national_id_number', d.national_id_number,
            'license_number', d.license_number,
            'created_at', d.created_at
        ) ORDER BY d.created_at DESC
    ) INTO v_drivers
    FROM public.drivers d
    WHERE d.verification_status IN ('PENDING', 'UNDER_REVIEW');

    RETURN COALESCE(v_drivers, '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_driver_verification_detail(p_driver_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_driver RECORD;
    v_vehicles jsonb;
    v_documents jsonb;
BEGIN
    SELECT * INTO v_driver
    FROM public.drivers
    WHERE id = p_driver_id;

    IF v_driver.id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(v)), '[]'::jsonb) INTO v_vehicles
    FROM public.vehicles v
    WHERE v.driver_id = p_driver_id;

    SELECT COALESCE(jsonb_agg(to_jsonb(doc) ORDER BY doc.created_at DESC), '[]'::jsonb) INTO v_documents
    FROM public.driver_documents doc
    WHERE doc.driver_id = p_driver_id;

    RETURN jsonb_build_object(
        'driver', to_jsonb(v_driver),
        'vehicle', (CASE WHEN jsonb_array_length(v_vehicles) > 0 THEN v_vehicles->0 ELSE 'null'::jsonb END),
        'vehicles', v_vehicles,
        'documents', v_documents
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_driver_document_storage_path(p_document_id UUID)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT jsonb_build_object('id', id, 'storage_path', storage_path)
    FROM public.driver_documents
    WHERE id = p_document_id;
$$;

-- ----------------------------------------------------------------------------
-- 6. Updated Authorize Driver Document Upload (Allowing all canonical types)
-- ----------------------------------------------------------------------------

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

    v_clean_type := pg_catalog.upper(pg_catalog.btrim(p_document_type));
    IF v_clean_type NOT IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'CRIMINAL_RECORD', 'INSURANCE') THEN
        RAISE EXCEPTION 'INVALID_DOCUMENT_TYPE: Allowed types are NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION, CRIMINAL_RECORD, INSURANCE';
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
        'driver_id', p_actor_id,
        'document_type', v_clean_type,
        'storage_path', v_storage_path,
        'mime_type', v_clean_mime,
        'max_size_bytes', p_file_size,
        'expires_at', v_expires_at
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Revoke Execution on ALL Phase 3 RPCs from PUBLIC/anon/authenticated
--    Grant Execution EXCLUSIVELY to service_role (Bypass Lockdown)
-- ----------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.get_user_platform_role(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_platform_role(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_driver_verification_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_driver_verification_queue() TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_admin_driver_verification_detail(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_driver_verification_detail(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_driver_document_storage_path(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_driver_document_storage_path(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.authorize_driver_document_upload(UUID, TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_driver_document_upload(UUID, TEXT, TEXT, BIGINT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.commit_driver_document(UUID, UUID, TEXT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_driver_document(UUID, UUID, TEXT, BIGINT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.commit_driver_document(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_driver_document(UUID, UUID, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_verify_driver(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_driver(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.admin_verify_driver(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_driver(UUID, UUID, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_business(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business(UUID, TEXT, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_business_location(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_location(UUID, UUID, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_business_member(UUID, UUID, UUID, TEXT, UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_business_member(UUID, UUID, UUID, TEXT, UUID[]) TO service_role;

REVOKE EXECUTE ON FUNCTION public.register_driver(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_driver(UUID, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.register_vehicle(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_vehicle(UUID, TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;
