BEGIN;

SELECT plan(80);

-- ============================================================================
-- 1. Structural Checks: Tables, Columns & Indexes (H01, H02, H08)
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

-- Function Signatures
SELECT has_function('public', 'create_delivery_quote', ARRAY['uuid', 'uuid', 'text', 'double precision', 'double precision', 'text', 'text', 'text', 'numeric', 'bigint', 'bigint', 'timestamp with time zone'], 'create_delivery_quote exists with correct signature');
SELECT has_function('public', 'get_quote_for_actor', ARRAY['uuid', 'uuid'], 'get_quote_for_actor exists with correct signature');
SELECT has_function('public', 'cancel_delivery_quote', ARRAY['uuid', 'uuid'], 'cancel_delivery_quote exists with correct signature');
SELECT has_function('public', 'create_delivery_requote', ARRAY['uuid', 'uuid', 'bigint', 'bigint', 'timestamp with time zone'], 'create_delivery_requote exists with correct signature');
SELECT has_function('public', 'get_idempotent_response', ARRAY['uuid', 'text', 'text'], 'public.get_idempotent_response exists with correct signature');
SELECT has_function('public', 'acquire_idempotency_lease', ARRAY['uuid', 'text', 'text', 'text', 'integer'], 'public.acquire_idempotency_lease exists with correct signature');
SELECT has_function('public', 'complete_idempotent_external_operation', ARRAY['uuid', 'text', 'text', 'text', 'uuid', 'bigint', 'integer', 'jsonb'], 'public.complete_idempotent_external_operation exists with correct signature');
SELECT has_function('public', 'abort_idempotency_lease', ARRAY['uuid', 'text', 'text', 'uuid', 'bigint'], 'public.abort_idempotency_lease exists with correct signature');
SELECT has_function('public', 'verify_quote_creation_scope', ARRAY['uuid', 'uuid'], 'public.verify_quote_creation_scope exists with correct signature');
SELECT has_function('public', 'verify_requote_scope', ARRAY['uuid', 'uuid'], 'public.verify_requote_scope exists with correct signature');
SELECT has_function('public', 'verify_quote_access_scope', ARRAY['uuid', 'uuid'], 'public.verify_quote_access_scope exists with correct signature');
SELECT has_function('public', 'get_active_pricing_rule', ARRAY['text'], 'public.get_active_pricing_rule exists with correct signature');
SELECT has_function('private', 'get_route_cache', ARRAY['text'], 'private.get_route_cache exists');
SELECT has_function('private', 'upsert_route_cache', ARRAY['text', 'text', 'double precision', 'double precision', 'double precision', 'double precision', 'bigint', 'bigint', 'integer'], 'private.upsert_route_cache exists');

-- ============================================================================
-- 2. Synthetic Seed Data Setup (service_role)
-- ============================================================================
SET LOCAL ROLE postgres;

