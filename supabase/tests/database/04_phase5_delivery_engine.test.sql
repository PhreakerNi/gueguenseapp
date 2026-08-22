-- ============================================================================
-- GÜEGÜENSE — pgTAP Test Suite: Phase 5 Delivery Engine (Database & RLS)
-- File: supabase/tests/database/04_phase5_delivery_engine.test.sql
-- ============================================================================

BEGIN;

SELECT plan(80);

-- ----------------------------------------------------------------------------
-- 1. Schema & Table Structure Tests
-- ----------------------------------------------------------------------------
SELECT has_table('public', 'deliveries', 'Table public.deliveries must exist');
SELECT has_table('public', 'delivery_events', 'Table public.delivery_events must exist');

-- Columns in public.deliveries
SELECT columns_are(
    'public',
    'deliveries',
    ARRAY[
        'id',
        'request_id',
        'quote_id',
        'driver_id',
        'status',
        'currency',
        'quoted_price',
        'final_price',
        'driver_earning',
        'platform_revenue',
        'created_at',
        'updated_at',
        'delivered_at'
    ],
    'public.deliveries has all canonical columns'
);

-- Columns in public.delivery_events
SELECT columns_are(
    'public',
    'delivery_events',
    ARRAY[
        'id',
        'delivery_id',
        'actor_user_id',
        'actor_type',
        'event_type',
        'metadata',
        'created_at'
    ],
    'public.delivery_events has all canonical columns'
);

-- Primary Keys
SELECT col_is_pk('public', 'deliveries', 'id', 'deliveries.id is PRIMARY KEY');
SELECT col_is_pk('public', 'delivery_events', 'id', 'delivery_events.id is PRIMARY KEY');

-- Foreign Keys
SELECT col_is_fk('public', 'deliveries', 'request_id', 'deliveries.request_id is FOREIGN KEY');
SELECT col_is_fk('public', 'deliveries', 'quote_id', 'deliveries.quote_id is FOREIGN KEY');
SELECT col_is_fk('public', 'deliveries', 'driver_id', 'deliveries.driver_id is FOREIGN KEY');
SELECT col_is_fk('public', 'delivery_events', 'delivery_id', 'delivery_events.delivery_id is FOREIGN KEY');
SELECT col_is_fk('public', 'delivery_events', 'actor_user_id', 'delivery_events.actor_user_id is FOREIGN KEY');

-- Unique Constraints
SELECT col_is_unique('public', 'deliveries', 'quote_id', 'deliveries.quote_id is UNIQUE');

-- Indexes
SELECT has_index('public', 'deliveries', 'idx_deliveries_request_id', ARRAY['request_id'], 'idx_deliveries_request_id exists');
SELECT has_index('public', 'deliveries', 'idx_deliveries_quote_id', ARRAY['quote_id'], 'idx_deliveries_quote_id exists');
SELECT has_index('public', 'deliveries', 'idx_deliveries_driver_id', ARRAY['driver_id'], 'idx_deliveries_driver_id exists');
SELECT has_index('public', 'deliveries', 'idx_deliveries_status', ARRAY['status'], 'idx_deliveries_status exists');
SELECT has_index('public', 'deliveries', 'idx_deliveries_active_driver', 'idx_deliveries_active_driver partial unique index exists');

SELECT has_index('public', 'delivery_events', 'idx_delivery_events_delivery_id', ARRAY['delivery_id'], 'idx_delivery_events_delivery_id exists');
SELECT has_index('public', 'delivery_events', 'idx_delivery_events_event_type', ARRAY['event_type'], 'idx_delivery_events_event_type exists');

-- ----------------------------------------------------------------------------
-- 2. Check Constraints & Enums
-- ----------------------------------------------------------------------------
SELECT col_has_check('public', 'deliveries', 'status', 'deliveries.status has check constraint');
SELECT col_has_check('public', 'deliveries', 'quoted_price', 'deliveries.quoted_price has check constraint');
SELECT col_has_check('public', 'delivery_events', 'actor_type', 'delivery_events.actor_type has check constraint');

