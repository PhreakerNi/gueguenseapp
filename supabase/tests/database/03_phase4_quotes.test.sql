BEGIN;

SELECT plan(45);

-- ============================================================================
-- 1. Structural Checks: Tables, Columns & Indexes (10 assertions: 1-10)
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

SELECT is(
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'pricing_versions' AND indexname = 'idx_pricing_versions_single_active'),
    1::bigint,
    'Unique index idx_pricing_versions_single_active exists'
);

-- ============================================================================
-- 2. Function Signatures & Security Checks (6 assertions: 11-16)
-- ============================================================================
SELECT has_function('public', 'create_delivery_quote', ARRAY['uuid', 'uuid', 'text', 'double precision', 'double precision', 'text', 'text', 'text', 'numeric', 'bigint', 'bigint', 'timestamp with time zone'], 'create_delivery_quote exists with correct signature');
SELECT has_function('public', 'get_quote_for_actor', ARRAY['uuid', 'uuid'], 'get_quote_for_actor exists with correct signature');
SELECT has_function('public', 'cancel_delivery_quote', ARRAY['uuid', 'uuid'], 'cancel_delivery_quote exists with correct signature');
SELECT has_function('public', 'create_delivery_requote', ARRAY['uuid', 'uuid', 'bigint', 'bigint', 'timestamp with time zone'], 'create_delivery_requote exists with correct signature');
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
-- 4. Direct Client Execution Revoked (4 assertions: 17-20)
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
-- 5. Business Location & Scope Enforcement (3 assertions: 21-23)
-- ============================================================================
SET LOCAL ROLE service_role;

-- 21. Manager A attempting quote for Location 2 (unassigned) -> Throws INVALID_LOCATION_SCOPE
SELECT throws_like(
    $$ SELECT public.create_delivery_quote(
        'a0000000-0000-4000-8000-000000000003'::uuid,
        'cc000000-0000-4000-8000-000000000002'::uuid,
        'Altamira', 12.12, -86.24, 'Pedro', '+50588889999', 'DOCUMENT', 0, 3000, 600, now()
    ) $$,
    '%INVALID_LOCATION_SCOPE%',
    'Manager cannot create quote for location outside their assigned scope'
);

-- 22. Non-member user attempting quote for Location 1 -> Throws AUTH_FORBIDDEN
SELECT throws_like(
    $$ SELECT public.create_delivery_quote(
        'a0000000-0000-4000-8000-000000000002'::uuid,
        'cc000000-0000-4000-8000-000000000001'::uuid,
        'Altamira', 12.12, -86.24, 'Pedro', '+50588889999', 'DOCUMENT', 0, 3000, 600, now()
    ) $$,
    '%AUTH_FORBIDDEN%',
    'Non-member user cannot create quote for another business location'
);

-- 23. Invalid dropoff coordinates -> Throws VALIDATION_ERROR
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
-- 6. Successful Quote Creation & Exact Math (5 assertions: 24-28)
-- ============================================================================
-- 4.5 km, 13 min (780s):
-- base: 35.00, dist: 4.5 * 12 = 54.00, time: 13 * 1.5 = 19.50 -> total: 108.50 NIO
-- min_fare: 45.00
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
-- 7. Minimum Fare Application (1 assertion: 29)
-- ============================================================================
-- 500m (0.5km), 2 min (120s):
-- base: 35.00, dist: 0.5 * 12 = 6.00, time: 2 * 1.5 = 3.00 -> subtotal: 44.00 < min_fare (45.00) -> total: 45.00 NIO
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
-- 8. Get Quote & Tenant RLS Read Isolation (3 assertions: 30-32)
-- ============================================================================
-- 30. Get quote by owner -> returns full details
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

-- 31. Attempt get quote by Owner B (Tenant B) -> Throws AUTH_FORBIDDEN
SELECT throws_like(
    $$ SELECT public.get_quote_for_actor(
        'a0000000-0000-4000-8000-000000000002'::uuid,
        current_setting('test.quote_id')::uuid
    ) $$,
    '%AUTH_FORBIDDEN%',
    'Tenant B cannot access quotes belonging to Tenant A'
);

