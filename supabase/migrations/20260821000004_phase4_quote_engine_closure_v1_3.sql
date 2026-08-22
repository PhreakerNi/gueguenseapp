-- ============================================================================
-- Migration: 20260821000004_phase4_quote_engine_closure_v1_3.sql
-- Description: Phase 4 Quote Engine Closure v1.3
--   1. Extend private.idempotency_reservations with reservation_token and lease_generation
--   2. Implement robust lease management RPCs: acquire_idempotency_lease, complete_idempotent_external_operation, abort_idempotency_lease
--   3. Decouple authorization verification from pricing lookup in verify_quote_creation_scope & verify_requote_scope
--   4. Introduce verify_quote_access_scope for pre-authorization prior to quote cancellation
--   5. Introduce get_active_pricing_rule for server-only pricing lookup during new executions
--   6. Implement fencing-token-guarded atomic quote creation & requote functions
--   7. Enforce strict service_role-only permissions on all newly introduced/updated functions
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend Idempotency Reservations Schema
-- ----------------------------------------------------------------------------
ALTER TABLE private.idempotency_reservations
    ADD COLUMN IF NOT EXISTS reservation_token UUID DEFAULT extensions.gen_random_uuid(),
    ADD COLUMN IF NOT EXISTS lease_generation BIGINT NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_idempotency_reservations_actor_coalesce_key
    ON private.idempotency_reservations (COALESCE(actor_user_id, '00000000-0000-0000-0000-000000000000'::uuid), scope, key);

