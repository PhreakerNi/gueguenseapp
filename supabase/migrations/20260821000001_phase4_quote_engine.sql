-- ============================================================================
-- GÜEGÜENSE — PHASE 4: QUOTE ENGINE (Solo Delivery)
-- Migration: 20260821000001_phase4_quote_engine.sql
-- Description: Pricing versions, pricing rules, delivery requests, delivery quotes,
--              route cache, RLS tenant isolation, and transactional quote RPCs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: public.pricing_versions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'NIO' CHECK (currency = 'NIO'),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    effective_to TIMESTAMPTZ NULL,
    is_active BOOLEAN NOT NULL DEFAULT false,
    quote_ttl_seconds INTEGER NOT NULL DEFAULT 300 CHECK (quote_ttl_seconds > 0 AND quote_ttl_seconds <= 3600),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

-- Maximum 1 active global pricing version in MVP
CREATE UNIQUE INDEX IF NOT EXISTS idx_pricing_versions_single_active
ON public.pricing_versions (is_active)
WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 2. Table: public.pricing_rules
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pricing_version_id UUID NOT NULL REFERENCES public.pricing_versions(id) ON DELETE CASCADE,
    base_fee NUMERIC(10,2) NOT NULL CHECK (base_fee >= 0),
    per_km_rate NUMERIC(10,2) NOT NULL CHECK (per_km_rate >= 0),
    per_minute_rate NUMERIC(10,2) NOT NULL CHECK (per_minute_rate >= 0),
    min_fare NUMERIC(10,2) NOT NULL CHECK (min_fare >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    CONSTRAINT uq_pricing_rules_version UNIQUE (pricing_version_id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_version_id
ON public.pricing_rules (pricing_version_id);

-- ----------------------------------------------------------------------------
-- 3. Table: public.delivery_requests
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
    location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE RESTRICT,
    pickup_address_snapshot JSONB NOT NULL,
    dropoff_address_snapshot JSONB NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    dropoff_location GEOGRAPHY(Point, 4326) NOT NULL,
    package_type TEXT NOT NULL CHECK (package_type IN ('PARCEL', 'DOCUMENT', 'FOOD', 'FRAGILE', 'BULKY')),
    cash_to_collect NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cash_to_collect >= 0),
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_delivery_requests_business_id
ON public.delivery_requests (business_id);

CREATE INDEX IF NOT EXISTS idx_delivery_requests_location_id
ON public.delivery_requests (location_id);

CREATE INDEX IF NOT EXISTS idx_delivery_requests_created_by
ON public.delivery_requests (created_by);

-- ----------------------------------------------------------------------------
-- 4. Table: public.delivery_quotes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_request_id UUID NOT NULL REFERENCES public.delivery_requests(id) ON DELETE RESTRICT,
    pricing_version_id UUID NOT NULL REFERENCES public.pricing_versions(id) ON DELETE RESTRICT,
    status TEXT NOT NULL CHECK (status IN ('DRAFT', 'QUOTED', 'CONSUMED', 'EXPIRED', 'CANCELED')),
    currency TEXT NOT NULL CHECK (currency = 'NIO'),
    base_amount NUMERIC(10,2) NOT NULL CHECK (base_amount >= 0),
    distance_amount NUMERIC(10,2) NOT NULL CHECK (distance_amount >= 0),
    time_amount NUMERIC(10,2) NOT NULL CHECK (time_amount >= 0),
    zone_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (zone_amount = 0),
    demand_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (demand_amount = 0),
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount = 0),
    quoted_total NUMERIC(10,2) NOT NULL CHECK (quoted_total >= 0),
    driver_earning_estimate NUMERIC(10,2) NULL,
    platform_revenue_estimate NUMERIC(10,2) NULL,
    route_distance_meters BIGINT NOT NULL CHECK (route_distance_meters > 0),
    route_duration_seconds BIGINT NOT NULL CHECK (route_duration_seconds >= 0),
    route_provider TEXT NOT NULL CHECK (route_provider = 'GOOGLE_ROUTES'),
    route_calculated_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    CONSTRAINT chk_quote_consumed_at CHECK (consumed_at IS NULL OR status = 'CONSUMED'),
    CONSTRAINT chk_quote_expires_at CHECK (expires_at >= route_calculated_at)
);

