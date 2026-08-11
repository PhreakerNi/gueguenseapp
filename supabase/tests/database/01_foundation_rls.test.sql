BEGIN;
SELECT plan(28);

-- 1. Schema & Extension Verification
SELECT has_schema('public', 'Schema public should exist');
SELECT has_schema('private', 'Schema private should exist');
SELECT has_extension('postgis', 'PostGIS extension should be installed');

-- 2. Foundation Tables Existence (9 tables)
SELECT has_table('public', 'profiles', 'Table profiles exists');
SELECT has_table('public', 'businesses', 'Table businesses exists');
SELECT has_table('public', 'business_members', 'Table business_members exists');
SELECT has_table('public', 'business_locations', 'Table business_locations exists');
SELECT has_table('public', 'business_member_locations', 'Table business_member_locations exists');
SELECT has_table('public', 'drivers', 'Table drivers exists');
SELECT has_table('public', 'driver_documents', 'Table driver_documents exists');
SELECT has_table('public', 'vehicles', 'Table vehicles exists');
SELECT has_table('public', 'driver_presence', 'Table driver_presence exists');

-- 3. RLS Enabled Verification
SELECT rls_is_enabled('public', 'profiles', 'RLS enabled on profiles');
SELECT rls_is_enabled('public', 'businesses', 'RLS enabled on businesses');
SELECT rls_is_enabled('public', 'business_members', 'RLS enabled on business_members');
SELECT rls_is_enabled('public', 'business_locations', 'RLS enabled on business_locations');
SELECT rls_is_enabled('public', 'business_member_locations', 'RLS enabled on business_member_locations');
SELECT rls_is_enabled('public', 'drivers', 'RLS enabled on drivers');
SELECT rls_is_enabled('public', 'driver_documents', 'RLS enabled on driver_documents');
SELECT rls_is_enabled('public', 'vehicles', 'RLS enabled on vehicles');
SELECT rls_is_enabled('public', 'driver_presence', 'RLS enabled on driver_presence');

-- 4. Schema Isolation
SELECT schema_privs_are('private', 'authenticated', ARRAY[]::text[], 'authenticated role has zero direct privileges on private schema');

-- 5. Behavioral Security Fixtures
SET LOCAL ROLE postgres;

-- Synthetic Test Users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'user_a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'user_b@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'driver_a@test.com'),
  ('44444444-4444-4444-4444-444444444444', 'driver_b@test.com')
ON CONFLICT (id) DO NOTHING;

-- Synthetic Businesses
INSERT INTO public.businesses (id, brand_name, legal_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Business A', 'Business A SA'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Business B', 'Business B SA')
ON CONFLICT (id) DO NOTHING;

-- Synthetic Memberships
INSERT INTO public.business_members (id, business_id, user_id, role, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'business_owner', 'ACTIVE'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'business_owner', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Synthetic Drivers & Presence
INSERT INTO public.drivers (id, national_id_number, license_number) VALUES
  ('33333333-3333-3333-3333-333333333333', 'ID-DRIVER-A', 'LIC-DRIVER-A'),
  ('44444444-4444-4444-4444-444444444444', 'ID-DRIVER-B', 'LIC-DRIVER-B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.driver_presence (driver_id, operational_state) VALUES
  ('33333333-3333-3333-3333-333333333333', 'AVAILABLE'),
  ('44444444-4444-4444-4444-444444444444', 'OFFLINE')
ON CONFLICT (driver_id) DO NOTHING;

-- 6. Behavioral Tests under authenticated Role
SET LOCAL ROLE authenticated;

-- Test 6.1: Profile Own Read & Cross-User Isolation
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SELECT results_eq(
  'SELECT id FROM public.profiles WHERE id = ''11111111-1111-1111-1111-111111111111''',
  ARRAY['11111111-1111-1111-1111-111111111111'::uuid],
  'User A can read own profile'
);

SELECT is_empty(
  'SELECT id FROM public.profiles WHERE id = ''22222222-2222-2222-2222-222222222222''',
  'User A denied reading User B profile'
);

-- Test 6.2: Platform Role Escalation Denial
SELECT throws_ok(
  'UPDATE public.profiles SET platform_role = ''super_admin'' WHERE id = ''11111111-1111-1111-1111-111111111111''',
  'User A denied direct UPDATE on profiles platform_role'
);

-- Test 6.3: Business Cross-Tenant Isolation
SELECT results_eq(
  'SELECT id FROM public.businesses WHERE id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid],
  'Owner A can read Business A'
);

SELECT is_empty(
  'SELECT id FROM public.businesses WHERE id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  'Owner A denied reading Business B'
);

-- Test 6.4: Driver Verification Self-Change Denial
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
SELECT throws_ok(
  'UPDATE public.drivers SET verification_status = ''VERIFIED'' WHERE id = ''33333333-3333-3333-3333-333333333333''',
  'Driver A denied direct UPDATE on verification_status'
);

-- Test 6.5: Driver Documents Direct INSERT Denial
SELECT throws_ok(
  'INSERT INTO public.driver_documents (driver_id, document_type, storage_path, verification_status) VALUES (''33333333-3333-3333-3333-333333333333'', ''NATIONAL_ID'', ''/path'', ''VERIFIED'')',
  'Driver A denied direct INSERT on driver_documents'
);

-- Test 6.6: Driver Presence Direct UPDATE Denial
SELECT throws_ok(
  'UPDATE public.driver_presence SET operational_state = ''BUSY'' WHERE driver_id = ''33333333-3333-3333-3333-333333333333''',
  'Driver A denied direct UPDATE on driver_presence'
);

SELECT * FROM finish();
ROLLBACK;
