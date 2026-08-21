BEGIN;

SELECT plan(67);

-- ============================================================================
-- 1. Structural Checks: Tables, Columns & Indexes (11 assertions: 1-11)
-- ============================================================================
SELECT has_table('public', 'pricing_versions', 'public.pricing_versions exists');
SELECT is(
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pricing_versions'),
    true,
    'public.pricing_versions has RLS enabled'
);

SELECT has_table('public', 'pricing_rules', 'public.pricing_rules exists');
SELECT is(
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'pricing_rules'),
    true,
    'public.pricing_rules has RLS enabled'
);

SELECT has_table('public', 'delivery_requests', 'public.delivery_requests exists');
SELECT is(
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'delivery_requests'),
    true,
    'public.delivery_requests has RLS enabled'
);

SELECT has_table('public', 'delivery_quotes', 'public.delivery_quotes exists');
SELECT is(
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'delivery_quotes'),
    true,
    'public.delivery_quotes has RLS enabled'
);

SELECT has_table('private', 'route_quote_cache', 'private.route_quote_cache exists');
SELECT has_table('private', 'idempotency_reservations', 'private.idempotency_reservations exists');

SELECT is(
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pricing_versions' AND indexname = 'idx_pricing_versions_single_active'),
    1::bigint,
    'Unique index idx_pricing_versions_single_active exists'
);

-- ============================================================================
-- 2. Function Signatures & Security Checks (10 assertions: 12-21)
-- ============================================================================
SELECT has_function('public', 'create_delivery_quote', ARRAY['uuid', 'uuid', 'text', 'double precision', 'double precision', 'text', 'text', 'text', 'numeric', 'bigint', 'bigint', 'timestamp with time zone'], 'create_delivery_quote exists with correct signature');
SELECT has_function('public', 'get_quote_for_actor', ARRAY['uuid', 'uuid'], 'get_quote_for_actor exists with correct signature');
SELECT has_function('public', 'cancel_delivery_quote', ARRAY['uuid', 'uuid'], 'cancel_delivery_quote exists with correct signature');
SELECT has_function('public', 'create_delivery_requote', ARRAY['uuid', 'uuid', 'bigint', 'bigint', 'timestamp with time zone'], 'create_delivery_requote exists with correct signature');
SELECT has_function('public', 'get_idempotent_response', ARRAY['uuid', 'text', 'text'], 'public.get_idempotent_response exists with correct signature');
SELECT has_function('public', 'acquire_idempotency_lease', ARRAY['uuid', 'text', 'text', 'text', 'integer'], 'public.acquire_idempotency_lease exists with correct signature');
SELECT has_function('public', 'verify_quote_creation_scope', ARRAY['uuid', 'uuid'], 'public.verify_quote_creation_scope exists with correct signature');
SELECT has_function('public', 'verify_requote_scope', ARRAY['uuid', 'uuid'], 'public.verify_requote_scope exists with correct signature');
SELECT has_function('private', 'get_route_cache', ARRAY['text'], 'private.get_route_cache exists');
SELECT has_function('private', 'upsert_route_cache', ARRAY['text', 'text', 'double precision', 'double precision', 'double precision', 'double precision', 'bigint', 'bigint', 'integer'], 'private.upsert_route_cache exists');

-- ============================================================================
-- 3. Synthetic Seed Data Setup (service_role)
-- ============================================================================
SET LOCAL ROLE postgres;