-- ----------------------------------------------------------------------------
-- 3. Row Level Security (RLS) Configuration
-- ----------------------------------------------------------------------------
SELECT is(
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'deliveries'),
    true,
    'public.deliveries has RLS enabled'
);
SELECT is(
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'delivery_events'),
    true,
    'public.delivery_events has RLS enabled'
);

-- ----------------------------------------------------------------------------
-- 4. Function Security & Isolation Tests (SECURITY DEFINER & search_path='')
-- ----------------------------------------------------------------------------
SELECT is_definer('public', 'prevent_delivery_events_mutation', 'prevent_delivery_events_mutation is SECURITY DEFINER');
SELECT is_definer('public', 'create_delivery_from_quote_atomic', ARRAY['UUID', 'UUID', 'TEXT', 'TEXT', 'TEXT', 'INTEGER'], 'create_delivery_from_quote_atomic is SECURITY DEFINER');
SELECT is_definer('public', 'cancel_delivery_atomic', ARRAY['UUID', 'UUID', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'INTEGER'], 'cancel_delivery_atomic is SECURITY DEFINER');
SELECT is_definer('public', 'get_delivery_detail', ARRAY['UUID', 'UUID'], 'get_delivery_detail is SECURITY DEFINER');
SELECT is_definer('public', 'list_business_deliveries', ARRAY['UUID', 'UUID', 'UUID', 'TEXT', 'INTEGER', 'TIMESTAMPTZ', 'UUID'], 'list_business_deliveries is SECURITY DEFINER');
SELECT is_definer('public', 'verify_delivery_creation_scope', ARRAY['UUID', 'UUID'], 'verify_delivery_creation_scope is SECURITY DEFINER');
SELECT is_definer('public', 'verify_delivery_cancel_scope', ARRAY['UUID', 'UUID'], 'verify_delivery_cancel_scope is SECURITY DEFINER');

-- ----------------------------------------------------------------------------
-- 5. ACL Permissions Tests (PUBLIC/anon/authenticated Denied, service_role Allowed)
-- ----------------------------------------------------------------------------
-- prevent_delivery_events_mutation
SELECT throws_matching(
    'SELECT public.prevent_delivery_events_mutation()',
    '',
    'Calling prevent_delivery_events_mutation outside trigger raises error'
);

-- create_delivery_from_quote_atomic ACL
SELECT function_privs_are('public', 'create_delivery_from_quote_atomic', ARRAY['UUID', 'UUID', 'TEXT', 'TEXT', 'TEXT', 'INTEGER'], 'service_role', ARRAY['EXECUTE'], 'service_role has EXECUTE on create_delivery_from_quote_atomic');
SELECT function_privs_are('public', 'create_delivery_from_quote_atomic', ARRAY['UUID', 'UUID', 'TEXT', 'TEXT', 'TEXT', 'INTEGER'], 'anon', ARRAY[]::TEXT[], 'anon lacks EXECUTE on create_delivery_from_quote_atomic');
SELECT function_privs_are('public', 'create_delivery_from_quote_atomic', ARRAY['UUID', 'UUID', 'TEXT', 'TEXT', 'TEXT', 'INTEGER'], 'authenticated', ARRAY[]::TEXT[], 'authenticated lacks EXECUTE on create_delivery_from_quote_atomic');

-- cancel_delivery_atomic ACL
SELECT function_privs_are('public', 'cancel_delivery_atomic', ARRAY['UUID', 'UUID', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'INTEGER'], 'service_role', ARRAY['EXECUTE'], 'service_role has EXECUTE on cancel_delivery_atomic');
SELECT function_privs_are('public', 'cancel_delivery_atomic', ARRAY['UUID', 'UUID', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'INTEGER'], 'anon', ARRAY[]::TEXT[], 'anon lacks EXECUTE on cancel_delivery_atomic');
SELECT function_privs_are('public', 'cancel_delivery_atomic', ARRAY['UUID', 'UUID', 'TEXT', 'TEXT', 'TEXT', 'TEXT', 'INTEGER'], 'authenticated', ARRAY[]::TEXT[], 'authenticated lacks EXECUTE on cancel_delivery_atomic');

