-- ============================================================================
-- Migration: 20260821000002_phase4_quote_engine_closure_v1_1.sql
-- Description: Phase 4 Quote Engine Closure v1.1
--   1. Clean up default seed fixtures from v1.0
--   2. Strengthen check constraints (chk_quote_consumed_at, chk_quote_expires_at)
--   3. Fast idempotency response reader RPC (get_idempotent_response)
--   4. Pre-routing actor & scope verification RPCs (verify_quote_creation_scope, verify_requote_scope)
--   5. Unified PostgreSQL NUMERIC pricing calculation across create & requote RPCs
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Clean up default seed pricing fixtures from v1.0
-- ----------------------------------------------------------------------------
DELETE FROM public.pricing_rules WHERE pricing_version_id = 'dd000000-0000-4000-8000-000000000001';
DELETE FROM public.pricing_versions WHERE id = 'dd000000-0000-4000-8000-000000000001';

-- ----------------------------------------------------------------------------
-- 2. Strengthen check constraints on delivery_quotes
-- ----------------------------------------------------------------------------
ALTER TABLE public.delivery_quotes DROP CONSTRAINT IF EXISTS chk_quote_consumed_at;
ALTER TABLE public.delivery_quotes ADD CONSTRAINT chk_quote_consumed_at 
    CHECK ((status = 'CONSUMED' AND consumed_at IS NOT NULL) OR (status <> 'CONSUMED' AND consumed_at IS NULL));

ALTER TABLE public.delivery_quotes DROP CONSTRAINT IF EXISTS chk_quote_expires_at;
ALTER TABLE public.delivery_quotes ADD CONSTRAINT chk_quote_expires_at 
    CHECK (expires_at >= route_calculated_at);

-- ----------------------------------------------------------------------------
-- 3. Fast Idempotency Response Helper RPC
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
BEGIN
    IF p_actor_user_id IS NULL OR p_scope IS NULL OR p_key IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT request_fingerprint, response_status, response_body
    INTO v_rec
    FROM private.idempotency_responses
    WHERE actor_user_id = p_actor_user_id
      AND scope = p_scope
      AND key = p_key
      AND expires_at > pg_catalog.clock_timestamp();

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
-- 4. Pre-Routing Actor & Scope Verification RPCs
-- ----------------------------------------------------------------------------

-- 4.1 Verify Quote Creation Scope & Pricing Availability (Pre-routing)
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
    v_pv RECORD;
    v_rule RECORD;
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

    -- 3. Verify active pricing version and rules exist
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

    RETURN pg_catalog.jsonb_build_object(
        'location_id', v_loc.id,
        'business_id', v_loc.business_id,
        'pickup_lat', v_loc.latitude,
        'pickup_lng', v_loc.longitude
    );
END;
$$;