-- ----------------------------------------------------------------------------
-- 2. Acquire Idempotency Lease RPC (With Fencing Token & Generation)
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
    v_token UUID;
    v_gen BIGINT;
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

    IF v_rec.key IS NOT NULL THEN
        -- Fingerprint check first: mismatch immediately errors with 0 external provider calls
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

        -- Lease expired or record expired: acquire/renew lease with new generation and fencing token
        v_token := extensions.gen_random_uuid();
        v_gen := COALESCE(v_rec.lease_generation, 0) + 1;

        UPDATE private.idempotency_reservations
        SET status = 'PENDING',
            request_fingerprint = p_request_fingerprint,
            reservation_token = v_token,
            lease_generation = v_gen,
            response_status = NULL,
            response_body = NULL,
            lease_expires_at = v_lease_exp,
            expires_at = v_exp,
            updated_at = v_now
        WHERE id = v_rec.id;

        RETURN pg_catalog.jsonb_build_object(
            'action', 'EXECUTE',
            'reservation_token', v_token,
            'lease_generation', v_gen,
            'lease_expires_at', v_lease_exp
        );
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

        v_token := extensions.gen_random_uuid();
        INSERT INTO private.idempotency_reservations (
            actor_user_id, scope, key, request_fingerprint, status,
            reservation_token, lease_generation,
            response_status, response_body, lease_expires_at, expires_at, created_at, updated_at
        ) VALUES (
            p_actor_user_id, p_scope, p_key, p_request_fingerprint, 'COMPLETED',
            v_token, 1,
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

    -- 4. Create brand new PENDING reservation with token and generation = 1
    v_token := extensions.gen_random_uuid();
    INSERT INTO private.idempotency_reservations (
        actor_user_id, scope, key, request_fingerprint, status,
        reservation_token, lease_generation,
        lease_expires_at, expires_at, created_at, updated_at
    ) VALUES (
        p_actor_user_id, p_scope, p_key, p_request_fingerprint, 'PENDING',
        v_token, 1,
        v_lease_exp, v_exp, v_now, v_now
    );

    RETURN pg_catalog.jsonb_build_object(
        'action', 'EXECUTE',
        'reservation_token', v_token,
        'lease_generation', 1,
        'lease_expires_at', v_lease_exp
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 3. Complete Idempotent External Operation RPC (Fencing Token Validation)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_idempotent_external_operation(
    p_actor_user_id UUID,
    p_scope TEXT,
    p_key TEXT,
    p_request_fingerprint TEXT,
    p_reservation_token UUID,
    p_lease_generation BIGINT,
    p_response_status INTEGER,
    p_response_body JSONB
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
    v_exp TIMESTAMPTZ := v_now + INTERVAL '24 hours';
BEGIN
    IF p_actor_user_id IS NULL OR p_scope IS NULL OR p_key IS NULL OR p_reservation_token IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: actor_user_id, scope, key and reservation_token are required';
    END IF;

    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_actor_user_id::text || ':' || p_scope || ':' || p_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    SELECT * INTO v_rec
    FROM private.idempotency_reservations
    WHERE actor_user_id = p_actor_user_id
      AND scope = p_scope
      AND key = p_key
    FOR UPDATE;

    IF v_rec.key IS NULL THEN
        RAISE EXCEPTION 'IDEMPOTENCY_LEASE_LOST: No reservation found';
    END IF;

    -- Validate fencing token, generation, and status
    IF v_rec.status <> 'PENDING' 
       OR v_rec.reservation_token <> p_reservation_token 
       OR v_rec.lease_generation <> p_lease_generation THEN
        RAISE EXCEPTION 'IDEMPOTENCY_LEASE_LOST: Reservation token or generation mismatch';
    END IF;

    -- Validate request fingerprint
    IF v_rec.request_fingerprint <> p_request_fingerprint THEN
        RAISE EXCEPTION 'IDEMPOTENCY_FINGERPRINT_MISMATCH: Request payload fingerprint mismatch';
    END IF;

    -- Update reservation to COMPLETED
    UPDATE private.idempotency_reservations
    SET status = 'COMPLETED',
        response_status = p_response_status,
        response_body = p_response_body,
        expires_at = v_exp,
        updated_at = v_now
    WHERE id = v_rec.id;

    -- Synchronize with private.idempotency_responses & public.idempotency_keys
    INSERT INTO private.idempotency_responses (
        actor_user_id, scope, key, request_fingerprint,
        response_status, response_body, expires_at, created_at
    ) VALUES (
        p_actor_user_id, p_scope, p_key, p_request_fingerprint,
        p_response_status, p_response_body, v_exp, v_now
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body,
        expires_at = EXCLUDED.expires_at;

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
        p_response_status,
        'private.idempotency_responses',
        v_exp
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body_ref = EXCLUDED.response_body_ref,
        expires_at = EXCLUDED.expires_at;

    RETURN pg_catalog.jsonb_build_object(
        'status', p_response_status,
        'body', p_response_body
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 4. Abort Idempotency Lease RPC
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.abort_idempotency_lease(
    p_actor_user_id UUID,
    p_scope TEXT,
    p_key TEXT,
    p_reservation_token UUID,
    p_lease_generation BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_lock_key BIGINT;
    v_rec RECORD;
BEGIN
    IF p_actor_user_id IS NULL OR p_scope IS NULL OR p_key IS NULL OR p_reservation_token IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: actor_user_id, scope, key and reservation_token are required';
    END IF;

    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_actor_user_id::text || ':' || p_scope || ':' || p_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    SELECT * INTO v_rec
    FROM private.idempotency_reservations
    WHERE actor_user_id = p_actor_user_id
      AND scope = p_scope
      AND key = p_key
    FOR UPDATE;

    IF v_rec.key IS NOT NULL THEN
        IF v_rec.status = 'PENDING' 
           AND v_rec.reservation_token = p_reservation_token 
           AND v_rec.lease_generation = p_lease_generation THEN
            DELETE FROM private.idempotency_reservations WHERE id = v_rec.id;
            RETURN pg_catalog.jsonb_build_object('aborted', true);
        ELSE
            RAISE EXCEPTION 'IDEMPOTENCY_LEASE_LOST: Cannot abort lease owned by another token or generation';
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object('aborted', false);
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Scope Verification RPCs (Separated from Pricing)
-- ----------------------------------------------------------------------------

-- 5.1 Verify Quote Creation Scope (Auth & Location Only, NO PRICING)
CREATE OR REPLACE FUNCTION public.verify_quote_creation_scope(
    p_actor_id UUID,
    p_location_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_loc RECORD;
    v_member RECORD;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_location_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: location_id is required';
    END IF;

    -- 1. Fetch location & business
    SELECT l.id, l.business_id, l.name, l.address_text,
           extensions.ST_Y(l.location::extensions.geometry) AS latitude,
           extensions.ST_X(l.location::extensions.geometry) AS longitude,
           l.is_active, b.account_status AS business_status
    INTO v_loc
    FROM public.business_locations l
    JOIN public.businesses b ON b.id = l.business_id
    WHERE l.id = p_location_id;

    IF v_loc.id IS NULL THEN
        RAISE EXCEPTION 'INVALID_LOCATIONS: Location % does not exist', p_location_id;
    END IF;

    IF NOT v_loc.is_active THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Business location is inactive';
    END IF;

    IF v_loc.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Business is currently %', v_loc.business_status;
    END IF;

    -- 2. Verify actor membership & scope
    SELECT bm.id, bm.role, bm.status
    INTO v_member
    FROM public.business_members bm
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_loc.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User is not an active member of this business';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = p_location_id
        ) THEN
            RAISE EXCEPTION 'INVALID_LOCATION_SCOPE: User lacks authority over location %', p_location_id;
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'location_id', v_loc.id,
        'business_id', v_loc.business_id,
        'location_name', v_loc.name,
        'address_text', v_loc.address_text,
        'pickup_lat', v_loc.latitude,
        'pickup_lng', v_loc.longitude
    );
END;
$$;

-- 5.2 Verify Requote Scope (Auth & Quote Only, NO PRICING)
CREATE OR REPLACE FUNCTION public.verify_requote_scope(
    p_actor_id UUID,
    p_quote_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_orig RECORD;
    v_member RECORD;
    v_status TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_quote_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: quote_id is required';
    END IF;

    -- 1. Fetch original quote, request, location & business
    SELECT q.id, q.delivery_request_id, q.status, q.expires_at,
           dr.business_id, dr.location_id, dr.package_type, dr.cash_to_collect,
           dr.recipient_name, dr.recipient_phone, dr.dropoff_address_snapshot,
           extensions.ST_Y(l.location::extensions.geometry) AS pickup_lat,
           extensions.ST_X(l.location::extensions.geometry) AS pickup_lng,
           extensions.ST_Y(dr.dropoff_location::extensions.geometry) AS dropoff_lat,
           extensions.ST_X(dr.dropoff_location::extensions.geometry) AS dropoff_lng,
           b.account_status AS business_status,
           l.is_active AS location_is_active
    INTO v_orig
    FROM public.delivery_quotes q
    JOIN public.delivery_requests dr ON dr.id = q.delivery_request_id
    JOIN public.businesses b ON b.id = dr.business_id
    JOIN public.business_locations l ON l.id = dr.location_id
    WHERE q.id = p_quote_id;

    IF v_orig.id IS NULL THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: Quote % does not exist', p_quote_id;
    END IF;

    -- 2. Verify actor membership & scope
    SELECT bm.id, bm.role, bm.status
    INTO v_member
    FROM public.business_members bm
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_orig.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User is not an active member of this business';
    END IF;

    IF v_orig.business_status <> 'ACTIVE' OR NOT v_orig.location_is_active THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Business or location is inactive';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = v_orig.location_id
        ) THEN
            RAISE EXCEPTION 'INVALID_LOCATION_SCOPE: User lacks authority over location %', v_orig.location_id;
        END IF;
    END IF;

    -- 3. Check quote state eligibility for requote (QUOTED, EXPIRED, CANCELED)
    v_status := v_orig.status;
    IF v_status = 'QUOTED' AND v_orig.expires_at <= pg_catalog.clock_timestamp() THEN
        v_status := 'EXPIRED';
    END IF;

    IF v_status NOT IN ('QUOTED', 'EXPIRED', 'CANCELED') THEN
        RAISE EXCEPTION 'QUOTE_INVALID_STATE: Quote status % is not eligible for requote', v_status;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'quote_id', v_orig.id,
        'delivery_request_id', v_orig.delivery_request_id,
        'business_id', v_orig.business_id,
        'location_id', v_orig.location_id,
        'package_type', v_orig.package_type,
        'cash_to_collect', v_orig.cash_to_collect,
        'recipient_name', v_orig.recipient_name,
        'recipient_phone', v_orig.recipient_phone,
        'pickup_lat', v_orig.pickup_lat,
        'pickup_lng', v_orig.pickup_lng,
        'dropoff_lat', v_orig.dropoff_lat,
        'dropoff_lng', v_orig.dropoff_lng,
        'dropoff_address_text', v_orig.dropoff_address_snapshot->>'address_text'
    );
END;
$$;

-- 5.3 Verify Quote Access Scope (Pre-Authorization for Cancel)
CREATE OR REPLACE FUNCTION public.verify_quote_access_scope(
    p_actor_id UUID,
    p_quote_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_quote RECORD;
    v_member RECORD;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_quote_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: quote_id is required';
    END IF;

    SELECT q.id, q.status, q.expires_at, dr.business_id, dr.location_id,
           b.account_status AS business_status, l.is_active AS location_is_active
    INTO v_quote
    FROM public.delivery_quotes q
    JOIN public.delivery_requests dr ON dr.id = q.delivery_request_id
    JOIN public.businesses b ON b.id = dr.business_id
    JOIN public.business_locations l ON l.id = dr.location_id
    WHERE q.id = p_quote_id;

    IF v_quote.id IS NULL THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: Quote % does not exist', p_quote_id;
    END IF;

    -- Verify actor membership & scope
    SELECT bm.id, bm.role, bm.status
    INTO v_member
    FROM public.business_members bm
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_quote.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User is not an active member of this business';
    END IF;

    IF v_quote.business_status <> 'ACTIVE' OR NOT v_quote.location_is_active THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Business or location is inactive';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = v_quote.location_id
        ) THEN
            RAISE EXCEPTION 'AUTH_FORBIDDEN: User lacks authority over this quote location';
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'quote_id', v_quote.id,
        'business_id', v_quote.business_id,
        'location_id', v_quote.location_id,
        'status', v_quote.status
    );
END;
$$;

-- 5.4 Server-Only Active Pricing Lookup Helper
CREATE OR REPLACE FUNCTION public.get_active_pricing_rule(
    p_package_type TEXT DEFAULT 'PARCEL'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_pv RECORD;
    v_rule RECORD;
    v_clean_type TEXT;
BEGIN
    v_clean_type := pg_catalog.upper(pg_catalog.btrim(COALESCE(p_package_type, 'PARCEL')));

    SELECT id, quote_ttl_seconds, currency
    INTO v_pv
    FROM public.pricing_versions
    WHERE is_active = true
      AND effective_from <= pg_catalog.clock_timestamp()
      AND (effective_to IS NULL OR effective_to > pg_catalog.clock_timestamp())
    LIMIT 1;

    IF v_pv.id IS NULL THEN
        RAISE EXCEPTION 'PRICING_UNAVAILABLE: No active pricing version found';
    END IF;

    SELECT base_fee, per_km_rate, per_minute_rate, min_fare
    INTO v_rule
    FROM public.pricing_rules
    WHERE pricing_version_id = v_pv.id;

    IF v_rule.base_fee IS NULL THEN
        RAISE EXCEPTION 'PRICING_UNAVAILABLE: No pricing rules configured for active pricing version';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'pricing_version_id', v_pv.id,
        'quote_ttl_seconds', v_pv.quote_ttl_seconds,
        'currency', v_pv.currency,
        'base_fee', v_rule.base_fee,
        'per_km_rate', v_rule.per_km_rate,
        'per_minute_rate', v_rule.per_minute_rate,
        'min_fare', v_rule.min_fare
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Atomic Quote Creation with Fencing Token Verification
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_delivery_quote_atomic(
    p_actor_id UUID,
    p_location_id UUID,
    p_dropoff_address_text TEXT,
    p_dropoff_lat DOUBLE PRECISION,
    p_dropoff_lng DOUBLE PRECISION,
    p_recipient_name TEXT,
    p_recipient_phone TEXT,
    p_package_type TEXT,
    p_cash_to_collect NUMERIC(10,2),
    p_distance_meters BIGINT,
    p_duration_seconds BIGINT,
    p_route_calculated_at TIMESTAMPTZ,
    p_idempotency_key TEXT,
    p_request_fingerprint TEXT,
    p_reservation_token UUID,
    p_lease_generation BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_loc RECORD;
    v_member RECORD;
    v_pv RECORD;
    v_rule RECORD;
    v_request_id UUID;
    v_quote_id UUID;
    v_calc_at TIMESTAMPTZ;
    v_expires_at TIMESTAMPTZ;
    v_km NUMERIC;
    v_minutes NUMERIC;
    v_base_amount NUMERIC(10,2);
    v_distance_amount NUMERIC(10,2);
    v_time_amount NUMERIC(10,2);
    v_subtotal NUMERIC(10,2);
    v_quoted_total NUMERIC(10,2);
    v_clean_package_type TEXT;
    v_pickup_snapshot JSONB;
    v_dropoff_snapshot JSONB;
    v_response_body JSONB;
    v_lock_key BIGINT;
    v_res RECORD;
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
    v_exp TIMESTAMPTZ := v_now + INTERVAL '24 hours';
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_location_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: location_id is required';
    END IF;

    IF p_reservation_token IS NULL OR p_lease_generation IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: reservation_token and lease_generation are required';
    END IF;

    -- Validate fencing token under advisory lock
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_actor_id::text || ':create_delivery_quote:' || p_idempotency_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    SELECT * INTO v_res
    FROM private.idempotency_reservations
    WHERE actor_user_id = p_actor_id
      AND scope = 'create_delivery_quote'
      AND key = p_idempotency_key
    FOR UPDATE;

    IF v_res.key IS NULL OR v_res.status <> 'PENDING'
       OR v_res.reservation_token <> p_reservation_token
       OR v_res.lease_generation <> p_lease_generation THEN
        RAISE EXCEPTION 'IDEMPOTENCY_LEASE_LOST: Idempotency lease was lost, expired, or token mismatch';
    END IF;

    IF p_dropoff_lat IS NULL OR p_dropoff_lat < -90.0 OR p_dropoff_lat > 90.0 OR
       p_dropoff_lng IS NULL OR p_dropoff_lng < -180.0 OR p_dropoff_lng > 180.0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Dropoff coordinates must be valid latitude [-90,90] and longitude [-180,180]';
    END IF;

    v_clean_package_type := pg_catalog.upper(pg_catalog.btrim(p_package_type));
    IF v_clean_package_type NOT IN ('PARCEL', 'DOCUMENT', 'FOOD', 'FRAGILE', 'BULKY') THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: Invalid package_type %', p_package_type;
    END IF;

    IF p_cash_to_collect IS NOT NULL AND p_cash_to_collect < 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: cash_to_collect must be non-negative';
    END IF;

    IF p_distance_meters IS NULL OR p_distance_meters <= 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: route_distance_meters must be greater than 0';
    END IF;

    IF p_duration_seconds IS NULL OR p_duration_seconds < 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: route_duration_seconds must be non-negative';
    END IF;

    -- 1. Fetch location & business
    SELECT l.id, l.business_id, l.name, l.address_text,
           extensions.ST_Y(l.location::extensions.geometry) AS latitude,
           extensions.ST_X(l.location::extensions.geometry) AS longitude,
           l.is_active, b.account_status AS business_status
    INTO v_loc
    FROM public.business_locations l
    JOIN public.businesses b ON b.id = l.business_id
    WHERE l.id = p_location_id;

    IF v_loc.id IS NULL THEN
        RAISE EXCEPTION 'INVALID_LOCATIONS: Location % does not exist', p_location_id;
    END IF;

    IF NOT v_loc.is_active THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Business location is inactive';
    END IF;

    IF v_loc.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Business is currently %', v_loc.business_status;
    END IF;

    -- 2. Verify actor membership & scope
    SELECT bm.id, bm.role, bm.status
    INTO v_member
    FROM public.business_members bm
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_loc.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User is not an active member of this business';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = p_location_id
        ) THEN
            RAISE EXCEPTION 'INVALID_LOCATION_SCOPE: User lacks authority over location %', p_location_id;
        END IF;
    END IF;

    -- 3. Fetch active pricing version & rules
    SELECT id, quote_ttl_seconds
    INTO v_pv
    FROM public.pricing_versions
    WHERE is_active = true
      AND effective_from <= pg_catalog.clock_timestamp()
      AND (effective_to IS NULL OR effective_to > pg_catalog.clock_timestamp())
    LIMIT 1;

    IF v_pv.id IS NULL THEN
        RAISE EXCEPTION 'PRICING_UNAVAILABLE: No active pricing version found';
    END IF;

    SELECT base_fee, per_km_rate, per_minute_rate, min_fare
    INTO v_rule
    FROM public.pricing_rules
    WHERE pricing_version_id = v_pv.id;

    IF v_rule.base_fee IS NULL THEN
        RAISE EXCEPTION 'PRICING_UNAVAILABLE: No pricing rules configured for active pricing version';
    END IF;

    -- 4. Calculate pricing in PostgreSQL NUMERIC
    v_km := p_distance_meters::numeric / 1000.0;
    v_minutes := p_duration_seconds::numeric / 60.0;

    v_base_amount := pg_catalog.round(v_rule.base_fee, 2);
    v_distance_amount := pg_catalog.round(v_km * v_rule.per_km_rate, 2);
    v_time_amount := pg_catalog.round(v_minutes * v_rule.per_minute_rate, 2);

    v_subtotal := pg_catalog.round(v_base_amount + v_distance_amount + v_time_amount, 2);
    IF v_subtotal < v_rule.min_fare THEN
        v_quoted_total := v_rule.min_fare;
    ELSE
        v_quoted_total := v_subtotal;
    END IF;

    v_calc_at := COALESCE(p_route_calculated_at, pg_catalog.clock_timestamp());
    v_expires_at := v_calc_at + (v_pv.quote_ttl_seconds || ' seconds')::interval;

    -- 5. Build snapshots
    v_pickup_snapshot := pg_catalog.jsonb_build_object(
        'location_id', v_loc.id,
        'name', v_loc.name,
        'address_text', v_loc.address_text,
        'latitude', v_loc.latitude,
        'longitude', v_loc.longitude
    );

    v_dropoff_snapshot := pg_catalog.jsonb_build_object(
        'address_text', pg_catalog.btrim(p_dropoff_address_text),
        'latitude', p_dropoff_lat,
        'longitude', p_dropoff_lng
    );

    -- 6. Insert delivery request
    INSERT INTO public.delivery_requests (
        business_id,
        location_id,
        pickup_address_snapshot,
        dropoff_address_snapshot,
        recipient_name,
        recipient_phone,
        dropoff_location,
        package_type,
        cash_to_collect,
        created_by,
        created_at
    ) VALUES (
        v_loc.business_id,
        v_loc.id,
        v_pickup_snapshot,
        v_dropoff_snapshot,
        pg_catalog.btrim(p_recipient_name),
        pg_catalog.btrim(p_recipient_phone),
        extensions.st_setsrid(extensions.st_makepoint(p_dropoff_lng, p_dropoff_lat), 4326)::extensions.geography,
        v_clean_package_type,
        COALESCE(p_cash_to_collect, 0),
        p_actor_id,
        v_now
    )
    RETURNING id INTO v_request_id;

    -- 7. Insert delivery quote
    INSERT INTO public.delivery_quotes (
        delivery_request_id,
        pricing_version_id,
        status,
        currency,
        base_amount,
        distance_amount,
        time_amount,
        zone_amount,
        demand_amount,
        discount_amount,
        quoted_total,
        driver_earning_estimate,
        platform_revenue_estimate,
        route_distance_meters,
        route_duration_seconds,
        route_provider,
        route_polyline,
        route_calculated_at,
        expires_at,
        created_at
    ) VALUES (
        v_request_id,
        v_pv.id,
        'QUOTED',
        'NIO',
        v_base_amount,
        v_distance_amount,
        v_time_amount,
        0,
        0,
        0,
        v_quoted_total,
        NULL,
        NULL,
        p_distance_meters,
        p_duration_seconds,
        'GOOGLE_ROUTES',
        NULL,
        v_calc_at,
        v_expires_at,
        v_now
    )
    RETURNING id INTO v_quote_id;

    v_response_body := pg_catalog.jsonb_build_object(
        'quote_id', v_quote_id,
        'delivery_request_id', v_request_id,
        'status', 'QUOTED',
        'currency', 'NIO',
        'base_amount', pg_catalog.to_char(v_base_amount, 'FM999999990.00'),
        'distance_amount', pg_catalog.to_char(v_distance_amount, 'FM999999990.00'),
        'time_amount', pg_catalog.to_char(v_time_amount, 'FM999999990.00'),
        'zone_amount', '0.00',
        'demand_amount', '0.00',
        'discount_amount', '0.00',
        'quoted_total', pg_catalog.to_char(v_quoted_total, 'FM999999990.00'),
        'route_distance_meters', p_distance_meters,
        'route_duration_seconds', p_duration_seconds,
        'route_calculated_at', v_calc_at,
        'expires_at', v_expires_at,
        'created_at', v_now
    );

    -- 8. Commit to idempotency reservations as COMPLETED with status 201
    UPDATE private.idempotency_reservations
    SET status = 'COMPLETED',
        response_status = 201,
        response_body = v_response_body,
        expires_at = v_exp,
        updated_at = v_now
    WHERE id = v_res.id;

    INSERT INTO private.idempotency_responses (
        actor_user_id, scope, key, request_fingerprint,
        response_status, response_body, expires_at, created_at
    ) VALUES (
        p_actor_id, 'create_delivery_quote', p_idempotency_key, p_request_fingerprint,
        201, v_response_body, v_exp, v_now
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body,
        expires_at = EXCLUDED.expires_at;

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
        p_actor_id,
        'create_delivery_quote',
        p_idempotency_key,
        p_request_fingerprint,
        201,
        'private.idempotency_responses',
        v_exp
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body_ref = EXCLUDED.response_body_ref,
        expires_at = EXCLUDED.expires_at;

    RETURN v_response_body;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Atomic Requote RPC with Fencing Token (Server-Only, Service Role)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_delivery_requote_atomic(
    p_actor_id UUID,
    p_quote_id UUID,
    p_distance_meters BIGINT,
    p_duration_seconds BIGINT,
    p_route_calculated_at TIMESTAMPTZ,
    p_idempotency_key TEXT,
    p_request_fingerprint TEXT,
    p_reservation_token UUID,
    p_lease_generation BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_orig RECORD;
    v_member RECORD;
    v_pv RECORD;
    v_rule RECORD;
    v_new_quote_id UUID;
    v_calc_at TIMESTAMPTZ;
    v_expires_at TIMESTAMPTZ;
    v_km NUMERIC;
    v_minutes NUMERIC;
    v_base_amount NUMERIC(10,2);
    v_distance_amount NUMERIC(10,2);
    v_time_amount NUMERIC(10,2);
    v_subtotal NUMERIC(10,2);
    v_quoted_total NUMERIC(10,2);
    v_response_body JSONB;
    v_lock_key BIGINT;
    v_res RECORD;
    v_scope TEXT;
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
    v_exp TIMESTAMPTZ := v_now + INTERVAL '24 hours';
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_quote_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: quote_id is required';
    END IF;

    IF p_reservation_token IS NULL OR p_lease_generation IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: reservation_token and lease_generation are required';
    END IF;

    v_scope := 'requote_quote:' || p_quote_id::text;

    -- Validate fencing token under advisory lock
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_actor_id::text || ':' || v_scope || ':' || p_idempotency_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    SELECT * INTO v_res
    FROM private.idempotency_reservations
    WHERE actor_user_id = p_actor_id
      AND scope = v_scope
      AND key = p_idempotency_key
    FOR UPDATE;

    IF v_res.key IS NULL OR v_res.status <> 'PENDING'
       OR v_res.reservation_token <> p_reservation_token
       OR v_res.lease_generation <> p_lease_generation THEN
        RAISE EXCEPTION 'IDEMPOTENCY_LEASE_LOST: Idempotency lease was lost, expired, or token mismatch';
    END IF;

    -- 1. Fetch original quote
    SELECT q.id, q.delivery_request_id, q.status, q.expires_at, dr.business_id, dr.location_id
    INTO v_orig
    FROM public.delivery_quotes q
    JOIN public.delivery_requests dr ON dr.id = q.delivery_request_id
    WHERE q.id = p_quote_id;

    IF v_orig.id IS NULL THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: Quote % does not exist', p_quote_id;
    END IF;

    -- 2. Verify actor membership & scope
    SELECT bm.id, bm.role, bm.status, b.account_status AS business_status
    INTO v_member
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_orig.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' OR v_member.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have access to this quote';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = v_orig.location_id
        ) THEN
            RAISE EXCEPTION 'AUTH_FORBIDDEN: User lacks authority over this quote location';
        END IF;
    END IF;

    -- 3. Fetch active pricing version & rules
    SELECT id, quote_ttl_seconds
    INTO v_pv
    FROM public.pricing_versions
    WHERE is_active = true
      AND effective_from <= pg_catalog.clock_timestamp()
      AND (effective_to IS NULL OR effective_to > pg_catalog.clock_timestamp())
    LIMIT 1;

    IF v_pv.id IS NULL THEN
        RAISE EXCEPTION 'PRICING_UNAVAILABLE: No active pricing version found';
    END IF;

    SELECT base_fee, per_km_rate, per_minute_rate, min_fare
    INTO v_rule
    FROM public.pricing_rules
    WHERE pricing_version_id = v_pv.id;

    IF v_rule.base_fee IS NULL THEN
        RAISE EXCEPTION 'PRICING_UNAVAILABLE: No pricing rules configured for active pricing version';
    END IF;

    -- 4. Calculate pricing in PostgreSQL NUMERIC
    v_km := p_distance_meters::numeric / 1000.0;
    v_minutes := p_duration_seconds::numeric / 60.0;

    v_base_amount := pg_catalog.round(v_rule.base_fee, 2);
    v_distance_amount := pg_catalog.round(v_km * v_rule.per_km_rate, 2);
    v_time_amount := pg_catalog.round(v_minutes * v_rule.per_minute_rate, 2);

    v_subtotal := pg_catalog.round(v_base_amount + v_distance_amount + v_time_amount, 2);
    IF v_subtotal < v_rule.min_fare THEN
        v_quoted_total := v_rule.min_fare;
    ELSE
        v_quoted_total := v_subtotal;
    END IF;

    v_calc_at := COALESCE(p_route_calculated_at, pg_catalog.clock_timestamp());
    v_expires_at := v_calc_at + (v_pv.quote_ttl_seconds || ' seconds')::interval;

    -- 5. Insert new delivery quote
    INSERT INTO public.delivery_quotes (
        delivery_request_id,
        pricing_version_id,
        status,
        currency,
        base_amount,
        distance_amount,
        time_amount,
        zone_amount,
        demand_amount,
        discount_amount,
        quoted_total,
        driver_earning_estimate,
        platform_revenue_estimate,
        route_distance_meters,
        route_duration_seconds,
        route_provider,
        route_polyline,
        route_calculated_at,
        expires_at,
        created_at
    ) VALUES (
        v_orig.delivery_request_id,
        v_pv.id,
        'QUOTED',
        'NIO',
        v_base_amount,
        v_distance_amount,
        v_time_amount,
        0,
        0,
        0,
        v_quoted_total,
        NULL,
        NULL,
        p_distance_meters,
        p_duration_seconds,
        'GOOGLE_ROUTES',
        NULL,
        v_calc_at,
        v_expires_at,
        v_now
    )
    RETURNING id INTO v_new_quote_id;

    v_response_body := pg_catalog.jsonb_build_object(
        'quote_id', v_new_quote_id,
        'delivery_request_id', v_orig.delivery_request_id,
        'status', 'QUOTED',
        'currency', 'NIO',
        'base_amount', pg_catalog.to_char(v_base_amount, 'FM999999990.00'),
        'distance_amount', pg_catalog.to_char(v_distance_amount, 'FM999999990.00'),
        'time_amount', pg_catalog.to_char(v_time_amount, 'FM999999990.00'),
        'zone_amount', '0.00',
        'demand_amount', '0.00',
        'discount_amount', '0.00',
        'quoted_total', pg_catalog.to_char(v_quoted_total, 'FM999999990.00'),
        'route_distance_meters', p_distance_meters,
        'route_duration_seconds', p_duration_seconds,
        'route_calculated_at', v_calc_at,
        'expires_at', v_expires_at,
        'created_at', v_now
    );

    -- 6. Commit to idempotency reservations as COMPLETED with status 201
    UPDATE private.idempotency_reservations
    SET status = 'COMPLETED',
        response_status = 201,
        response_body = v_response_body,
        expires_at = v_exp,
        updated_at = v_now
    WHERE id = v_res.id;

    INSERT INTO private.idempotency_responses (
        actor_user_id, scope, key, request_fingerprint,
        response_status, response_body, expires_at, created_at
    ) VALUES (
        p_actor_id, v_scope, p_idempotency_key, p_request_fingerprint,
        201, v_response_body, v_exp, v_now
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body,
        expires_at = EXCLUDED.expires_at;

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
        p_actor_id,
        v_scope,
        p_idempotency_key,
        p_request_fingerprint,
        201,
        'private.idempotency_responses',
        v_exp
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body_ref = EXCLUDED.response_body_ref,
        expires_at = EXCLUDED.expires_at;

    RETURN v_response_body;
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Strict Security & Service Role Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.acquire_idempotency_lease(UUID, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_idempotency_lease(UUID, TEXT, TEXT, TEXT, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.complete_idempotent_external_operation(UUID, TEXT, TEXT, TEXT, UUID, BIGINT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_idempotent_external_operation(UUID, TEXT, TEXT, TEXT, UUID, BIGINT, INTEGER, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.abort_idempotency_lease(UUID, TEXT, TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.abort_idempotency_lease(UUID, TEXT, TEXT, UUID, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.verify_quote_creation_scope(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_quote_creation_scope(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.verify_requote_scope(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_requote_scope(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.verify_quote_access_scope(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_quote_access_scope(UUID, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.get_active_pricing_rule(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_pricing_rule(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.create_delivery_quote_atomic(UUID, UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, NUMERIC, BIGINT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_delivery_quote_atomic(UUID, UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, NUMERIC, BIGINT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, UUID, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.create_delivery_requote_atomic(UUID, UUID, BIGINT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_delivery_requote_atomic(UUID, UUID, BIGINT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, UUID, BIGINT) TO service_role;