-- get_delivery_detail ACL
SELECT function_privs_are('public', 'get_delivery_detail', ARRAY['UUID', 'UUID'], 'service_role', ARRAY['EXECUTE'], 'service_role has EXECUTE on get_delivery_detail');
SELECT function_privs_are('public', 'get_delivery_detail', ARRAY['UUID', 'UUID'], 'anon', ARRAY[]::TEXT[], 'anon lacks EXECUTE on get_delivery_detail');
SELECT function_privs_are('public', 'get_delivery_detail', ARRAY['UUID', 'UUID'], 'authenticated', ARRAY[]::TEXT[], 'authenticated lacks EXECUTE on get_delivery_detail');

-- list_business_deliveries ACL
SELECT function_privs_are('public', 'list_business_deliveries', ARRAY['UUID', 'UUID', 'UUID', 'TEXT', 'INTEGER', 'TIMESTAMPTZ', 'UUID'], 'service_role', ARRAY['EXECUTE'], 'service_role has EXECUTE on list_business_deliveries');
SELECT function_privs_are('public', 'list_business_deliveries', ARRAY['UUID', 'UUID', 'UUID', 'TEXT', 'INTEGER', 'TIMESTAMPTZ', 'UUID'], 'anon', ARRAY[]::TEXT[], 'anon lacks EXECUTE on list_business_deliveries');
SELECT function_privs_are('public', 'list_business_deliveries', ARRAY['UUID', 'UUID', 'UUID', 'TEXT', 'INTEGER', 'TIMESTAMPTZ', 'UUID'], 'authenticated', ARRAY[]::TEXT[], 'authenticated lacks EXECUTE on list_business_deliveries');

-- verify_delivery_creation_scope ACL
SELECT function_privs_are('public', 'verify_delivery_creation_scope', ARRAY['UUID', 'UUID'], 'service_role', ARRAY['EXECUTE'], 'service_role has EXECUTE on verify_delivery_creation_scope');
SELECT function_privs_are('public', 'verify_delivery_creation_scope', ARRAY['UUID', 'UUID'], 'anon', ARRAY[]::TEXT[], 'anon lacks EXECUTE on verify_delivery_creation_scope');
SELECT function_privs_are('public', 'verify_delivery_creation_scope', ARRAY['UUID', 'UUID'], 'authenticated', ARRAY[]::TEXT[], 'authenticated lacks EXECUTE on verify_delivery_creation_scope');

-- verify_delivery_cancel_scope ACL
SELECT function_privs_are('public', 'verify_delivery_cancel_scope', ARRAY['UUID', 'UUID'], 'service_role', ARRAY['EXECUTE'], 'service_role has EXECUTE on verify_delivery_cancel_scope');
SELECT function_privs_are('public', 'verify_delivery_cancel_scope', ARRAY['UUID', 'UUID'], 'anon', ARRAY[]::TEXT[], 'anon lacks EXECUTE on verify_delivery_cancel_scope');
SELECT function_privs_are('public', 'verify_delivery_cancel_scope', ARRAY['UUID', 'UUID'], 'authenticated', ARRAY[]::TEXT[], 'authenticated lacks EXECUTE on verify_delivery_cancel_scope');

-- ----------------------------------------------------------------------------
-- 6. Functional & Transactional Tests
-- ----------------------------------------------------------------------------

-- Seed Fixtures
INSERT INTO auth.users (id, email)
VALUES
    ('99000000-0000-4000-8000-000000000001', 'owner_f5_test@gueguense.com'),
    ('99000000-0000-4000-8000-000000000002', 'mgr_f5_test@gueguense.com'),
    ('99000000-0000-4000-8000-000000000003', 'driver_f5_test@gueguense.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.businesses (id, legal_name, brand_name, tax_id, account_status)
VALUES
    ('b5000000-0000-4000-8000-000000000001', 'F5 Business S.A.', 'F5 Store', 'J0310000005', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_locations (id, business_id, name, address_text, location, is_active)
VALUES
    ('l5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', 'F5 Central', 'Managua Centro', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.25, 12.13), 4326), true),
    ('l5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', 'F5 Sucursal', 'Carretera Masaya', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.22, 12.10), 4326), true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_members (id, business_id, user_id, role, status)