-- Users
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES 
    ('a0000000-0000-4000-8000-000000000001', 'owner_a@test.com', '{"full_name":"Owner A"}'::jsonb),
    ('a0000000-0000-4000-8000-000000000002', 'owner_b@test.com', '{"full_name":"Owner B"}'::jsonb),
    ('a0000000-0000-4000-8000-000000000003', 'manager_a@test.com', '{"full_name":"Manager A"}'::jsonb),
    ('a0000000-0000-4000-8000-000000000004', 'suspended_user@test.com', '{"full_name":"Suspended User"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Businesses & Locations
INSERT INTO public.businesses (id, legal_name, brand_name, tax_id, account_status)
VALUES 
    ('b0000000-0000-4000-8000-000000000001', 'Empresa Alfa S.A.', 'Alfa Store', 'J0310444400001', 'ACTIVE'),
    ('b0000000-0000-4000-8000-000000000002', 'Empresa Beta S.A.', 'Beta Store', 'J0310444400002', 'ACTIVE'),
    ('b0000000-0000-4000-8000-000000000003', 'Empresa Inactiva S.A.', 'Inactive Store', 'J0310444400003', 'SUSPENDED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_members (id, business_id, user_id, role, status)
VALUES
    ('bb000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'business_owner', 'ACTIVE'),
    ('bb000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'business_owner', 'ACTIVE'),
    ('bb000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'business_manager', 'ACTIVE'),
    ('bb000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'business_member', 'SUSPENDED'),
    ('bb000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', 'business_owner', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_locations (id, business_id, name, address_text, location, is_active)
VALUES
    ('cc000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'Sucursal Central Alfa', 'Plaza España Managua', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.251389, 12.136389), 4326), true),
    ('cc000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'Sucursal Carretera Masaya', 'Km 8 Carretera a Masaya', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.220000, 12.100000), 4326), true),
    ('cc000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002', 'Sucursal Beta Centro', 'Metrocentro Managua', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.261389, 12.126389), 4326), true),
    ('cc000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', 'Sucursal Inactiva', 'Carretera Norte', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.230000, 12.140000), 4326), true)
ON CONFLICT (id) DO NOTHING;

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
-- 3. H01 - H08 Database Constraints & Invariants
-- ============================================================================
-- H01: Segunda pricing_version ACTIVE viola single-active
SELECT throws_like(
    $$ INSERT INTO public.pricing_versions (name, currency, is_active, quote_ttl_seconds) VALUES ('Segunda Activa', 'NIO', true, 300) $$,
    '%idx_pricing_versions_single_active%',
    'H01: Inserting second active pricing version violates single-active unique index'
);

-- H02: Segunda pricing_rule misma version viola unique
SELECT throws_like(
    $$ INSERT INTO public.pricing_rules (pricing_version_id, base_fee, per_km_rate, per_minute_rate, min_fare) VALUES ('dd000000-0000-4000-8000-000000000001'::uuid, 40, 15, 2, 50) $$,
    '%pricing_rules_pricing_version_id_key%',
    'H02: Inserting second pricing rule for same pricing version violates unique constraint'
);

-- H03: quote_ttl_seconds > 0
SELECT throws_like(
    $$ INSERT INTO public.pricing_versions (name, currency, is_active, quote_ttl_seconds) VALUES ('Zero TTL', 'NIO', false, 0) $$,
    '%chk_pricing_versions_ttl%',
    'H03: quote_ttl_seconds <= 0 violates check constraint'
);

-- H04: quote_ttl_seconds <= 3600
SELECT throws_like(
    $$ INSERT INTO public.pricing_versions (name, currency, is_active, quote_ttl_seconds) VALUES ('Excess TTL', 'NIO', false, 3601) $$,
    '%chk_pricing_versions_ttl%',
    'H04: quote_ttl_seconds > 3600 violates check constraint'
);

-- H05: currency = 'NIO'
SELECT throws_like(
    $$ INSERT INTO public.pricing_versions (name, currency, is_active, quote_ttl_seconds) VALUES ('USD Version', 'USD', false, 300) $$,
    '%chk_pricing_versions_currency%',
    'H05: Invalid currency violates check constraint'
);

-- H06: route_distance_meters > 0
SELECT throws_like(
    $$ INSERT INTO public.delivery_quotes (
        delivery_request_id, pricing_version_id, status, currency, base_amount, distance_amount, time_amount,
        zone_amount, demand_amount, discount_amount, quoted_total, route_distance_meters, route_duration_seconds, route_calculated_at, expires_at
    ) VALUES (
        gen_random_uuid(), 'dd000000-0000-4000-8000-000000000001'::uuid, 'QUOTED', 'NIO', 35, 0, 0, 0, 0, 0, 45, 0, 100, now(), now() + interval '300s'
    ) $$,
    '%chk_quote_distance%',
    'H06: route_distance_meters <= 0 violates check constraint'
);

-- H07: route_duration_seconds >= 0
SELECT throws_like(
    $$ INSERT INTO public.delivery_quotes (
        delivery_request_id, pricing_version_id, status, currency, base_amount, distance_amount, time_amount,
        zone_amount, demand_amount, discount_amount, quoted_total, route_distance_meters, route_duration_seconds, route_calculated_at, expires_at
    ) VALUES (
        gen_random_uuid(), 'dd000000-0000-4000-8000-000000000001'::uuid, 'QUOTED', 'NIO', 35, 10, 0, 0, 0, 0, 45, 1000, -5, now(), now() + interval '300s'
    ) $$,
    '%chk_quote_duration%',
    'H07: route_duration_seconds < 0 violates check constraint'
);

-- H08: max 1 CONSUMED por delivery_request
SELECT is(
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'delivery_quotes' AND indexname = 'uq_delivery_quotes_single_consumed'),
    1::bigint,
    'H08: Unique index uq_delivery_quotes_single_consumed exists'
);

-- ============================================================================
-- 4. H09 - H12 RLS Security Mutation Denial
-- ============================================================================
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = 'a0000000-0000-4000-8000-000000000001';

-- H09: Authenticated direct INSERT delivery_requests denied
SELECT throws_like(
    $$ INSERT INTO public.delivery_requests (business_id, location_id, pickup_address_snapshot, dropoff_address_snapshot, recipient_name, recipient_phone, dropoff_location, package_type, created_by)
       VALUES ('b0000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid, '{}'::jsonb, '{}'::jsonb, 'Test', '+50588881111', extensions.st_setsrid(extensions.st_makepoint(-86.2, 12.1), 4326)::extensions.geography, 'PARCEL', 'a0000000-0000-4000-8000-000000000001'::uuid) $$,
    '%permission denied%',
    'H09: Direct INSERT on delivery_requests denied to authenticated'
);

-- H10: Authenticated direct INSERT delivery_quotes denied
SELECT throws_like(
    $$ INSERT INTO public.delivery_quotes (delivery_request_id, pricing_version_id, status, currency, base_amount, distance_amount, time_amount, zone_amount, demand_amount, discount_amount, quoted_total, route_distance_meters, route_duration_seconds, route_calculated_at, expires_at)
       VALUES (gen_random_uuid(), 'dd000000-0000-4000-8000-000000000001'::uuid, 'QUOTED', 'NIO', 35, 10, 5, 0, 0, 0, 50, 1000, 120, now(), now() + interval '300s') $$,
    '%permission denied%',
    'H10: Direct INSERT on delivery_quotes denied to authenticated'
);

-- H11: Authenticated direct UPDATE delivery_quotes denied
SELECT throws_like(
    $$ UPDATE public.delivery_quotes SET status = 'CANCELED' WHERE true $$,
    '%permission denied%',
    'H11: Direct UPDATE on delivery_quotes denied to authenticated'
);

SET LOCAL ROLE anon;

-- H12: Anon direct mutation denied
SELECT throws_like(
    $$ INSERT INTO public.delivery_quotes (delivery_request_id, pricing_version_id, status, currency, base_amount, distance_amount, time_amount, zone_amount, demand_amount, discount_amount, quoted_total, route_distance_meters, route_duration_seconds, route_calculated_at, expires_at)
       VALUES (gen_random_uuid(), 'dd000000-0000-4000-8000-000000000001'::uuid, 'QUOTED', 'NIO', 35, 10, 5, 0, 0, 0, 50, 1000, 120, now(), now() + interval '300s') $$,
    '%permission denied%',
    'H12: Direct mutation denied to anon'
);

-- ============================================================================
-- 5. H13 - H15 Scope Verification Tests
-- ============================================================================
SET LOCAL ROLE service_role;

-- H13: Suspended member denied
SELECT throws_like(
    $$ SELECT public.verify_quote_creation_scope('a0000000-0000-4000-8000-000000000004'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid) $$,
    '%AUTH_FORBIDDEN%',
    'H13: Suspended member is denied quote creation scope'
);

-- H14: Suspended business denied
SELECT throws_like(
    $$ SELECT public.verify_quote_creation_scope('a0000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000004'::uuid) $$,
    '%BUSINESS_INACTIVE%',
    'H14: Inactive or suspended business is denied quote creation scope'
);

-- H15: Active owner allowed
SELECT is(
    (SELECT (public.verify_quote_creation_scope('a0000000-0000-4000-8000-000000000001'::uuid, 'cc000000-0000-4000-8000-000000000001'::uuid))->>'business_id'),
    'b0000000-0000-4000-8000-000000000001',
    'H15: Active owner is granted quote creation scope'
);

-- ============================================================================
-- 6. H16 - H21 Quote Immutability & Financial Breakdown Invariants
-- ============================================================================
DO $$
DECLARE
    v_lease JSONB;
    v_quote JSONB;
BEGIN
    v_lease := public.acquire_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'create_delivery_quote',
        '00000000-4000-4000-8000-000000000001',
        'fp_h16_test',
        30
    );

    v_quote := public.create_delivery_quote_atomic(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'cc000000-0000-4000-8000-000000000001'::uuid,
        'Los Robles',
        12.125,
        -86.265,
        'Cliente H16',
        '+50588880001',
        'PARCEL',
        0,
        4500,
        780,
        now(),
        '00000000-4000-4000-8000-000000000001',
        'fp_h16_test',
        (v_lease->>'reservation_token')::uuid,
        (v_lease->>'lease_generation')::bigint
    );
    PERFORM set_config('test.h16_quote_id', v_quote->>'quote_id', true);
END $$;

-- Update pricing rules in DB to simulate pricing change
UPDATE public.pricing_rules
SET base_fee = 100.00, per_km_rate = 50.00
WHERE pricing_version_id = 'dd000000-0000-4000-8000-000000000001'::uuid;

-- H16: Historical quote values do NOT change when pricing changes
SELECT is(
    (SELECT base_amount FROM public.delivery_quotes WHERE id = current_setting('test.h16_quote_id')::uuid),
    35.00::numeric,
    'H16: Historical quote base_amount remains 35.00 after pricing rule update'
);

-- H17: zone_amount = 0
SELECT is(
    (SELECT zone_amount FROM public.delivery_quotes WHERE id = current_setting('test.h16_quote_id')::uuid),
    0.00::numeric,
    'H17: zone_amount is 0'
);

-- H18: demand_amount = 0
SELECT is(
    (SELECT demand_amount FROM public.delivery_quotes WHERE id = current_setting('test.h16_quote_id')::uuid),
    0.00::numeric,
    'H18: demand_amount is 0'
);

-- H19: discount_amount = 0
SELECT is(
    (SELECT discount_amount FROM public.delivery_quotes WHERE id = current_setting('test.h16_quote_id')::uuid),
    0.00::numeric,
    'H19: discount_amount is 0'
);

-- H20: driver_earning_estimate IS NULL
SELECT is(
    (SELECT driver_earning_estimate FROM public.delivery_quotes WHERE id = current_setting('test.h16_quote_id')::uuid),
    NULL,
    'H20: driver_earning_estimate is NULL'
);

-- H21: platform_revenue_estimate IS NULL
SELECT is(
    (SELECT platform_revenue_estimate FROM public.delivery_quotes WHERE id = current_setting('test.h16_quote_id')::uuid),
    NULL,
    'H21: platform_revenue_estimate is NULL'
);

-- Restore original pricing rules
UPDATE public.pricing_rules
SET base_fee = 35.00, per_km_rate = 12.00
WHERE pricing_version_id = 'dd000000-0000-4000-8000-000000000001'::uuid;

-- ============================================================================
-- 7. H22 - H25 Function Execution Permissions
-- ============================================================================
SET LOCAL ROLE authenticated;
-- H22-H24: Authenticated direct RPC call denied
SELECT throws_like(
    $$ SELECT public.acquire_idempotency_lease('a0000000-0000-4000-8000-000000000001'::uuid, 'test', '00000000-4000-4000-8000-000000000002', 'fp', 30) $$,
    '%permission denied%',
    'H24: Authenticated cannot execute acquire_idempotency_lease'
);

SELECT throws_like(
    $$ SELECT public.complete_idempotent_external_operation('a0000000-0000-4000-8000-000000000001'::uuid, 'test', '00000000-4000-4000-8000-000000000002', 'fp', gen_random_uuid(), 1, 200, '{}'::jsonb) $$,
    '%permission denied%',
    'H24: Authenticated cannot execute complete_idempotent_external_operation'
);

SELECT throws_like(
    $$ SELECT public.abort_idempotency_lease('a0000000-0000-4000-8000-000000000001'::uuid, 'test', '00000000-4000-4000-8000-000000000002', gen_random_uuid(), 1) $$,
    '%permission denied%',
    'H24: Authenticated cannot execute abort_idempotency_lease'
);

SET LOCAL ROLE anon;
SELECT throws_like(
    $$ SELECT public.acquire_idempotency_lease('a0000000-0000-4000-8000-000000000001'::uuid, 'test', '00000000-4000-4000-8000-000000000002', 'fp', 30) $$,
    '%permission denied%',
    'H23: Anon cannot execute acquire_idempotency_lease'
);

-- H25: Service role can execute lease flow
SET LOCAL ROLE service_role;
SELECT is(
    (SELECT (public.acquire_idempotency_lease('a0000000-0000-4000-8000-000000000001'::uuid, 'test_scope_h25', '00000000-4000-4000-8000-000000000002', 'fp_h25', 30))->>'action'),
    'EXECUTE',
    'H25: service_role can successfully acquire lease'
);

-- ============================================================================
-- 8. H26 - H30 Fencing Tokens, Lease Generation & Abort Lifecycle
-- ============================================================================
-- H26: Actor NULL sin duplicados ambiguos en idempotency_reservations
SELECT is(
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'private' AND tablename = 'idempotency_reservations' AND indexname = 'uq_idempotency_reservations_actor_coalesce_key'),
    1::bigint,
    'H26: Unique index uq_idempotency_reservations_actor_coalesce_key exists'
);

-- Setup a test lease for H27-H30
DO $$
DECLARE
    v_l JSONB;
BEGIN
    v_l := public.acquire_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'fencing_test_scope',
        '00000000-4000-4000-8000-000000000003',
        'fp_fencing_test',
        30
    );
    PERFORM set_config('test.valid_token', v_l->>'reservation_token', true);
    PERFORM set_config('test.valid_gen', v_l->>'lease_generation', true);
END $$;

-- H27: Stale fencing token cannot complete
SELECT throws_like(
    $$ SELECT public.complete_idempotent_external_operation(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'fencing_test_scope',
        '00000000-4000-4000-8000-000000000003',
        'fp_fencing_test',
        'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
        current_setting('test.valid_gen')::bigint,
        200,
        '{"done":true}'::jsonb
    ) $$,
    '%IDEMPOTENCY_LEASE_LOST%',
    'H27: Stale reservation_token throws IDEMPOTENCY_LEASE_LOST on completion attempt'
);

-- H29: Abort wrong token denied
SELECT throws_like(
    $$ SELECT public.abort_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'fencing_test_scope',
        '00000000-4000-4000-8000-000000000003',
        'ffffffff-ffff-4fff-8fff-ffffffffffff'::uuid,
        current_setting('test.valid_gen')::bigint
    ) $$,
    '%IDEMPOTENCY_LEASE_LOST%',
    'H29: Abort attempt with invalid token throws IDEMPOTENCY_LEASE_LOST'
);

-- H28: Current fencing token can complete
SELECT is(
    (SELECT (public.complete_idempotent_external_operation(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'fencing_test_scope',
        '00000000-4000-4000-8000-000000000003',
        'fp_fencing_test',
        current_setting('test.valid_token')::uuid,
        current_setting('test.valid_gen')::bigint,
        201,
        '{"status":"completed"}'::jsonb
    ))->>'status'),
    '201',
    'H28: Current fencing token successfully completes idempotent operation'
);

-- Setup another lease to test H30 abort
DO $$
DECLARE
    v_l JSONB;
BEGIN
    v_l := public.acquire_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'abort_test_scope',
        '00000000-4000-4000-8000-000000000004',
        'fp_abort_test',
        30
    );
    PERFORM set_config('test.abort_token', v_l->>'reservation_token', true);
    PERFORM set_config('test.abort_gen', v_l->>'lease_generation', true);
END $$;

-- H30: Abort current token succeeds
SELECT is(
    (SELECT (public.abort_idempotency_lease(
        'a0000000-0000-4000-8000-000000000001'::uuid,
        'abort_test_scope',
        '00000000-4000-4000-8000-000000000004',
        current_setting('test.abort_token')::uuid,
        current_setting('test.abort_gen')::bigint
    ))->>'aborted'),
    'true',
    'H30: Aborting lease with valid token and generation succeeds'
);

SELECT * FROM finish();
ROLLBACK;