-- 32. Direct RLS select: Owner B sees 0 quotes belonging to Tenant A
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'a0000000-0000-4000-8000-000000000002';

SELECT is(
    (SELECT count(*) FROM public.delivery_quotes WHERE id = current_setting('test.quote_id')::uuid),
    0::bigint,
    'RLS SELECT hides Tenant A quote from Tenant B user'
);

-- ============================================================================
-- 9. Quote Cancellation & Idempotency (4 assertions: 33-36)
-- ============================================================================
SET LOCAL ROLE service_role;

-- 33. Cancel active quote
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

-- 34. Idempotent cancel replay returns CANCELED
SELECT is(
    (SELECT (public.cancel_delivery_quote('a0000000-0000-4000-8000-000000000001'::uuid, current_setting('test.quote_id')::uuid))->>'status'),
    'CANCELED',
    'Repeated cancel on CANCELED quote is idempotent'
);

-- 35. Database status check
SELECT is(
    (SELECT status FROM public.delivery_quotes WHERE id = current_setting('test.quote_id')::uuid),
    'CANCELED',
    'Database record status is CANCELED'
);

-- 36. Tenant B cannot cancel Tenant A quote
SELECT throws_like(
    $$ SELECT public.cancel_delivery_quote(
        'a0000000-0000-4000-8000-000000000002'::uuid,
        current_setting('test.quote_id')::uuid
    ) $$,
    '%AUTH_FORBIDDEN%',
    'Tenant B cannot cancel Tenant A quote'
);

-- ============================================================================
-- 10. Requote on Canceled Quote (3 assertions: 37-39)
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
-- 11. Lazy Expiration & Requote on Expired Quote (3 assertions: 40-42)
-- ============================================================================
-- Backdate expires_at on new quote
UPDATE public.delivery_quotes
SET route_calculated_at = now() - interval '400 seconds',
    created_at = now() - interval '400 seconds',
    expires_at = now() - interval '100 seconds'
WHERE id = current_setting('test.new_quote_id')::uuid;

-- 40. get_quote_for_actor lazily marks quote as EXPIRED
SELECT is(
    (SELECT (public.get_quote_for_actor('a0000000-0000-4000-8000-000000000001'::uuid, current_setting('test.new_quote_id')::uuid))->>'status'),
    'EXPIRED',
    'get_quote_for_actor lazily expires quote past its TTL'
);

-- 41. Attempt to cancel EXPIRED quote -> Throws QUOTE_INVALID_STATE
SELECT throws_like(
    $$ SELECT public.cancel_delivery_quote(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        current_setting('test.new_quote_id')::uuid
    ) $$,
    '%QUOTE_INVALID_STATE%',
    'Cannot cancel an EXPIRED quote'
);

-- 42. Requote on EXPIRED quote succeeds
SELECT is(
    (SELECT (public.create_delivery_requote('a0000000-0000-4000-8000-000000000001'::uuid, current_setting('test.new_quote_id')::uuid, 4500, 780, now()))->>'status'),
    'QUOTED',
    'Requote on EXPIRED quote succeeds and creates new QUOTED quote'
);

-- ============================================================================
-- 12. Route Cache Helpers (3 assertions: 43-45)
-- ============================================================================
-- 43. Upsert cache record
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

-- 44. Get route cache returns cached metrics
SELECT is(
    (SELECT (private.get_route_cache('route:google:12.13639,-86.25139->12.12500,-86.26500'))->>'distance_meters'),
    '4500',
    'get_route_cache retrieves cached distance_meters'
);

-- 45. Get nonexistent cache returns NULL
SELECT is(
    (SELECT private.get_route_cache('route:google:nonexistent_key')),
    NULL,
    'get_route_cache returns NULL for cache miss'
);

SELECT * FROM finish();
ROLLBACK;