VALUES
    ('m5000000-0000-4000-8000-000000000001', 'b5000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000001', 'business_owner', 'ACTIVE'),
    ('m5000000-0000-4000-8000-000000000002', 'b5000000-0000-4000-8000-000000000001', '99000000-0000-4000-8000-000000000002', 'business_manager', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_member_locations (business_member_id, business_location_id)
VALUES
    ('m5000000-0000-4000-8000-000000000002', 'l5000000-0000-4000-8000-000000000001')
ON CONFLICT (business_member_id, business_location_id) DO NOTHING;

-- Seed Delivery Request & Quote
INSERT INTO public.delivery_requests (
    id,
    business_id,
    location_id,
    pickup_address_snapshot,
    dropoff_address_snapshot,
    recipient_name,
    recipient_phone,
    dropoff_location,
    package_type,
    cash_to_collect,
    created_by
) VALUES (
    'r5000000-0000-4000-8000-000000000001',
    'b5000000-0000-4000-8000-000000000001',
    'l5000000-0000-4000-8000-000000000001',
    '{"address_text": "Managua Centro", "latitude": 12.13, "longitude": -86.25, "location_id": "l5000000-0000-4000-8000-000000000001", "name": "F5 Central"}'::jsonb,
    '{"address_text": "Plaza Inter", "latitude": 12.14, "longitude": -86.27}'::jsonb,
    'Juan Pérez',
    '+50588880000',
    extensions.ST_SetSRID(extensions.ST_MakePoint(-86.27, 12.14), 4326),
    'PARCEL',
    0,
    '99000000-0000-4000-8000-000000000001'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.delivery_quotes (
    id,
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
    route_distance_meters,
    route_duration_seconds,
    route_provider,
    route_calculated_at,
    expires_at
) VALUES (
    'q5000000-0000-4000-8000-000000000001',
    'r5000000-0000-4000-8000-000000000001',
    'dd000000-0000-4000-8000-000000000001',
    'QUOTED',
    'NIO',
    35.00,
    54.00,
    19.50,
    0.00,
    0.00,
    0.00,
    108.50,
    4500,
    780,
    'GOOGLE_ROUTES',
    now(),
    now() + interval '5 minutes'
) ON CONFLICT (id) DO NOTHING;

-- 6.1 Test Scope Verification
SELECT lives_ok(
    $$ SELECT public.verify_delivery_creation_scope('99000000-0000-4000-8000-000000000001'::uuid, 'q5000000-0000-4000-8000-000000000001'::uuid) $$,
    'verify_delivery_creation_scope succeeds for authorized business owner'
);

-- 6.2 Test Atomic Delivery Creation
DO $$
DECLARE
    v_res JSONB;
    v_lease JSONB;
BEGIN
    -- Acquire lease
    v_lease := public.acquire_idempotency_lease(
        '99000000-0000-4000-8000-000000000001'::uuid,
        'create_delivery:q5000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000001',
        'fp_test_delivery_create',
        30
    );

    -- Atomic execution
    v_res := public.create_delivery_from_quote_atomic(
        '99000000-0000-4000-8000-000000000001'::uuid,
        'q5000000-0000-4000-8000-000000000001'::uuid,
        'a1000000-0000-4000-8000-000000000001',
        'fp_test_delivery_create',
        v_lease->>'reservation_token',
        (v_lease->>'lease_generation')::integer
    );
END;
$$;

-- Verify Quote is CONSUMED with non-null consumed_at
SELECT is(status, 'CONSUMED', 'Quote status is mutated to CONSUMED')
FROM public.delivery_quotes
WHERE id = 'q5000000-0000-4000-8000-000000000001';

SELECT ok(consumed_at IS NOT NULL, 'Quote consumed_at is not null')
FROM public.delivery_quotes
WHERE id = 'q5000000-0000-4000-8000-000000000001';

-- Verify Delivery Exists in SEARCHING_DRIVER state
SELECT is(status, 'SEARCHING_DRIVER', 'Delivery is created in SEARCHING_DRIVER status')
FROM public.deliveries
WHERE quote_id = 'q5000000-0000-4000-8000-000000000001';

SELECT is(quoted_price, 108.50, 'Delivery quoted_price matches quote quoted_total')
FROM public.deliveries
WHERE quote_id = 'q5000000-0000-4000-8000-000000000001';

SELECT ok(driver_id IS NULL, 'Delivery driver_id is NULL initially')
FROM public.deliveries
WHERE quote_id = 'q5000000-0000-4000-8000-000000000001';

-- Verify Exactly 3 Audit Events Created
SELECT is(count(*)::integer, 3, 'Exactly 3 audit events created for delivery')
FROM public.delivery_events
WHERE delivery_id = (SELECT id FROM public.deliveries WHERE quote_id = 'q5000000-0000-4000-8000-000000000001');

-- 6.3 Test Append-Only Enforced on delivery_events (UPDATE & DELETE must fail)
SELECT throws_matching(
    $$ UPDATE public.delivery_events SET event_type = 'MUTATED' WHERE delivery_id = (SELECT id FROM public.deliveries WHERE quote_id = 'q5000000-0000-4000-8000-000000000001') $$,
    'APPEND_ONLY',
    'Updating delivery_events is strictly blocked by trigger'
);

SELECT throws_matching(
    $$ DELETE FROM public.delivery_events WHERE delivery_id = (SELECT id FROM public.deliveries WHERE quote_id = 'q5000000-0000-4000-8000-000000000001') $$,
    'APPEND_ONLY',
    'Deleting from delivery_events is strictly blocked by trigger'
);

-- 6.4 Test Atomic Delivery Cancellation
DO $$
DECLARE
    v_del_id UUID;
    v_lease JSONB;
    v_res JSONB;
BEGIN
    SELECT id INTO v_del_id FROM public.deliveries WHERE quote_id = 'q5000000-0000-4000-8000-000000000001';

    -- Acquire lease for cancel
    v_lease := public.acquire_idempotency_lease(
        '99000000-0000-4000-8000-000000000001'::uuid,
        'cancel_delivery:' || v_del_id::text,
        'a1000000-0000-4000-8000-000000000002',
        'fp_test_delivery_cancel',
        30
    );

    v_res := public.cancel_delivery_atomic(
        '99000000-0000-4000-8000-000000000001'::uuid,
        v_del_id,
        'Cliente canceló orden',
        'a1000000-0000-4000-8000-000000000002',
        'fp_test_delivery_cancel',
        v_lease->>'reservation_token',
        (v_lease->>'lease_generation')::integer
    );
END;
$$;

-- Verify Delivery is CANCELED
SELECT is(status, 'CANCELED', 'Delivery status is mutated to CANCELED')
FROM public.deliveries
WHERE quote_id = 'q5000000-0000-4000-8000-000000000001';

-- Verify Quote remains CONSUMED
SELECT is(status, 'CONSUMED', 'Quote status remains CONSUMED after delivery cancellation')
FROM public.delivery_quotes
WHERE id = 'q5000000-0000-4000-8000-000000000001';

-- Verify Exactly 4 Audit Events (3 from creation + 1 from cancellation)
SELECT is(count(*)::integer, 4, 'Exactly 4 audit events exist after delivery cancellation')
FROM public.delivery_events
WHERE delivery_id = (SELECT id FROM public.deliveries WHERE quote_id = 'q5000000-0000-4000-8000-000000000001');

SELECT is(event_type, 'DELIVERY_CANCELED', 'Fourth event is DELIVERY_CANCELED')
FROM public.delivery_events
WHERE delivery_id = (SELECT id FROM public.deliveries WHERE quote_id = 'q5000000-0000-4000-8000-000000000001')
ORDER BY id DESC
LIMIT 1;

-- Finish Plan
SELECT * FROM finish();
ROLLBACK;