CREATE INDEX IF NOT EXISTS idx_delivery_quotes_request_id
ON public.delivery_quotes (delivery_request_id);

CREATE INDEX IF NOT EXISTS idx_delivery_quotes_status
ON public.delivery_quotes (status);

CREATE INDEX IF NOT EXISTS idx_delivery_quotes_expires_at
ON public.delivery_quotes (expires_at);

-- Partial unique index: at most one CONSUMED quote per request
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_quotes_single_consumed
ON public.delivery_quotes (delivery_request_id)
WHERE status = 'CONSUMED';

-- ----------------------------------------------------------------------------
-- 5. Table: private.route_quote_cache
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.route_quote_cache (
    cache_key TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lng DOUBLE PRECISION NOT NULL,
    distance_meters BIGINT NOT NULL CHECK (distance_meters > 0),
    duration_seconds BIGINT NOT NULL CHECK (duration_seconds >= 0),
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_route_quote_cache_expires_at
ON private.route_quote_cache (expires_at);

-- ----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------

ALTER TABLE public.pricing_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.route_quote_cache ENABLE ROW LEVEL SECURITY;

-- Pricing versions & rules: readable by authenticated users
CREATE POLICY "Authenticated users can read pricing versions"
ON public.pricing_versions
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can read pricing rules"
ON public.pricing_rules
FOR SELECT
TO authenticated
USING (true);

-- Delivery requests: readable only by active business members with authorized location scope
CREATE POLICY "Business members can read delivery requests in scope"
ON public.delivery_requests
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.business_members bm
        JOIN public.businesses b ON b.id = bm.business_id
        WHERE bm.user_id = (SELECT auth.uid())
          AND bm.business_id = delivery_requests.business_id
          AND bm.status = 'ACTIVE'
          AND b.account_status = 'ACTIVE'
          AND (
              bm.role = 'business_owner'
              OR EXISTS (
                  SELECT 1 FROM public.business_member_locations bml
                  WHERE bml.business_member_id = bm.id
                    AND bml.business_location_id = delivery_requests.location_id
              )
          )
    )
);

-- Delivery quotes: readable only by active business members with authorized location scope on parent request
CREATE POLICY "Business members can read delivery quotes in scope"
ON public.delivery_quotes
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.delivery_requests dr
        JOIN public.business_members bm ON bm.business_id = dr.business_id
        JOIN public.businesses b ON b.id = bm.business_id
        WHERE dr.id = delivery_quotes.delivery_request_id
          AND bm.user_id = (SELECT auth.uid())
          AND bm.status = 'ACTIVE'
          AND b.account_status = 'ACTIVE'
          AND (
              bm.role = 'business_owner'
              OR EXISTS (
                  SELECT 1 FROM public.business_member_locations bml
                  WHERE bml.business_member_id = bm.id
                    AND bml.business_location_id = dr.location_id
              )
          )
    )
);

