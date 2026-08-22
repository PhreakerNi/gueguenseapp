-- ============================================================================
-- GÜEGÜENSE — FASE 5: CREACIÓN Y CICLO DE VIDA DEL ENVÍO (DELIVERY ENGINE)
-- Migration: 20260822000001_phase5_delivery_engine.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Table: public.deliveries
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES public.delivery_requests(id) ON DELETE RESTRICT,
    quote_id UUID NOT NULL REFERENCES public.delivery_quotes(id) ON DELETE RESTRICT,
    driver_id UUID NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'SEARCHING_DRIVER',
    currency TEXT NOT NULL DEFAULT 'NIO',
    quoted_price NUMERIC(10,2) NOT NULL CHECK (quoted_price >= 0),
    final_price NUMERIC(10,2) NULL CHECK (final_price IS NULL OR final_price >= 0),
    driver_earning NUMERIC(10,2) NULL CHECK (driver_earning IS NULL OR driver_earning >= 0),
    platform_revenue NUMERIC(10,2) NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp(),
    delivered_at TIMESTAMPTZ NULL,
    CONSTRAINT uq_deliveries_quote_id UNIQUE (quote_id),
    CONSTRAINT chk_deliveries_status CHECK (
        status IN (
            'SEARCHING_DRIVER',
            'DRIVER_ASSIGNED',
            'TO_PICKUP',
            'ARRIVED_PICKUP',
            'PICKED_UP',
            'TO_DROPOFF',
            'ARRIVED_DROPOFF',
            'DELIVERED',
            'RETURN_REQUIRED',
            'RETURNING',
            'RETURNED',
            'CANCELED',
            'FAILED'
        )
    ),
    CONSTRAINT chk_deliveries_delivered_at CHECK (
        (status = 'DELIVERED' AND delivered_at IS NOT NULL) OR
        (status <> 'DELIVERED' AND delivered_at IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_deliveries_request_id ON public.deliveries (request_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_quote_id ON public.deliveries (quote_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON public.deliveries (driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries (status);
CREATE INDEX IF NOT EXISTS idx_deliveries_created_at ON public.deliveries (created_at DESC);

-- Partial unique index: at most one active delivery per committed driver
CREATE UNIQUE INDEX IF NOT EXISTS idx_deliveries_active_driver
ON public.deliveries (driver_id)
WHERE status IN (
    'DRIVER_ASSIGNED',
    'TO_PICKUP',
    'ARRIVED_PICKUP',
    'PICKED_UP',
    'TO_DROPOFF',
    'ARRIVED_DROPOFF',
    'RETURN_REQUIRED',
    'RETURNING'
) AND driver_id IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2. Table: public.delivery_events (APPEND-ONLY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.delivery_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE RESTRICT,
    actor_user_id UUID NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    actor_type TEXT NOT NULL CHECK (actor_type IN ('BUSINESS', 'DRIVER', 'ADMIN', 'SYSTEM')),
    event_type TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_delivery_events_delivery_id ON public.delivery_events (delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_events_event_type ON public.delivery_events (event_type);
CREATE INDEX IF NOT EXISTS idx_delivery_events_created_at ON public.delivery_events (created_at DESC);

-- Enforce Strict Append-Only Behavior via Trigger
CREATE OR REPLACE FUNCTION public.prevent_delivery_events_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'APPEND_ONLY: Updates and deletes are not permitted on delivery_events';
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_events_no_update ON public.delivery_events;
CREATE TRIGGER trg_delivery_events_no_update
BEFORE UPDATE OR DELETE ON public.delivery_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delivery_events_mutation();

-- ----------------------------------------------------------------------------
-- 3. Row Level Security (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_events ENABLE ROW LEVEL SECURITY;

-- 3.1 Deliveries Policies
DROP POLICY IF EXISTS "deliveries_select_policy" ON public.deliveries;
CREATE POLICY "deliveries_select_policy" ON public.deliveries
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.delivery_requests r
        JOIN public.business_members bm ON bm.business_id = r.business_id
        JOIN public.businesses b ON b.id = bm.business_id
        WHERE r.id = public.deliveries.request_id
          AND bm.user_id = auth.uid()
          AND bm.status = 'ACTIVE'
          AND b.account_status = 'ACTIVE'
          AND (
              bm.role = 'business_owner'
              OR EXISTS (
                  SELECT 1 FROM public.business_member_locations bml
                  WHERE bml.business_member_id = bm.id
                    AND bml.business_location_id = r.location_id
              )
          )
    )
    OR (
        driver_id IS NOT NULL AND driver_id = auth.uid()
    )
);

-- Deny direct client insert/update/delete to authenticated and anon
DROP POLICY IF EXISTS "deliveries_insert_deny" ON public.deliveries;
CREATE POLICY "deliveries_insert_deny" ON public.deliveries
FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "deliveries_update_deny" ON public.deliveries;
CREATE POLICY "deliveries_update_deny" ON public.deliveries
FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "deliveries_delete_deny" ON public.deliveries;
CREATE POLICY "deliveries_delete_deny" ON public.deliveries
FOR DELETE TO authenticated USING (false);

-- 3.2 Delivery Events Policies
DROP POLICY IF EXISTS "delivery_events_select_policy" ON public.delivery_events;
CREATE POLICY "delivery_events_select_policy" ON public.delivery_events
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public.deliveries d
        JOIN public.delivery_requests r ON r.id = d.request_id
        JOIN public.business_members bm ON bm.business_id = r.business_id
        JOIN public.businesses b ON b.id = bm.business_id
        WHERE d.id = public.delivery_events.delivery_id
          AND bm.user_id = auth.uid()
          AND bm.status = 'ACTIVE'
          AND b.account_status = 'ACTIVE'
          AND (
              bm.role = 'business_owner'
              OR EXISTS (
                  SELECT 1 FROM public.business_member_locations bml
                  WHERE bml.business_member_id = bm.id
                    AND bml.business_location_id = r.location_id
              )
          )
    )
    OR EXISTS (
        SELECT 1 FROM public.deliveries d
        WHERE d.id = public.delivery_events.delivery_id
          AND d.driver_id IS NOT NULL
          AND d.driver_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "delivery_events_insert_deny" ON public.delivery_events;
CREATE POLICY "delivery_events_insert_deny" ON public.delivery_events
FOR INSERT TO authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "delivery_events_update_deny" ON public.delivery_events;
CREATE POLICY "delivery_events_update_deny" ON public.delivery_events
FOR UPDATE TO authenticated USING (false);

DROP POLICY IF EXISTS "delivery_events_delete_deny" ON public.delivery_events;
CREATE POLICY "delivery_events_delete_deny" ON public.delivery_events
FOR DELETE TO authenticated USING (false);

-- ----------------------------------------------------------------------------
-- 4. Atomic Function: public.create_delivery_from_quote_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_delivery_from_quote_atomic(
    p_actor_id UUID,
    p_quote_id UUID,
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
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
    v_exp TIMESTAMPTZ := v_now + INTERVAL '24 hours';
    v_lock_key BIGINT;
    v_res RECORD;
    v_quote RECORD;
    v_member RECORD;
    v_delivery_id UUID;
    v_response JSONB;
BEGIN
    IF p_reservation_token IS NULL OR p_lease_generation IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: reservation_token and lease_generation are required';
    END IF;

    -- 1. Validate fencing token under advisory lock
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_actor_id::text || ':create_delivery:' || p_quote_id::text || ':' || p_idempotency_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    SELECT * INTO v_res
    FROM private.idempotency_reservations
    WHERE actor_user_id = p_actor_id
      AND scope = 'create_delivery:' || p_quote_id::text
      AND key = p_idempotency_key
    FOR UPDATE;

    IF v_res.key IS NULL OR v_res.status <> 'PENDING'
       OR v_res.reservation_token <> p_reservation_token
       OR v_res.lease_generation <> p_lease_generation
       OR v_res.lease_expires_at <= v_now THEN
        RAISE EXCEPTION 'IDEMPOTENCY_LEASE_LOST: Idempotency lease was lost, expired, or token mismatch';
    END IF;

    -- 2. Lock Quote and fetch Request & Location Details
    SELECT
        q.id,
        q.delivery_request_id,
        q.status,
        q.currency,
        q.quoted_total,
        q.expires_at,
        r.business_id,
        r.location_id
    INTO v_quote
    FROM public.delivery_quotes q
    JOIN public.delivery_requests r ON r.id = q.delivery_request_id
    WHERE q.id = p_quote_id
    FOR UPDATE OF q;

    IF v_quote.id IS NULL THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: Quote % does not exist', p_quote_id;
    END IF;

    -- 3. Verify Actor Active Membership and Business Scope
    SELECT bm.id, bm.role, bm.status, b.account_status AS business_status
    INTO v_member
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_quote.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' OR v_member.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have active access to this business';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = v_quote.location_id
        ) THEN
            RAISE EXCEPTION 'INVALID_LOCATION_SCOPE: User lacks authority over quote location';
        END IF;
    END IF;

    -- 4. Check Quote Status and Expiry
    IF v_quote.status = 'CANCELED' THEN
        RAISE EXCEPTION 'QUOTE_INVALID_STATE: Quote is CANCELED';
    END IF;

    IF v_quote.status = 'CONSUMED' THEN
        RAISE EXCEPTION 'QUOTE_ALREADY_CONSUMED: Quote has already been consumed';
    END IF;

    IF v_quote.status <> 'QUOTED' THEN
        RAISE EXCEPTION 'QUOTE_INVALID_STATE: Quote is in status %', v_quote.status;
    END IF;

    IF v_quote.expires_at <= v_now THEN
        -- Mark as expired in DB
        UPDATE public.delivery_quotes
        SET status = 'EXPIRED'
        WHERE id = p_quote_id;
        RAISE EXCEPTION 'QUOTE_EXPIRED: Quote % has expired', p_quote_id;
    END IF;

    -- Ensure no existing delivery exists for this quote
    IF EXISTS (SELECT 1 FROM public.deliveries WHERE quote_id = p_quote_id) THEN
        RAISE EXCEPTION 'QUOTE_ALREADY_CONSUMED: Delivery already created for quote %', p_quote_id;
    END IF;

    -- 5. Mark Quote as CONSUMED
    UPDATE public.delivery_quotes
    SET status = 'CONSUMED',
        consumed_at = v_now
    WHERE id = p_quote_id;

    -- 6. Insert new Delivery in SEARCHING_DRIVER state
    v_delivery_id := pg_catalog.gen_random_uuid();

    INSERT INTO public.deliveries (
        id,
        request_id,
        quote_id,
        driver_id,
        status,
        currency,
        quoted_price,
        final_price,
        driver_earning,
        platform_revenue,
        created_at,
        updated_at,
        delivered_at
    ) VALUES (
        v_delivery_id,
        v_quote.delivery_request_id,
        v_quote.id,
        NULL,
        'SEARCHING_DRIVER',
        v_quote.currency,
        v_quote.quoted_total,
        NULL,
        NULL,
        NULL,
        v_now,
        v_now,
        NULL
    );

    -- 7. Insert Canonical Audit Events (Append-Only)
    INSERT INTO public.delivery_events (
        delivery_id,
        actor_user_id,
        actor_type,
        event_type,
        metadata,
        created_at
    ) VALUES 
      (
        v_delivery_id,
        p_actor_id,
        'BUSINESS',
        'QUOTE_CONSUMED',
        pg_catalog.jsonb_build_object(
            'quote_id', v_quote.id,
            'quoted_total', v_quote.quoted_total
        ),
        v_now
      ),
      (
        v_delivery_id,
        p_actor_id,
        'BUSINESS',
        'DELIVERY_CREATED',
        pg_catalog.jsonb_build_object(
            'delivery_id', v_delivery_id,
            'request_id', v_quote.delivery_request_id
        ),
        v_now
      ),
      (
        v_delivery_id,
        p_actor_id,
        'SYSTEM',
        'SEARCH_STARTED',
        pg_catalog.jsonb_build_object(
            'initial_status', 'SEARCHING_DRIVER'
        ),
        v_now
      );

    -- 8. Build Response DTO
    v_response := pg_catalog.jsonb_build_object(
        'delivery_id', v_delivery_id,
        'request_id', v_quote.delivery_request_id,
        'quote_id', v_quote.id,
        'status', 'SEARCHING_DRIVER',
        'currency', v_quote.currency,
        'quoted_price', pg_catalog.to_char(v_quote.quoted_total, 'FM999999990.00'),
        'created_at', pg_catalog.to_jsonb(v_now)
    );

    -- 9. Commit Idempotency Response atomically
    UPDATE private.idempotency_reservations
    SET status = 'COMPLETED',
        response_status = 201,
        response_body = v_response,
        expires_at = v_exp,
        updated_at = v_now
    WHERE id = v_res.id;

    INSERT INTO private.idempotency_responses (
        actor_user_id, scope, key, request_fingerprint,
        response_status, response_body, expires_at, created_at
    ) VALUES (
        p_actor_id, 'create_delivery:' || p_quote_id::text, p_idempotency_key, p_request_fingerprint,
        201, v_response, v_exp, v_now
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body,
        expires_at = EXCLUDED.expires_at;

    RETURN v_response;
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. Atomic Function: public.cancel_delivery_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_delivery_atomic(
    p_actor_id UUID,
    p_delivery_id UUID,
    p_reason TEXT,
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
    v_now TIMESTAMPTZ := pg_catalog.clock_timestamp();
    v_exp TIMESTAMPTZ := v_now + INTERVAL '24 hours';
    v_lock_key BIGINT;
    v_res RECORD;
    v_clean_reason TEXT := pg_catalog.btrim(COALESCE(p_reason, ''));
    v_delivery RECORD;
    v_member RECORD;
    v_response JSONB;
BEGIN
    IF v_clean_reason = '' THEN
        RAISE EXCEPTION 'REASON_REQUIRED: Cancellation reason is required';
    END IF;

    IF p_reservation_token IS NULL OR p_lease_generation IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: reservation_token and lease_generation are required';
    END IF;

    -- 1. Validate fencing token under advisory lock
    v_lock_key := ('x' || pg_catalog.substr(pg_catalog.md5(p_actor_id::text || ':cancel_delivery:' || p_delivery_id::text || ':' || p_idempotency_key), 1, 16))::bit(64)::bigint;
    PERFORM pg_catalog.pg_advisory_xact_lock(v_lock_key);

    SELECT * INTO v_res
    FROM private.idempotency_reservations
    WHERE actor_user_id = p_actor_id
      AND scope = 'cancel_delivery:' || p_delivery_id::text
      AND key = p_idempotency_key
    FOR UPDATE;

    IF v_res.key IS NULL OR v_res.status <> 'PENDING'
       OR v_res.reservation_token <> p_reservation_token
       OR v_res.lease_generation <> p_lease_generation
       OR v_res.lease_expires_at <= v_now THEN
        RAISE EXCEPTION 'IDEMPOTENCY_LEASE_LOST: Idempotency lease was lost, expired, or token mismatch';
    END IF;

    -- 2. Lock Delivery and fetch Request Details
    SELECT
        d.id,
        d.status,
        d.quote_id,
        d.request_id,
        r.business_id,
        r.location_id
    INTO v_delivery
    FROM public.deliveries d
    JOIN public.delivery_requests r ON r.id = d.request_id
    WHERE d.id = p_delivery_id
    FOR UPDATE OF d;

    IF v_delivery.id IS NULL THEN
        RAISE EXCEPTION 'DELIVERY_NOT_FOUND: Delivery % does not exist', p_delivery_id;
    END IF;

    -- 3. Verify Actor Active Membership and Business Scope
    SELECT bm.id, bm.role, bm.status, b.account_status AS business_status
    INTO v_member
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_delivery.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' OR v_member.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have active access to this business';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = v_delivery.location_id
        ) THEN
            RAISE EXCEPTION 'INVALID_LOCATION_SCOPE: User lacks authority over delivery location';
        END IF;
    END IF;

    -- 4. Verify Delivery Status
    IF v_delivery.status = 'CANCELED' THEN
        RAISE EXCEPTION 'INVALID_DELIVERY_STATE: Delivery is already CANCELED';
    END IF;

    IF v_delivery.status IN (
        'DRIVER_ASSIGNED',
        'TO_PICKUP',
        'ARRIVED_PICKUP',
        'PICKED_UP',
        'TO_DROPOFF',
        'ARRIVED_DROPOFF'
    ) THEN
        RAISE EXCEPTION 'CANNOT_CANCEL_IN_TRANSIT: In-transit deliveries cannot be canceled via this endpoint';
    END IF;

    IF v_delivery.status <> 'SEARCHING_DRIVER' THEN
        RAISE EXCEPTION 'INVALID_DELIVERY_STATE: Delivery cannot be canceled in status %', v_delivery.status;
    END IF;

    -- 5. Mutate status to CANCELED (Quote remains CONSUMED)
    UPDATE public.deliveries
    SET status = 'CANCELED',
        updated_at = v_now
    WHERE id = p_delivery_id;

    -- 6. Insert Single Audit Event
    INSERT INTO public.delivery_events (
        delivery_id,
        actor_user_id,
        actor_type,
        event_type,
        metadata,
        created_at
    ) VALUES (
        p_delivery_id,
        p_actor_id,
        'BUSINESS',
        'DELIVERY_CANCELED',
        pg_catalog.jsonb_build_object(
            'reason', v_clean_reason,
            'canceled_by', p_actor_id,
            'previous_status', v_delivery.status
        ),
        v_now
    );

    -- 7. Build Response DTO
    v_response := pg_catalog.jsonb_build_object(
        'delivery_id', v_delivery.id,
        'status', 'CANCELED',
        'reason', v_clean_reason,
        'canceled_at', pg_catalog.to_jsonb(v_now)
    );

    -- 8. Complete Idempotency Lease atomically
    UPDATE private.idempotency_reservations
    SET status = 'COMPLETED',
        response_status = 200,
        response_body = v_response,
        expires_at = v_exp,
        updated_at = v_now
    WHERE id = v_res.id;

    INSERT INTO private.idempotency_responses (
        actor_user_id, scope, key, request_fingerprint,
        response_status, response_body, expires_at, created_at
    ) VALUES (
        p_actor_id, 'cancel_delivery:' || p_delivery_id::text, p_idempotency_key, p_request_fingerprint,
        200, v_response, v_exp, v_now
    )
    ON CONFLICT (actor_user_id, scope, key) DO UPDATE SET
        request_fingerprint = EXCLUDED.request_fingerprint,
        response_status = EXCLUDED.response_status,
        response_body = EXCLUDED.response_body,
        expires_at = EXCLUDED.expires_at;

    RETURN v_response;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6. Read Helper: public.get_delivery_detail
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_delivery_detail(
    p_actor_id UUID,
    p_delivery_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_delivery RECORD;
    v_member RECORD;
BEGIN
    SELECT
        d.id AS delivery_id,
        d.request_id,
        d.quote_id,
        d.driver_id,
        d.status,
        d.currency,
        d.quoted_price,
        d.final_price,
        d.driver_earning,
        d.platform_revenue,
        d.created_at,
        d.updated_at,
        d.delivered_at,
        r.business_id,
        r.location_id,
        r.recipient_name,
        r.recipient_phone,
        r.package_type,
        r.cash_to_collect,
        r.pickup_address_snapshot,
        r.dropoff_address_snapshot
    INTO v_delivery
    FROM public.deliveries d
    JOIN public.delivery_requests r ON r.id = d.request_id
    WHERE d.id = p_delivery_id;

    IF v_delivery.delivery_id IS NULL THEN
        RAISE EXCEPTION 'DELIVERY_NOT_FOUND: Delivery % does not exist', p_delivery_id;
    END IF;

    -- Verify actor access
    SELECT bm.id, bm.role, bm.status, b.account_status AS business_status
    INTO v_member
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_delivery.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' OR v_member.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have access to this delivery';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = v_delivery.location_id
        ) THEN
            RAISE EXCEPTION 'AUTH_FORBIDDEN: User lacks authority over delivery location';
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'delivery_id', v_delivery.delivery_id,
        'request_id', v_delivery.request_id,
        'quote_id', v_delivery.quote_id,
        'driver_id', v_delivery.driver_id,
        'status', v_delivery.status,
        'currency', v_delivery.currency,
        'quoted_price', pg_catalog.to_char(v_delivery.quoted_price, 'FM999999990.00'),
        'final_price', CASE WHEN v_delivery.final_price IS NOT NULL THEN pg_catalog.to_char(v_delivery.final_price, 'FM999999990.00') ELSE NULL END,
        'driver_earning', CASE WHEN v_delivery.driver_earning IS NOT NULL THEN pg_catalog.to_char(v_delivery.driver_earning, 'FM999999990.00') ELSE NULL END,
        'platform_revenue', CASE WHEN v_delivery.platform_revenue IS NOT NULL THEN pg_catalog.to_char(v_delivery.platform_revenue, 'FM999999990.00') ELSE NULL END,
        'created_at', pg_catalog.to_jsonb(v_delivery.created_at),
        'updated_at', pg_catalog.to_jsonb(v_delivery.updated_at),
        'delivered_at', pg_catalog.to_jsonb(v_delivery.delivered_at),
        'package_type', v_delivery.package_type,
        'cash_to_collect', pg_catalog.to_char(v_delivery.cash_to_collect, 'FM999999990.00'),
        'recipient_name', v_delivery.recipient_name,
        'recipient_phone', v_delivery.recipient_phone,
        'pickup_address', v_delivery.pickup_address_snapshot,
        'dropoff_address', v_delivery.dropoff_address_snapshot
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. Read Helper: public.list_business_deliveries
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_business_deliveries(
    p_actor_id UUID,
    p_business_id UUID,
    p_location_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_cursor_created_at TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_member_id UUID;
    v_member_role TEXT;
    v_member_status TEXT;
    v_business_status TEXT;
    v_limit INTEGER;
    v_rows JSONB;
BEGIN
    v_limit := COALESCE(p_limit, 20);
    IF v_limit < 1 THEN
        v_limit := 1;
    ELSIF v_limit > 50 THEN
        v_limit := 50;
    END IF;

    -- Verify actor access
    SELECT bm.id, bm.role, bm.status, b.account_status
    INTO v_member_id, v_member_role, v_member_status, v_business_status
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = p_business_id;

    IF v_member_id IS NULL OR v_member_status <> 'ACTIVE' OR v_business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have access to this business';
    END IF;

    -- If location_id is provided, verify scope
    IF p_location_id IS NOT NULL THEN
        IF v_member_role <> 'business_owner' THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.business_member_locations bml
                WHERE bml.business_member_id = v_member_id
                  AND bml.business_location_id = p_location_id
            ) THEN
                RAISE EXCEPTION 'AUTH_FORBIDDEN: User lacks authority over specified location';
            END IF;
        END IF;
    END IF;

    -- Query Deliveries with Deterministic Cursor Pagination (created_at DESC, id DESC)
    WITH filtered AS (
        SELECT
            d.id AS delivery_id,
            d.request_id,
            d.quote_id,
            d.driver_id,
            d.status,
            d.currency,
            d.quoted_price,
            d.final_price,
            d.created_at,
            d.updated_at,
            r.location_id,
            r.recipient_name,
            r.recipient_phone,
            r.package_type,
            r.pickup_address_snapshot,
            r.dropoff_address_snapshot
        FROM public.deliveries d
        JOIN public.delivery_requests r ON r.id = d.request_id
        WHERE r.business_id = p_business_id
          AND (
              v_member_role = 'business_owner'
              OR EXISTS (
                  SELECT 1 FROM public.business_member_locations bml
                  WHERE bml.business_member_id = v_member_id
                    AND bml.business_location_id = r.location_id
              )
          )
          AND (p_location_id IS NULL OR r.location_id = p_location_id)
          AND (p_status IS NULL OR d.status = p_status)
          AND (
              p_cursor_created_at IS NULL
              OR (d.created_at < p_cursor_created_at)
              OR (d.created_at = p_cursor_created_at AND (p_cursor_id IS NULL OR d.id < p_cursor_id))
          )
        ORDER BY d.created_at DESC, d.id DESC
        LIMIT v_limit
    )
    SELECT
        COALESCE(
            pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                    'delivery_id', f.delivery_id,
                    'request_id', f.request_id,
                    'quote_id', f.quote_id,
                    'driver_id', f.driver_id,
                    'status', f.status,
                    'currency', f.currency,
                    'quoted_price', pg_catalog.to_char(f.quoted_price, 'FM999999990.00'),
                    'final_price', CASE WHEN f.final_price IS NOT NULL THEN pg_catalog.to_char(f.final_price, 'FM999999990.00') ELSE NULL END,
                    'created_at', pg_catalog.to_jsonb(f.created_at),
                    'updated_at', pg_catalog.to_jsonb(f.updated_at),
                    'location_id', f.location_id,
                    'recipient_name', f.recipient_name,
                    'recipient_phone', f.recipient_phone,
                    'package_type', f.package_type,
                    'pickup_address', f.pickup_address_snapshot,
                    'dropoff_address', f.dropoff_address_snapshot
                )
            ),
            '[]'::jsonb
        )
    INTO v_rows
    FROM filtered f;

    RETURN pg_catalog.jsonb_build_object(
        'deliveries', COALESCE(v_rows, '[]'::jsonb),
        'count', COALESCE(pg_catalog.jsonb_array_length(COALESCE(v_rows, '[]'::jsonb)), 0)
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 8. Scope Verification Helpers (Live Authorization Check Before Replay)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_delivery_creation_scope(
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

    SELECT q.id, q.status, r.business_id, r.location_id
    INTO v_quote
    FROM public.delivery_quotes q
    JOIN public.delivery_requests r ON r.id = q.delivery_request_id
    WHERE q.id = p_quote_id;

    IF v_quote.id IS NULL THEN
        RAISE EXCEPTION 'QUOTE_NOT_FOUND: Quote % does not exist', p_quote_id;
    END IF;

    SELECT bm.id, bm.role, bm.status, b.account_status AS business_status
    INTO v_member
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_quote.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' OR v_member.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have active access to this business';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = v_quote.location_id
        ) THEN
            RAISE EXCEPTION 'INVALID_LOCATION_SCOPE: User lacks authority over quote location';
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

CREATE OR REPLACE FUNCTION public.verify_delivery_cancel_scope(
    p_actor_id UUID,
    p_delivery_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_delivery RECORD;
    v_member RECORD;
BEGIN
    IF p_actor_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED: Actor ID is required';
    END IF;

    IF p_delivery_id IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENT: delivery_id is required';
    END IF;

    SELECT d.id, d.status, r.business_id, r.location_id
    INTO v_delivery
    FROM public.deliveries d
    JOIN public.delivery_requests r ON r.id = d.request_id
    WHERE d.id = p_delivery_id;

    IF v_delivery.id IS NULL THEN
        RAISE EXCEPTION 'DELIVERY_NOT_FOUND: Delivery % does not exist', p_delivery_id;
    END IF;

    SELECT bm.id, bm.role, bm.status, b.account_status AS business_status
    INTO v_member
    FROM public.business_members bm
    JOIN public.businesses b ON b.id = bm.business_id
    WHERE bm.user_id = p_actor_id
      AND bm.business_id = v_delivery.business_id;

    IF v_member.id IS NULL OR v_member.status <> 'ACTIVE' OR v_member.business_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'AUTH_FORBIDDEN: User does not have active access to this business';
    END IF;

    IF v_member.role <> 'business_owner' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.business_member_locations bml
            WHERE bml.business_member_id = v_member.id
              AND bml.business_location_id = v_delivery.location_id
        ) THEN
            RAISE EXCEPTION 'INVALID_LOCATION_SCOPE: User lacks authority over delivery location';
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'delivery_id', v_delivery.id,
        'business_id', v_delivery.business_id,
        'location_id', v_delivery.location_id,
        'status', v_delivery.status
    );
END;
$$;

-- ----------------------------------------------------------------------------
-- 9. Grant & Revoke Execution Permissions (Strict ACL)
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.prevent_delivery_events_mutation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_delivery_from_quote_atomic(UUID, UUID, TEXT, TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_delivery_atomic(UUID, UUID, TEXT, TEXT, TEXT, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_delivery_detail(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.list_business_deliveries(UUID, UUID, UUID, TEXT, INTEGER, TIMESTAMPTZ, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_delivery_creation_scope(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_delivery_cancel_scope(UUID, UUID) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prevent_delivery_events_mutation() TO service_role;
GRANT EXECUTE ON FUNCTION public.create_delivery_from_quote_atomic(UUID, UUID, TEXT, TEXT, UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_delivery_atomic(UUID, UUID, TEXT, TEXT, TEXT, UUID, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_delivery_detail(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_business_deliveries(UUID, UUID, UUID, TEXT, INTEGER, TIMESTAMPTZ, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_delivery_creation_scope(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_delivery_cancel_scope(UUID, UUID) TO service_role;