-- 4.2 Verify Requote Scope & State (Pre-routing)
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
    v_pv RECORD;
    v_rule RECORD;
    v_status TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_quote_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: quote_id is required';
    END IF;

    -- 1. Fetch original quote and request
    SELECT q.id, q.delivery_request_id, q.status, q.expires_at,
           dr.business_id, dr.location_id,
           extensions.ST_Y(dr.pickup_location::extensions.geometry) AS pickup_lat,
           extensions.ST_X(dr.pickup_location::extensions.geometry) AS pickup_lng,
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

    IF v_orig.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Business is currently %', v_orig.business_status;
    END IF;

    IF NOT v_orig.location_is_active THEN
        RAISE EXCEPTION 'BUSINESS_INACTIVE: Business location is inactive';
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

    -- 3. Check quote state for requote eligibility (must be EXPIRED or CANCELED)
    v_status := v_orig.status;
    IF v_status = 'QUOTED' AND v_orig.expires_at <= pg_catalog.clock_timestamp() THEN
        UPDATE public.delivery_quotes
        SET status = 'EXPIRED'
        WHERE id = p_quote_id;
        v_status := 'EXPIRED';
    END IF;

    IF v_status NOT IN ('EXPIRED', 'CANCELED') THEN
        RAISE EXCEPTION 'QUOTE_INVALID_STATE: Quote in status % cannot be requoted', v_status;
    END IF;

    -- 4. Verify active pricing version and rules exist
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

    RETURN pg_catalog.jsonb_build_object(
        'quote_id', v_orig.id,
        'delivery_request_id', v_orig.delivery_request_id,
        'pickup_lat', v_orig.pickup_lat,
        'pickup_lng', v_orig.pickup_lng,
        'dropoff_lat', v_orig.dropoff_lat,
        'dropoff_lng', v_orig.dropoff_lng
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Unified create_delivery_quote & create_delivery_requote
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_delivery_quote(
    p_actor_id UUID,
    p_location_id UUID,
    p_dropoff_address_text TEXT,
    p_dropoff_lat DOUBLE PRECISION,
    p_dropoff_lng DOUBLE PRECISION,
    p_recipient_name TEXT,
    p_recipient_phone TEXT,
    p_package_type TEXT,
    p_cash_to_collect NUMERIC DEFAULT 0,
    p_distance_meters BIGINT DEFAULT NULL,
    p_duration_seconds BIGINT DEFAULT NULL,
    p_route_calculated_at TIMESTAMPTZ DEFAULT NULL
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
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_location_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: location_id is required';
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

    -- 4. Calculate pricing in unified PostgreSQL NUMERIC
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
        pg_catalog.clock_timestamp()
    )
    RETURNING id INTO v_request_id;

    -- 7. Insert delivery quote (Atomic DRAFT -> QUOTED)
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
        route_calculated_at,
        expires_at,
        created_at
    ) VALUES (
        v_request_id,
        v_pv.id,
        'DRAFT',
        'NIO',
        v_base_amount,
        v_distance_amount,
        v_time_amount,
        0.00,
        0.00,
        0.00,
        v_quoted_total,
        NULL,
        NULL,
        p_distance_meters,
        p_duration_seconds,
        'GOOGLE_ROUTES',
        v_calc_at,
        v_expires_at,
        pg_catalog.clock_timestamp()
    )
    RETURNING id INTO v_quote_id;

    UPDATE public.delivery_quotes
    SET status = 'QUOTED'
    WHERE id = v_quote_id;

    RETURN pg_catalog.jsonb_build_object(
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
        'route_provider', 'GOOGLE_ROUTES',
        'route_calculated_at', v_calc_at,
        'expires_at', v_expires_at,
        'created_at', pg_catalog.clock_timestamp()
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_delivery_requote(
    p_actor_id UUID,
    p_quote_id UUID,
    p_distance_meters BIGINT,
    p_duration_seconds BIGINT,
    p_route_calculated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_quote RECORD;
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
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_quote_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: quote_id is required';
    END IF;

    IF p_distance_meters IS NULL OR p_distance_meters <= 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: route_distance_meters must be greater than 0';
    END IF;

    IF p_duration_seconds IS NULL OR p_duration_seconds < 0 THEN
        RAISE EXCEPTION 'VALIDATION_ERROR: route_duration_seconds must be non-negative';
    END IF;

    SELECT q.*, r.business_id, r.location_id
    INTO v_old_quote
    FROM public.delivery_quotes q
    JOIN public.delivery_requests r ON r.id = q.delivery_request_id
    WHERE q.id = p_quote_id;

    IF v_old_quote.id IS NULL THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: Quote % does not exist', p_quote_id;
    END IF;

    -- Verify actor membership & scope
    SELECT bm.id, bm.role, bm.status, b.account_status AS business_status
    INTO v_member
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_old_quote.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' OR v_member.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have access to this quote';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = v_old_quote.location_id
        ) THEN
            RAISE EXCEPTION 'INVALID_LOCATION_SCOPE: User lacks authority over location %', v_old_quote.location_id;
        END IF;
    END IF;

    -- Requote is ONLY allowed for EXPIRED or CANCELED quotes
    IF v_old_quote.status = 'QUOTED' AND v_old_quote.expires_at <= pg_catalog.clock_timestamp() THEN
        UPDATE public.delivery_quotes
        SET status = 'EXPIRED'
        WHERE id = p_quote_id;
        v_old_quote.status := 'EXPIRED';
    END IF;

    IF v_old_quote.status NOT IN ('EXPIRED', 'CANCELED') THEN
        RAISE EXCEPTION 'QUOTE_INVALID_STATE: Quote in status % cannot be requoted', v_old_quote.status;
    END IF;

    -- Fetch current active pricing version & rules
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

    -- Calculate pricing in unified PostgreSQL NUMERIC
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

    -- Insert NEW quote pointing to same delivery_request_id (DRAFT -> QUOTED)
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
        route_calculated_at,
        expires_at,
        created_at
    ) VALUES (
        v_old_quote.delivery_request_id,
        v_pv.id,
        'DRAFT',
        'NIO',
        v_base_amount,
        v_distance_amount,
        v_time_amount,
        0.00,
        0.00,
        0.00,
        v_quoted_total,
        NULL,
        NULL,
        p_distance_meters,
        p_duration_seconds,
        'GOOGLE_ROUTES',
        v_calc_at,
        v_expires_at,
        pg_catalog.clock_timestamp()
    )
    RETURNING id INTO v_new_quote_id;

    UPDATE public.delivery_quotes
    SET status = 'QUOTED'
    WHERE id = v_new_quote_id;

    RETURN pg_catalog.jsonb_build_object(
        'quote_id', v_new_quote_id,
        'delivery_request_id', v_old_quote.delivery_request_id,
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
        'route_provider', 'GOOGLE_ROUTES',
        'route_calculated_at', v_calc_at,
        'expires_at', v_expires_at,
        'created_at', pg_catalog.clock_timestamp()
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Permissions & Revocations
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_idempotent_response(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_idempotent_response(UUID, TEXT, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.verify_quote_creation_scope(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_quote_creation_scope(UUID, UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.verify_requote_scope(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_requote_scope(UUID, UUID) TO service_role;