-- Users
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES 
    ('a0000000-0000-4000-8000-000000000001', 'owner_a@test.com', '{"full_name":"Owner A"}'::jsonb),
    ('a0000000-0000-4000-8000-000000000002', 'owner_b@test.com', '{"full_name":"Owner B"}'::jsonb),
    ('a0000000-0000-4000-8000-000000000003', 'manager_a@test.com', '{"full_name":"Manager A"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Businesses & Locations
INSERT INTO public.businesses (id, legal_name, brand_name, tax_id, account_status)
VALUES 
    ('b0000000-0000-4000-8000-000000000001', 'Empresa Alfa S.A.', 'Alfa Store', 'J0310444400001', 'ACTIVE'),
    ('b0000000-0000-4000-8000-000000000002', 'Empresa Beta S.A.', 'Beta Store', 'J0310444400002', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_members (id, business_id, user_id, role, status)
VALUES
    ('bb000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'business_owner', 'ACTIVE'),
    ('bb000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'business_owner', 'ACTIVE'),
    ('bb000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'business_manager', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_locations (id, business_id, name, address_text, location, is_active)
VALUES
    ('cc000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Sucursal Central Alfa', 'Plaza España Managua', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.251389, 12.136389), 4326), true),
    ('cc000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Sucursal Carretera Masaya', 'Km 8 Carretera a Masaya', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.220000, 12.100000), 4326), true),
    ('cc000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'Sucursal Beta Centro', 'Metrocentro Managua', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.261389, 12.126389), 4326), true)
ON CONFLICT (id) DO NOTHING;

-- Assign manager A only to location 1
INSERT INTO public.business_member_locations (business_member_id, business_location_id)
VALUES ('bb000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;

-- Seed Pricing Version & Rules (base_fee: 35.00, per_km: 12.00, per_min: 1.50, min_fare: 45.00, ttl: 300)
INSERT INTO public.pricing_versions (id, name, currency, effective_from, is_active, quote_ttl_seconds)
VALUES ('dd000000-0000-4000-8000-000000000001', 'Tarifa Estándar Managua 2026', 'NIO', now(), true, 300)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.pricing_rules (id, pricing_version_id, base_fee, per_km_rate, per_minute_rate, min_fare)
VALUES ('ee000000-0000-4000-8000-000000000001', 'dd000000-0000-4000-8000-000000000001', 35.00, 12.00, 1.50, 45.00)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 4. Direct Client Execution Revoked (4 assertions: 20-23)
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'a0000000-0000-4000-8000-000000000001';

SELECT throws_like(
    $$ SELECT public.create_delivery_quote('a0000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid, 'Destino', 12.14, -86.26, 'Juan', '+50588888888', 'PARCEL', 0, 4500, 780, now()) $$,
    '%permission denied%',
    'Direct execution of create_delivery_quote is denied to authenticated'
);

SELECT throws_like(
    $$ SELECT public.get_quote_for_actor('a0000000-0000-4000-8000-000000000001'::uuid, gen_random_uuid()) $$,
    '%permission denied%',
    'Direct execution of get_quote_for_actor is denied to authenticated'
);

SELECT throws_like(
    $$ SELECT public.cancel_delivery_quote('a0000000-0000-4000-8000-000000000001'::uuid, gen_random_uuid()) $$,
    '%permission denied%',
    'Direct execution of cancel_delivery_quote is denied to authenticated'
);

SELECT throws_like(
    $$ SELECT public.create_delivery_requote('a0000000-0000-4000-8000-000000000001'::uuid, gen_random_uuid(), 4500, 780, now()) $$,
    '%permission denied%',
    'Direct execution of create_delivery_requote is denied to authenticated'
);

-- ============================================================================
-- 5. Business Location & Scope Enforcement (3 assertions: 24-26)
-- ============================================================================
SET LOCAL ROLE service_role;

-- 24. Manager A attempting quote for Location 2 (unassigned) -> Throws INVALID_LOCATION_SCOPE
SELECT throws_like(
    $$ SELECT public.create_delivery_quote(
        'a0000000-0000-4000-8000-000000000003'::uuid,
        'cc000000-0000-4000-8000-000000000002'::uuid,
        'Altamira', 12.12, -86.24, 'Pedro', '+50588889999', 'DOCUMENT', 0, 3000, 600, now()
    ) $$,
    '%INVALID_LOCATION_SCOPE%',
    'Manager cannot create quote for location outside their assigned scope'
);

-- 25. Non-member user attempting quote for Location 1 -> Throws AUTH_FORBIDDEN
SELECT throws_like(
    $$ SELECT public.create_delivery_quote(
        'a0000000-0000-4000-8000-000000000002'::uuid,
        'cc000000-0000-4000-8000-000000000001'::uuid,
        'Altamira', 12.12, -86.24, 'Pedro', '+50588889999', 'DOCUMENT', 0, 3000, 600, now()
    ) $$,
    '%AUTH_FORBIDDEN%',
    'Non-member user cannot create quote for another business location'
);

-- 26. Invalid dropoff coordinates -> Throws VALIDATION_ERROR
SELECT throws_like(
    $$ SELECT public.create_delivery_quote(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'cc000000-0000-4000-8000-000000000001'::uuid,
        'Invalid Coords', 95.0, -86.24, 'Pedro', '+50588889999', 'DOCUMENT', 0, 3000, 600, now()
    ) $$,
    '%VALIDATION_ERROR%',
    'Dropoff coordinates outside [-90,90] range fail validation'
);

-- ============================================================================
-- 6. Successful Quote Creation & Exact Math (5 assertions: 27-31)
-- ============================================================================
DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.create_delivery_quote(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'cc000000-0000-4000-8000-000000000001'::uuid,
        'Colonia Los Robles',
        12.125000,
        -86.265000,
        'Carlos Mendoza',
        '+50588881234',
        'PARCEL',
        150.00,
        4500,
        780,
        now()
    );
    PERFORM set_config('test.quote_id', v_res->>'quote_id', true);
    PERFORM set_config('test.request_id', v_res->>'delivery_request_id', true);
    PERFORM set_config('test.quoted_total', v_res->>'quoted_total', true);
    PERFORM set_config('test.status', v_res->>'status', true);
END $$;

SELECT is(
    current_setting('test.status'),
    'QUOTED',
    'Quote created atomically in QUOTED status'
);

SELECT is(
    current_setting('test.quoted_total'),
    '108.50',
    'Pricing formula calculates exact total (35 + 54 + 19.50 = 108.50 NIO)'
);

SELECT is(
    (SELECT pickup_address_snapshot->>'address_text' FROM public.delivery_requests WHERE id = current_setting('test.request_id')::uuid),
    'Plaza España Managua',
    'Pickup address snapshot is retrieved exclusively from business_locations DB'
);

SELECT is(
    (SELECT cash_to_collect FROM public.delivery_requests WHERE id = current_setting('test.request_id')::uuid),
    150.00::numeric,
    'Cash to collect is preserved on delivery_requests record'
);

SELECT is(
    (SELECT count(*) FROM public.delivery_quotes WHERE delivery_request_id = current_setting('test.request_id')::uuid AND status = 'QUOTED'),
    1::bigint,
    'Single active quote exists for the delivery request'
);

-- ============================================================================
-- 7. Minimum Fare Application (1 assertion: 32)
-- ============================================================================
DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.create_delivery_quote(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'cc000000-0000-4000-8000-000000000001'::uuid,
        'Cerca de Plaza España',
        12.137000,
        -86.252000,
        'Maria Gomez',
        '+50588885678',
        'DOCUMENT',
        0,
        500,
        120,
        now()
    );
    PERFORM set_config('test.min_quoted_total', v_res->>'quoted_total', true);
END $$;

SELECT is(
    current_setting('test.min_quoted_total'),
    '45.00',
    'Minimum fare constraint applied when subtotal is below min_fare'
);

-- ============================================================================
-- 8. Get Quote & Tenant RLS Read Isolation (3 assertions: 33-35)
-- ============================================================================
DO $$
DECLARE
    v_get JSONB;
BEGIN
    v_get := public.get_quote_for_actor(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        current_setting('test.quote_id')::uuid
    );
    PERFORM set_config('test.fetched_status', v_get->>'status', true);
END $$;

SELECT is(
    current_setting('test.fetched_status'),
    'QUOTED',
    'get_quote_for_actor returns quote details for authorized owner'
);

SELECT throws_like(
    $$ SELECT public.get_quote_for_actor(
        'a0000000-0000-4000-8000-000000000002'::uuid,
        current_setting('test.quote_id')::uuid
    ) $$,
    '%AUTH_FORBIDDEN%',
    'Tenant B cannot access quotes belonging to Tenant A'
);

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'a0000000-0000-4000-8000-000000000002';

SELECT is(
    (SELECT count(*) FROM public.delivery_quotes WHERE id = current_setting('test.quote_id')::uuid),
    0::bigint,
    'RLS SELECT hides Tenant A quote from Tenant B user'
);

-- ============================================================================
-- 9. Quote Cancellation & Idempotency (4 assertions: 36-39)
-- ============================================================================
SET LOCAL ROLE service_role;

DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.cancel_delivery_quote(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        current_setting('test.quote_id')::uuid
    );
    PERFORM set_config('test.cancel_status', v_res->>'status', true);
END $$;

SELECT is(
    current_setting('test.cancel_status'),
    'CANCELED',
    'cancel_delivery_quote transitions quote to CANCELED'
);

SELECT is(
    (SELECT (public.cancel_delivery_quote('a0000000-0000-4000-8000-000000000001'::uuid, current_setting('test.quote_id')::uuid))->>'status'),
    'CANCELED',
    'Repeated cancel on CANCELED quote is idempotent'
);

SELECT is(
    (SELECT status FROM public.delivery_quotes WHERE id = current_setting('test.quote_id')::uuid),
    'CANCELED',
    'Database record status is CANCELED'
);

SELECT throws_like(
    $$ SELECT public.cancel_delivery_quote(
        'a0000000-0000-4000-8000-000000000002'::uuid,
        current_setting('test.quote_id')::uuid
    ) $$,
    '%AUTH_FORBIDDEN%',
    'Tenant B cannot cancel Tenant A quote'
);

-- ============================================================================
-- 10. Requote on Canceled Quote (3 assertions: 40-42)
-- ============================================================================
DO $$
DECLARE
    v_res JSONB;
BEGIN
    v_res := public.create_delivery_requote(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        current_setting('test.quote_id')::uuid,
        4500,
        780,
        now()
    );
    PERFORM set_config('test.new_quote_id', v_res->>'quote_id', true);
    PERFORM set_config('test.new_quote_status', v_res->>'status', true);
    PERFORM set_config('test.new_quote_req_id', v_res->>'delivery_request_id', true);
END $$;

SELECT is(
    current_setting('test.new_quote_status'),
    'QUOTED',
    'create_delivery_requote produces a new quote in QUOTED status'
);

SELECT is(
    current_setting('test.new_quote_req_id'),
    current_setting('test.request_id'),
    'Requote reuses the same original delivery_request_id'
);

SELECT isnt(
    current_setting('test.new_quote_id'),
    current_setting('test.quote_id'),
    'Requote creates a distinct new quote entity'
);

-- ============================================================================
-- 11. Lazy Expiration & Requote on Expired Quote (3 assertions: 43-45)
-- ============================================================================
UPDATE public.delivery_quotes
SET route_calculated_at = now() - interval '400 seconds',
    created_at = now() - interval '400 seconds',
    expires_at = now() - interval '100 seconds'
WHERE id = current_setting('test.new_quote_id')::uuid;

SELECT is(
    (SELECT (public.get_quote_for_actor('a0000000-0000-4000-8000-000000000001'::uuid, current_setting('test.new_quote_id')::uuid))->>'status'),
    'EXPIRED',
    'get_quote_for_actor lazily expires quote past its TTL'
);

SELECT throws_like(
    $$ SELECT public.cancel_delivery_quote(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        current_setting('test.new_quote_id')::uuid
    ) $$,
    '%QUOTE_INVALID_STATE%',
    'Cannot cancel an EXPIRED quote'
);

SELECT is(
    (SELECT (public.create_delivery_requote('a0000000-0000-4000-8000-000000000001'::uuid, current_setting('test.new_quote_id')::uuid, 4500, 780, now()))->>'status'),
    'QUOTED',
    'Requote on EXPIRED quote succeeds and creates new QUOTED quote'
);

-- ============================================================================
-- 12. Check Constraints & Invariants (3 assertions: 46-48)
-- ============================================================================
SELECT throws_like(
    $$ INSERT INTO public.delivery_quotes (
        delivery_request_id, pricing_version_id, status, currency, base_amount,
        distance_amount, time_amount, zone_amount, demand_amount, discount_amount,
        quoted_total, consumed_at, route_distance_meters, route_duration_seconds,
        route_provider, route_calculated_at, expires_at
    ) VALUES (
        current_setting('test.request_id')::uuid, 'dd000000-0000-4000-8000-000000000001'::uuid,
        'QUOTED', 'NIO', 35, 54, 19.5, 0, 0, 0, 108.5, now(), 4500, 780, 'GOOGLE_ROUTES', now(), now() + interval '300 seconds'
    ) $$,
    '%chk_quote_consumed_at%',
    'chk_quote_consumed_at rejects non-CONSUMED quote with non-null consumed_at'
);

SELECT throws_like(
    $$ INSERT INTO public.delivery_quotes (
        delivery_request_id, pricing_version_id, status, currency, base_amount,
        distance_amount, time_amount, zone_amount, demand_amount, discount_amount,
        quoted_total, consumed_at, route_distance_meters, route_duration_seconds,
        route_provider, route_calculated_at, expires_at
    ) VALUES (
        current_setting('test.request_id')::uuid, 'dd000000-0000-4000-8000-000000000001'::uuid,
        'CONSUMED', 'NIO', 35, 54, 19.5, 0, 0, 0, 108.5, NULL, 4500, 780, 'GOOGLE_ROUTES', now(), now() + interval '300 seconds'
    ) $$,
    '%chk_quote_consumed_at%',
    'chk_quote_consumed_at rejects CONSUMED quote with null consumed_at'
);

SELECT throws_like(
    $$ INSERT INTO public.delivery_quotes (
        delivery_request_id, pricing_version_id, status, currency, base_amount,
        distance_amount, time_amount, zone_amount, demand_amount, discount_amount,
        quoted_total, route_distance_meters, route_duration_seconds,
        route_provider, route_calculated_at, expires_at
    ) VALUES (
        current_setting('test.request_id')::uuid, 'dd000000-0000-4000-8000-000000000001'::uuid,
        'QUOTED', 'NIO', 35, 54, 19.5, 0, 0, 0, 108.5, 4500, 780, 'GOOGLE_ROUTES', now(), now() - interval '10 seconds'
    ) $$,
    '%chk_quote_expires_at%',
    'chk_quote_expires_at rejects expires_at earlier than route_calculated_at'
);

-- ============================================================================
-- 13. Scope Verification Helper RPCs (5 assertions: 49-53)
-- ============================================================================
-- 49. verify_quote_creation_scope succeeds for authorized owner
SELECT is(
    (SELECT (public.verify_quote_creation_scope('a0000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid))->>'business_id'),
    'b0000000-0000-4000-8000-000000000001',
    'verify_quote_creation_scope returns business_id for authorized owner'
);

-- 50. verify_quote_creation_scope throws INVALID_LOCATION_SCOPE for unassigned manager
SELECT throws_like(
    $$ SELECT public.verify_quote_creation_scope('a0000000-0000-4000-8000-000000000003'::uuid, 'cc000000-0000-4000-8000-000000000002'::uuid) $$,
    '%INVALID_LOCATION_SCOPE%',
    'verify_quote_creation_scope throws INVALID_LOCATION_SCOPE for unassigned manager'
);

-- 51. verify_quote_creation_scope throws AUTH_FORBIDDEN for non-member
SELECT throws_like(
    $$ SELECT public.verify_quote_creation_scope('a0000000-0000-4000-8000-000000000002'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid) $$,
    '%AUTH_FORBIDDEN%',
    'verify_quote_creation_scope throws AUTH_FORBIDDEN for non-member'
);

-- 52. verify_requote_scope succeeds for canceled quote
SELECT is(
    (SELECT (public.verify_requote_scope('a0000000-0000-4000-8000-000000000001'::uuid, current_setting('test.quote_id')::uuid))->>'delivery_request_id'),
    current_setting('test.request_id'),
    'verify_requote_scope returns delivery_request_id for canceled quote'
);

-- 53. verify_requote_scope throws AUTH_FORBIDDEN for Tenant B on Tenant A quote
SELECT throws_like(
    $$ SELECT public.verify_requote_scope('a0000000-0000-4000-8000-000000000002'::uuid, current_setting('test.quote_id')::uuid) $$,
    '%AUTH_FORBIDDEN%',
    'verify_requote_scope throws AUTH_FORBIDDEN for Tenant B actor'
);

-- ============================================================================
-- 14. Route Cache & Idempotency Helpers (5 assertions: 54-58)
-- ============================================================================
SET LOCAL ROLE postgres;

-- 54. Upsert cache record
SELECT lives_ok(
    $$ SELECT private.upsert_route_cache(
        'route:google:12.13639,-86.25139->12.12500,-86.26500',
        'GOOGLE_ROUTES',
        12.136389,
        -86.251389,
        12.125000,
        -86.265000,
        4500,
        780,
        3600
    ) $$,
    'Upsert route cache record executes without error'
);

-- 55. Get route cache returns cached metrics
SELECT is(
    (SELECT (private.get_route_cache('route:google:12.13639,-86.25139->12.12500,-86.26500'))->>'distance_meters'),
    '4500',
    'get_route_cache retrieves cached distance_meters'
);

-- 56. Get nonexistent cache returns NULL
SELECT is(
    (SELECT private.get_route_cache('route:google:nonexistent_key')),
    NULL,
    'get_route_cache returns NULL for cache miss'
);

-- 57. Fast Idempotency Reader retrieves response
INSERT INTO private.idempotency_responses (
    actor_user_id, scope, key, request_fingerprint, response_status, response_body, expires_at
) VALUES (
    'a0000000-0000-4000-8000-000000000001'::uuid,
    'create_delivery_quote',
    '00000000-0000-4000-8000-000000000001',
    'fp_test_123',
    200,
    '{"quote_id":"test-quote-123"}'::jsonb,
    now() + interval '1 hour'
);

SELECT is(
    (SELECT (public.get_idempotent_response('a0000000-0000-4000-8000-000000000001'::uuid, 'create_delivery_quote', '00000000-0000-4000-8000-000000000001'))->>'request_fingerprint'),
    'fp_test_123',
    'get_idempotent_response returns cached response fingerprint'
);

-- 58. Fast Idempotency Reader returns NULL for missing key
SELECT is(
    (SELECT public.get_idempotent_response('a0000000-0000-4000-8000-000000000001'::uuid, 'create_delivery_quote', '00000000-0000-4000-8000-999999999999')),
    NULL,
    'get_idempotent_response returns NULL for nonexistent key'
);

-- ============================================================================
-- 15. Idempotency Lease Locking & Concurrency Subsystem (7 assertions: 59-65)
-- ============================================================================

-- 59. acquire_idempotency_lease returns action: EXECUTE on brand new key
SELECT is(
    (SELECT (public.acquire_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'create_delivery_quote',
        '00000000-0000-4000-8000-000000000099',
        'fp_initial_99',
        30
    ))->>'action'),
    'EXECUTE',
    'acquire_idempotency_lease grants EXECUTE lease on new key'
);

-- 60. acquire_idempotency_lease returns action: IN_FLIGHT for concurrent active lease
SELECT is(
    (SELECT (public.acquire_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'create_delivery_quote',
        '00000000-0000-4000-8000-000000000099',
        'fp_initial_99',
        30
    ))->>'action'),
    'IN_FLIGHT',
    'acquire_idempotency_lease reports IN_FLIGHT for concurrent active lease'
);

-- 61. acquire_idempotency_lease throws IDEMPOTENCY_FINGERPRINT_MISMATCH on different fingerprint
SELECT throws_like(
    $$ SELECT public.acquire_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'create_delivery_quote',
        '00000000-0000-4000-8000-000000000099',
        'fp_different_fingerprint_mismatch',
        30
    ) $$,
    '%IDEMPOTENCY_FINGERPRINT_MISMATCH%',
    'acquire_idempotency_lease raises fingerprint mismatch error'
);

-- 62. execute_idempotent_operation executes and returns status 201 for create_delivery_quote
SELECT is(
    (SELECT (public.execute_idempotent_operation(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'create_delivery_quote',
        '00000000-0000-4000-8000-000000000099',
        'fp_initial_99',
        'create_delivery_quote',
        jsonb_build_object(
            'location_id', 'cc000000-0000-4000-8000-000000000001'::uuid,
            'dropoff_address_text', 'Lease Test Address',
            'dropoff_lat', 12.125,
            'dropoff_lng', -86.265,
            'recipient_name', 'Lease Recipient',
            'recipient_phone', '+50588889999',
            'package_type', 'PARCEL',
            'cash_to_collect', 0,
            'distance_meters', 4500,
            'duration_seconds', 780,
            'route_calculated_at', now()
        )
    ))->>'status'),
    '201',
    'execute_idempotent_operation returns status 201 for create_delivery_quote'
);

-- 63. acquire_idempotency_lease returns action: REPLAY with status 201 after completion
SELECT is(
    (SELECT (public.acquire_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'create_delivery_quote',
        '00000000-0000-4000-8000-000000000099',
        'fp_initial_99',
        30
    ))->>'action'),
    'REPLAY',
    'acquire_idempotency_lease returns REPLAY for completed reservation'
);

SELECT is(
    (SELECT (public.acquire_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'create_delivery_quote',
        '00000000-0000-4000-8000-000000000099',
        'fp_initial_99',
        30
    ))->>'response_status'),
    '201',
    'acquire_idempotency_lease preserves response_status 201 on replay'
);

-- 65. Verify private.idempotency_reservations record status is COMPLETED
SELECT is(
    (SELECT status FROM private.idempotency_reservations WHERE key = '00000000-0000-4000-8000-000000000099'),
    'COMPLETED',
    'idempotency_reservations row status is COMPLETED'
);

SELECT * FROM finish();
ROLLBACK;
