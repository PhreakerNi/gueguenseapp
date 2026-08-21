-- ============================================================================
-- Migration: 20260821000003_phase4_quote_engine_microclosure_v1_2.sql
-- Description: Phase 4 Quote Engine Microclosure v1.2
--   1. Create private.idempotency_reservations table for distributed lease locking
--   2. Implement acquire_idempotency_lease RPC with fingerprint mismatch guard & lease recovery
--   3. Update execute_idempotent_operation to commit to idempotency_reservations with 201 for quotes/requotes
--   4. Update get_idempotent_response to read from reservations with fallback
--   5. Enforce strict permissions on all newly introduced RPCs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Idempotency Reservations Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.idempotency_reservations (
    id UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
    actor_user_id UUID NOT NULL,
    scope TEXT NOT NULL,
    key TEXT NOT NULL,
    request_fingerprint TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    response_status INTEGER,
    response_body JSONB,
    lease_expires_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    CONSTRAINT uq_idempotency_reservations_actor_scope_key UNIQUE (actor_user_id, scope, key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_reservations_lookup 
    ON private.idempotency_reservations(actor_user_id, scope, key);

CREATE INDEX IF NOT EXISTS idx_idempotency_reservations_lease 
    ON private.idempotency_reservations(lease_expires_at);

-- ----------------------------------------------------------------------------
-- 2. Acquire Idempotency Lease RPC (Pre-Routing / Concurrency Guard)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.acquire_idempotency_lease(
    p_actor_user_id UUID,
    p_scope TEXT,
    p_key TEXT,
    p_request_fingerprint TEXT,
    p_lease_seconds INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lock_key BIGINT;
    v_rec RECORD;
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
    v_lease_exp TIMESTAMPTZ;
    v_exp TIMESTAMPTZ;
BEGIN
    IF p_actor_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_key IS NULL OR p_scope IS NULL OR p_request_fingerprint IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: key, scope and request_fingerprint are required';
    END IF;

    IF p_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: Idempotency key must be a valid UUID v4';
    END IF;

    -- 1. Advisory transaction lock to serialize concurrent attempts on identical actor + scope + key
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_actor_user_id::text || ':' || p_scope || ':' || p_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    v_lease_exp := v_now + (COALESCE(p_lease_seconds, 30) || ' seconds')::interval;
    v_exp := v_now + INTERVAL '24 hours';

    -- 2. Check existing reservation
    SELECT * INTO v_rec
    FROM private.idempotency_reservations
    WHERE actor_user_id = p_actor_user_id
      AND scope = p_scope
      AND key = p_key
    FOR UPDATE;

    IF v_rec.id IS NOT NULL THEN
        -- Check fingerprint mismatch
        IF v_rec.request_fingerprint <> p_request_fingerprint THEN
            RAISE EXCEPTION 'IDEMPOTENCY_FINGERPRINT_MISMATCH: Request payload fingerprint does not match original request';
        END IF;

        -- If completed and unexpired -> fast replay
        IF v_rec.status = 'COMPLETED' THEN
            IF v_rec.expires_at > v_now THEN
                RETURN pg_catalog.jsonb_build_object(
                    'action', 'REPLAY',
                    'response_status', v_rec.response_status,
                    'response_body', v_rec.response_body
                );
            END IF;
            -- Expired completed record: take over with new PENDING lease
        END IF;

        -- If pending and lease still active -> concurrent request in flight
        IF v_rec.status = 'PENDING' AND v_rec.lease_expires_at > v_now THEN
            RETURN pg_catalog.jsonb_build_object(
                'action', 'IN_FLIGHT',
                'lease_expires_at', v_rec.lease_expires_at
            );
        END IF;

        -- Lease expired or record expired: acquire/renew lease
        UPDATE private.idempotency_reservations
        SET status = 'PENDING',
            request_fingerprint = p_request_fingerprint,
            response_status = NULL,
            response_body = NULL,
            lease_expires_at = v_lease_exp,
            expires_at = v_exp,
            updated_at = v_now
        WHERE id = v_rec.id;

        RETURN pg_catalog.jsonb_build_object('action', 'EXECUTE');
    END IF;

    -- 3. Check legacy private.idempotency_responses if exists
    SELECT * INTO v_rec
    FROM private.idempotency_responses
    WHERE actor_user_id = p_actor_user_id
      AND scope = p_scope
      AND key = p_key
      AND expires_at > v_now;

    IF v_rec.key IS NOT NULL THEN
        IF v_rec.request_fingerprint <> p_request_fingerprint THEN
            RAISE EXCEPTION 'IDEMPOTENCY_FINGERPRINT_MISMATCH: Request payload fingerprint does not match original request';
        END IF;

        INSERT INTO private.idempotency_reservations (
            actor_user_id, scope, key, request_fingerprint, status,
            response_status, response_body, lease_expires_at, expires_at, created_at, updated_at
        ) VALUES (
            p_actor_user_id, p_scope, p_key, p_request_fingerprint, 'COMPLETED',
            v_rec.response_status, v_rec.response_body, v_now, v_rec.expires_at, v_now, v_now
        )
        ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
            status = 'COMPLETED',
            response_status = EXCLUDED.response_status,
            response_body = EXCLUDED.response_body,
            expires_at = EXCLUDED.expires_at;

        RETURN pg_catalog.jsonb_build_object(
            'action', 'REPLAY',
            'response_status', v_rec.response_status,
            'response_body', v_rec.response_body
        );
    END IF;

    -- 4. Create brand new PENDING reservation
    INSERT INTO private.idempotency_reservations (
        actor_user_id, scope, key, request_fingerprint, status,
        lease_expires_at, expires_at, created_at, updated_at
    ) VALUES (
        p_actor_user_id, p_scope, p_key, p_request_fingerprint, 'PENDING',
        v_lease_exp, v_exp, v_now, v_now
    );

    RETURN pg_catalog.jsonb_build_object('action', 'EXECUTE');
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Update Fast Idempotency Response Helper RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_idempotent_response(
    p_actor_user_id UUID,
    p_scope TEXT,
    p_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rec RECORD;
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
BEGIN
    IF p_actor_user_id IS NULL OR p_scope IS NULL OR p_key IS NULL THEN
        RETURN NULL;
    END IF;

    -- First check private.idempotency_reservations
    SELECT request_fingerprint, response_status, response_body
    INTO v_rec
    FROM private.idempotency_reservations
    WHERE actor_user_id = p_actor_user_id
      AND scope = p_scope
      AND key = p_key
      AND status = 'COMPLETED'
      AND expires_at > v_now;

    IF v_rec.request_fingerprint IS NOT NULL THEN
        RETURN pg_catalog.jsonb_build_object(
            'request_fingerprint', v_rec.request_fingerprint,
            'response_status', v_rec.response_status,
            'response_body', v_rec.response_body
        );
    END IF;

    -- Fallback to private.idempotency_responses
    SELECT request_fingerprint, response_status, response_body
    INTO v_rec
    FROM private.idempotency_responses
    WHERE actor_user_id = p_actor_user_id
      AND scope = p_scope
      AND key = p_key
      AND expires_at > v_now;

    IF v_rec.request_fingerprint IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'request_fingerprint', v_rec.request_fingerprint,
        'response_status', v_rec.response_status,
        'response_body', v_rec.response_body
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Update execute_idempotent_operation (Commit with 201 for Quotes & Requotes)
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
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
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

    -- Generate actor-isolated 64-bit advisory lock key
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_actor_user_id::text || ':' || p_scope || ':' || p_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    -- Check if record exists in private.idempotency_responses
    SELECT * INTO v_cached
    FROM private.idempotency_responses
    WHERE actor_user_id = p_actor_user_id
      AND scope = p_scope
      AND key = p_key;

    IF v_cached.key IS NOT NULL THEN
        IF v_cached.expires_at <= v_now THEN
            DELETE FROM private.idempotency_reservations WHERE actor_user_id = p_actor_user_id AND scope = p_scope AND key = p_key;
            DELETE FROM private.idempotency_responses WHERE actor_user_id = p_actor_user_id AND scope = p_scope AND key = p_key;
            DELETE FROM public.idempotency_keys WHERE actor_user_id = p_actor_user_id AND scope = p_scope AND key = p_key;
            v_cached := NULL;
        ELSE
            IF v_cached.request_fingerprint <> p_request_fingerprint THEN
                RAISE EXCEPTION 'IDEMPOTENCY_FINGERPRINT_MISMATCH: Request payload fingerprint does not match original request';
            END IF;

            RETURN pg_catalog.jsonb_build_object(
                'cached', true,
                'status', v_cached.response_status,
                'body', v_cached.response_body
            );
        END IF;
    END IF;

    -- Also check private.idempotency_reservations
    IF v_cached IS NULL OR v_cached.key IS NULL THEN
        SELECT * INTO v_cached
        FROM private.idempotency_reservations
        WHERE actor_user_id = p_actor_user_id
          AND scope = p_scope
          AND key = p_key
          AND status = 'COMPLETED';

        IF v_cached.key IS NOT NULL THEN
            IF v_cached.expires_at <= v_now THEN
                DELETE FROM private.idempotency_reservations WHERE actor_user_id = p_actor_user_id AND scope = p_scope AND key = p_key;
                DELETE FROM private.idempotency_responses WHERE actor_user_id = p_actor_user_id AND scope = p_scope AND key = p_key;
                DELETE FROM public.idempotency_keys WHERE actor_user_id = p_actor_user_id AND scope = p_scope AND key = p_key;
                v_cached := NULL;
            ELSE
                IF v_cached.request_fingerprint <> p_request_fingerprint THEN
                    RAISE EXCEPTION 'IDEMPOTENCY_FINGERPRINT_MISMATCH: Request payload fingerprint does not match original request';
                END IF;

                RETURN pg_catalog.jsonb_build_object(
                    'cached', true,
                    'status', v_cached.response_status,
                    'body', v_cached.response_body
                );
            END IF;
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

    ELSIF p_operation_fn = 'create_delivery_quote' THEN
        v_result := public.create_delivery_quote(
            p_actor_user_id,
            (p_operation_params->>'location_id')::uuid,
            p_operation_params->>'dropoff_address_text',
            (p_operation_params->>'dropoff_lat')::double precision,
            (p_operation_params->>'dropoff_lng')::double precision,
            p_operation_params->>'recipient_name',
            p_operation_params->>'recipient_phone',
            p_operation_params->>'package_type',
            (p_operation_params->>'cash_to_collect')::numeric,
            (p_operation_params->>'distance_meters')::bigint,
            (p_operation_params->>'duration_seconds')::bigint,
            (p_operation_params->>'route_calculated_at')::timestamptz
        );
        v_status := 201; -- Explicit 201 Created

    ELSIF p_operation_fn = 'cancel_delivery_quote' THEN
        v_result := public.cancel_delivery_quote(
            p_actor_user_id,
            (p_operation_params->>'quote_id')::uuid
        );
        v_status := 200; -- Explicit 200 OK

    ELSIF p_operation_fn = 'create_delivery_requote' THEN
        v_result := public.create_delivery_requote(
            p_actor_user_id,
            (p_operation_params->>'quote_id')::uuid,
            (p_operation_params->>'distance_meters')::bigint,
            (p_operation_params->>'duration_seconds')::bigint,
            (p_operation_params->>'route_calculated_at')::timestamptz
        );
        v_status := 201; -- Explicit 201 Created

    ELSE
        RAISE EXCEPTION 'INVALID_ARGUMENT: Unknown operation function %', p_operation_fn;
    END IF;

    v_expires_at := v_now + INTERVAL '24 hours';

    -- 1. Commit to private.idempotency_reservations
    INSERT INTO private.idempotency_reservations (
        actor_user_id,
        scope,
        key,
        request_fingerprint,
        status,
        response_status,
        response_body,
        lease_expires_at,
        expires_at,
        created_at,
        updated_at
    ) VALUES (
        p_actor_user_id,
        p_scope,
        p_key,
        p_request_fingerprint,
        'COMPLETED',
        v_status,
        v_result,
        v_now,
        v_expires_at,
        v_now,
        v_now
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE
    SET status = 'COMPLETED',
        response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body,
        request_fingerprint = EXCLUDED.request_fingerprint,
        expires_at = EXCLUDED.expires_at,
        updated_at = v_now;

    -- 2. Commit to private.idempotency_responses
    INSERT INTO private.idempotency_responses (
        actor_user_id,
        scope,
        key,
        request_fingerprint,
        response_status,
        response_body,
        expires_at,
        created_at
    ) VALUES (
        p_actor_user_id,
        p_scope,
        p_key,
        p_request_fingerprint,
        v_status,
        v_result,
        v_expires_at,
        v_now
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE
    SET response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body,
        request_fingerprint = EXCLUDED.request_fingerprint,
        expires_at = EXCLUDED.expires_at;

    -- 3. Also record in public.idempotency_keys for public RLS compliance
    INSERT INTO public.idempotency_keys (
        actor_type,
        actor_user_id,
        scope,
        key,
        request_fingerprint,
        response_status,
        response_body_ref,
        expires_at,
        created_at
    ) VALUES (
        'user',
        p_actor_user_id,
        p_scope,
        p_key,
        p_request_fingerprint,
        v_status,
        p_scope || ':' || p_key,
        v_expires_at,
        v_now
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body_ref = EXCLUDED.response_body_ref,
        expires_at = EXCLUDED.expires_at;

    RETURN pg_catalog.jsonb_build_object(
        'cached', false,
        'status', v_status,
        'body', v_result
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Permissions & Revocations
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.acquire_idempotency_lease(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_idempotency_lease(UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_idempotent_response(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_idempotent_response(UUID, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;