-- ----------------------------------------------------------------------------
-- 7. Route Cache Helper RPCs (private schema)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.get_route_cache(p_cache_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_record RECORD;
BEGIN
    SELECT provider, origin_lat, origin_lng, destination_lat, destination_lng,
           distance_meters, duration_seconds, calculated_at, expires_at
    INTO v_record
    FROM private.route_quote_cache
    WHERE cache_key = p_cache_key
      AND expires_at > pg_catalog.clock_timestamp();

    IF v_record.provider IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'provider', v_record.provider,
        'origin_lat', v_record.origin_lat,
        'origin_lng', v_record.origin_lng,
        'destination_lat', v_record.destination_lat,
        'destination_lng', v_record.destination_lng,
        'distance_meters', v_record.distance_meters,
        'duration_seconds', v_record.duration_seconds,
        'calculated_at', v_record.calculated_at,
        'expires_at', v_record.expires_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION private.upsert_route_cache(
    p_cache_key TEXT,
    p_provider TEXT,
    p_origin_lat DOUBLE PRECISION,
    p_origin_lng DOUBLE PRECISION,
    p_dest_lat DOUBLE PRECISION,
    p_dest_lng DOUBLE PRECISION,
    p_distance_meters BIGINT,
    p_duration_seconds BIGINT,
    p_ttl_seconds INTEGER DEFAULT 86400
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO private.route_quote_cache (
        cache_key,
        provider,
        origin_lat,
        origin_lng,
        destination_lat,
        destination_lng,
        distance_meters,
        duration_seconds,
        calculated_at,
        expires_at
    ) VALUES (
        p_cache_key,
        p_provider,
        p_origin_lat,
        p_origin_lng,
        p_dest_lat,
        p_dest_lng,
        p_distance_meters,
        p_duration_seconds,
        pg_catalog.clock_timestamp(),
        pg_catalog.clock_timestamp() + (p_ttl_seconds || ' seconds')::interval
    )
    ON CONFLICT (cache_key) DO UPDATE
    SET distance_meters = EXCLUDED.distance_meters,
        duration_seconds = EXCLUDED.duration_seconds,
        calculated_at = EXCLUDED.calculated_at,
        expires_at = EXCLUDED.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_route_cache(p_cache_key TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RETURN private.get_route_cache(p_cache_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_route_cache(
    p_cache_key TEXT,
    p_provider TEXT,
    p_origin_lat DOUBLE PRECISION,
    p_origin_lng DOUBLE PRECISION,
    p_dest_lat DOUBLE PRECISION,
    p_dest_lng DOUBLE PRECISION,
    p_distance_meters BIGINT,
    p_duration_seconds BIGINT,
    p_ttl_seconds INTEGER DEFAULT 86400
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.upsert_route_cache(
        p_cache_key,
        p_provider,
        p_origin_lat,
        p_origin_lng,
        p_dest_lat,
        p_dest_lng,
        p_distance_meters,
        p_duration_seconds,
        p_ttl_seconds
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Core Quote Management RPCs
-- ----------------------------------------------------------------------------

-- 8.1 CREATE DELIVERY QUOTE (Atomic DRAFT -> QUOTED)
CREATE OR REPLACE FUNCTION public.create_delivery_quote(
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
    p_route_calculated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member RECORD;
    v_loc RECORD;
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

    -- Coordinate validation
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
    v_km := pg_catalog.round(p_distance_meters::numeric / 1000.0, 3);
    v_minutes := pg_catalog.round(p_duration_seconds::numeric / 60.0, 3);

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

    -- 6. Insert delivery request (from DB pickup location)
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

    -- 7. Insert delivery quote (DRAFT -> QUOTED atomically)
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

    -- Promote to QUOTED
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

-- 8.2 GET QUOTE FOR ACTOR (With lazy expiration)
CREATE OR REPLACE FUNCTION public.get_quote_for_actor(
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
    v_request RECORD;
    v_member RECORD;
    v_status TEXT;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_quote_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: quote_id is required';
    END IF;

    SELECT q.*, r.business_id, r.location_id
    INTO v_quote
    FROM public.delivery_quotes q
    JOIN public.delivery_requests r ON r.id = q.delivery_request_id
    WHERE q.id = p_quote_id;

    IF v_quote.id IS NULL THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: Quote % does not exist', p_quote_id;
    END IF;

    -- Verify actor membership & scope
    SELECT bm.id, bm.role, bm.status, b.account_status AS business_status
    INTO v_member
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_quote.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' OR v_member.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have access to this quote';
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

    -- Lazy expiration
    v_status := v_quote.status;
    IF v_status = 'QUOTED' AND v_quote.expires_at <= pg_catalog.clock_timestamp() THEN
        UPDATE public.delivery_quotes
        SET status = 'EXPIRED'
        WHERE id = p_quote_id;
        v_status := 'EXPIRED';
    END IF;

    SELECT * INTO v_request
    FROM public.delivery_requests
    WHERE id = v_quote.delivery_request_id;

    RETURN pg_catalog.jsonb_build_object(
        'quote_id', v_quote.id,
        'delivery_request_id', v_quote.delivery_request_id,
        'status', v_status,
        'currency', v_quote.currency,
        'base_amount', pg_catalog.to_char(v_quote.base_amount, 'FM999999990.00'),
        'distance_amount', pg_catalog.to_char(v_quote.distance_amount, 'FM999999990.00'),
        'time_amount', pg_catalog.to_char(v_quote.time_amount, 'FM999999990.00'),
        'zone_amount', pg_catalog.to_char(v_quote.zone_amount, 'FM999999990.00'),
        'demand_amount', pg_catalog.to_char(v_quote.demand_amount, 'FM999999990.00'),
        'discount_amount', pg_catalog.to_char(v_quote.discount_amount, 'FM999999990.00'),
        'quoted_total', pg_catalog.to_char(v_quote.quoted_total, 'FM999999990.00'),
        'route_distance_meters', v_quote.route_distance_meters,
        'route_duration_seconds', v_quote.route_duration_seconds,
        'route_provider', v_quote.route_provider,
        'route_calculated_at', v_quote.route_calculated_at,
        'expires_at', v_quote.expires_at,
        'consumed_at', v_quote.consumed_at,
        'created_at', v_quote.created_at,
        'delivery_request', pg_catalog.jsonb_build_object(
            'id', v_request.id,
            'business_id', v_request.business_id,
            'location_id', v_request.location_id,
            'pickup_address', v_request.pickup_address_snapshot,
            'dropoff_address', v_request.dropoff_address_snapshot,
            'recipient_name', v_request.recipient_name,
            'package_type', v_request.package_type,
            'cash_to_collect', pg_catalog.to_char(v_request.cash_to_collect, 'FM999999990.00'),
            'created_at', v_request.created_at
        )
    );
END;
$$;

-- 8.3 CANCEL DELIVERY QUOTE
CREATE OR REPLACE FUNCTION public.cancel_delivery_quote(
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

    SELECT q.*, r.business_id, r.location_id
    INTO v_quote
    FROM public.delivery_quotes q
    JOIN public.delivery_requests r ON r.id = q.delivery_request_id
    WHERE q.id = p_quote_id;

    IF v_quote.id IS NULL THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: Quote % does not exist', p_quote_id;
    END IF;

    -- Verify actor membership & scope
    SELECT bm.id, bm.role, bm.status, b.account_status AS business_status
    INTO v_member
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_quote.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' OR v_member.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have access to this quote';
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

    -- Idempotent cancel replay
    IF v_quote.status = 'CANCELED' THEN
        RETURN pg_catalog.jsonb_build_object(
            'quote_id', v_quote.id,
            'status', 'CANCELED',
            'canceled_at', pg_catalog.clock_timestamp()
        );
    END IF;

    IF v_quote.status <> 'QUOTED' THEN
        RAISE EXCEPTION 'QUOTE_INVALID_STATE: Quote in status % cannot be canceled', v_quote.status;
    END IF;

    UPDATE public.delivery_quotes
    SET status = 'CANCELED'
    WHERE id = p_quote_id;

    RETURN pg_catalog.jsonb_build_object(
        'quote_id', v_quote.id,
        'status', 'CANCELED',
        'canceled_at', pg_catalog.clock_timestamp()
    );
END;
$$;

-- 8.4 CREATE DELIVERY REQUOTE (Reusing same delivery_request)
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
            RAISE EXCEPTION 'AUTH_FORBIDDEN: User lacks authority over this quote location';
        END IF;
    END IF;

    -- Requote is ONLY allowed for EXPIRED or CANCELED quotes
    -- (If currently QUOTED, lazy check first)
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

    -- Calculate pricing in PostgreSQL NUMERIC
    v_km := p_distance_meters::numeric / 1000.0;
    v_minutes := p_duration_seconds::numeric / 60.0;

    v_base_amount := v_rule.base_fee;
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
-- 8.5 UPDATE IDEMPOTENT OPERATION EXECUTOR (Include Phase 4 Operations)
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
        IF v_cached.expires_at <= pg_catalog.clock_timestamp() THEN
            DELETE FROM private.idempotency_responses WHERE id = v_cached.id;
            DELETE FROM public.idempotency_keys WHERE scope = p_scope AND key = p_key;
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
        v_status := 200;

    ELSIF p_operation_fn = 'cancel_delivery_quote' THEN
        v_result := public.cancel_delivery_quote(
            p_actor_user_id,
            (p_operation_params->>'quote_id')::uuid
        );
        v_status := 200;

    ELSIF p_operation_fn = 'create_delivery_requote' THEN
        v_result := public.create_delivery_requote(
            p_actor_user_id,
            (p_operation_params->>'quote_id')::uuid,
            (p_operation_params->>'distance_meters')::bigint,
            (p_operation_params->>'duration_seconds')::bigint,
            (p_operation_params->>'route_calculated_at')::timestamptz
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

    RETURN pg_catalog.jsonb_build_object(
        'cached', false,
        'status', v_status,
        'body', v_result
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8.6 Helper Read RPCs for API Edge Functions
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_business_location_coordinates(p_location_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT 
        l.id,
        l.business_id,
        l.name,
        l.address_text,
        l.is_active,
        extensions.ST_Y(l.location::extensions.geometry) AS latitude,
        extensions.ST_X(l.location::extensions.geometry) AS longitude
    INTO v_rec
    FROM public.business_locations l
    WHERE l.id = p_location_id;

    IF v_rec.id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'id', v_rec.id,
        'business_id', v_rec.business_id,
        'name', v_rec.name,
        'address_text', v_rec.address_text,
        'is_active', v_rec.is_active,
        'latitude', v_rec.latitude,
        'longitude', v_rec.longitude
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_requote_route_info(p_quote_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rec RECORD;
BEGIN
    SELECT 
        q.id AS quote_id,
        q.status,
        q.delivery_request_id,
        r.business_id,
        (r.pickup_address_snapshot->>'latitude')::double precision AS pickup_lat,
        (r.pickup_address_snapshot->>'longitude')::double precision AS pickup_lng,
        (r.dropoff_address_snapshot->>'latitude')::double precision AS dropoff_lat,
        (r.dropoff_address_snapshot->>'longitude')::double precision AS dropoff_lng
    INTO v_rec
    FROM public.delivery_quotes q
    JOIN public.delivery_requests r ON r.id = q.delivery_request_id
    WHERE q.id = p_quote_id;

    IF v_rec.quote_id IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'quote_id', v_rec.quote_id,
        'status', v_rec.status,
        'delivery_request_id', v_rec.delivery_request_id,
        'business_id', v_rec.business_id,
        'pickup_lat', v_rec.pickup_lat,
        'pickup_lng', v_rec.pickup_lng,
        'dropoff_lat', v_rec.dropoff_lat,
        'dropoff_lng', v_rec.dropoff_lng
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Table Grants & Function Revocations
-- ----------------------------------------------------------------------------

-- Table permissions
GRANT SELECT ON TABLE public.pricing_versions, public.pricing_rules, public.delivery_requests, public.delivery_quotes TO authenticated;
GRANT ALL ON TABLE public.pricing_versions, public.pricing_rules, public.delivery_requests, public.delivery_quotes, private.route_quote_cache TO service_role;
GRANT ALL ON TABLE public.pricing_versions, public.pricing_rules, public.delivery_requests, public.delivery_quotes, private.route_quote_cache TO postgres;

-- Function permissions
REVOKE EXECUTE ON FUNCTION private.get_route_cache(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_route_cache(TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION private.upsert_route_cache(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BIGINT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.upsert_route_cache(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BIGINT, BIGINT, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_delivery_quote(UUID, UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, NUMERIC, BIGINT, BIGINT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_delivery_quote(UUID, UUID, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, TEXT, TEXT, TEXT, NUMERIC, BIGINT, BIGINT, TIMESTAMPTZ) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_quote_for_actor(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_quote_for_actor(UUID, UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_delivery_quote(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_delivery_quote(UUID, UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.create_delivery_requote(UUID, UUID, BIGINT, BIGINT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_delivery_requote(UUID, UUID, BIGINT, BIGINT, TIMESTAMPTZ) TO service_role;

REVOKE EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_idempotent_operation(UUID, TEXT, TEXT, TEXT, TEXT, JSONB) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_business_location_coordinates(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_location_coordinates(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_requote_route_info(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_requote_route_info(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.get_route_cache(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_route_cache(TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION public.upsert_route_cache(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BIGINT, BIGINT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_route_cache(TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, BIGINT, BIGINT, INTEGER) TO service_role;

-- ----------------------------------------------------------------------------
-- 10. Initial Global Pricing Version & Rules Seed (MVP Standard Rate)
-- ----------------------------------------------------------------------------
INSERT INTO public.pricing_versions (id, name, currency, effective_from, is_active, quote_ttl_seconds)
VALUES ('dd000000-0000-4000-8000-000000000001', 'Tarifa Estándar Managua 2026', 'NIO', pg_catalog.clock_timestamp(), true, 300)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pricing_rules (id, pricing_version_id, base_fee, per_km_rate, per_minute_rate, min_fare)
VALUES ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 35.00, 12.00, 1.50, 45.00)
ON CONFLICT (id) DO NOTHING;

