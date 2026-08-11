BEGIN;
SELECT plan(58);

-- 1. Schema & Extension Verification (3 assertions)
SELECT has_schema('public', 'Schema public should exist');
SELECT has_schema('private', 'Schema private should exist');
SELECT has_extension('postgis', 'PostGIS extension should be installed');

-- 2. Foundation Tables Existence (9 assertions)
SELECT has_table('public', 'profiles', 'Table profiles exists');
SELECT has_table('public', 'businesses', 'Table businesses exists');
SELECT has_table('public', 'business_members', 'Table business_members exists');
SELECT has_table('public', 'business_locations', 'Table business_locations exists');
SELECT has_table('public', 'business_member_locations', 'Table business_member_locations exists');
SELECT has_table('public', 'drivers', 'Table drivers exists');
SELECT has_table('public', 'driver_documents', 'Table driver_documents exists');
SELECT has_table('public', 'vehicles', 'Table vehicles exists');
SELECT has_table('public', 'driver_presence', 'Table driver_presence exists');

-- 3. RLS Enabled Verification (9 assertions)
SELECT rls_is_enabled('public', 'profiles', 'RLS enabled on profiles');
SELECT rls_is_enabled('public', 'businesses', 'RLS enabled on businesses');
SELECT rls_is_enabled('public', 'business_members', 'RLS enabled on business_members');
SELECT rls_is_enabled('public', 'business_locations', 'RLS enabled on business_locations');
SELECT rls_is_enabled('public', 'business_member_locations', 'RLS enabled on business_member_locations');
SELECT rls_is_enabled('public', 'drivers', 'RLS enabled on drivers');
SELECT rls_is_enabled('public', 'driver_documents', 'RLS enabled on driver_documents');
SELECT rls_is_enabled('public', 'vehicles', 'RLS enabled on vehicles');
SELECT rls_is_enabled('public', 'driver_presence', 'RLS enabled on driver_presence');

-- 4. Schema Isolation (1 assertion)
SELECT schema_privs_are('private', 'authenticated', ARRAY[]::text[], 'authenticated role has zero direct privileges on private schema');

-- 5. Trigger auth.users -> profiles Auto Bootstrap Verification (1 assertion)
SET LOCAL ROLE postgres;
INSERT INTO auth.users (id, email) VALUES ('66666666-6666-6666-6666-666666666666', 'trigger_test@test.com') ON CONFLICT (id) DO NOTHING;
SELECT results_eq(
  'SELECT id FROM public.profiles WHERE id = ''66666666-6666-6666-6666-666666666666''',
  ARRAY['66666666-6666-6666-6666-666666666666'::uuid],
  'auth.users INSERT automatically creates profile via database trigger'
);

-- 6. Behavioral Security Fixtures Setup
-- Synthetic Test Users
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner_a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'outsider_b@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'employee_a@test.com'),
  ('44444444-4444-4444-4444-444444444444', 'driver_a@test.com'),
  ('55555555-5555-5555-5555-555555555555', 'driver_b@test.com')
ON CONFLICT (id) DO NOTHING;

-- Synthetic Businesses
INSERT INTO public.businesses (id, brand_name, legal_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Business A', 'Business A SA'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Business B', 'Business B SA')
ON CONFLICT (id) DO NOTHING;

-- Synthetic Memberships
INSERT INTO public.business_members (id, business_id, user_id, role, status) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'business_owner', 'ACTIVE'),
  ('a3333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'business_employee', 'ACTIVE'),
  ('b2222222-2222-2222-2222-222222222222', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'business_owner', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Synthetic Locations (Valid Hex UUIDs)
INSERT INTO public.business_locations (id, business_id, name, address_text, location) VALUES
  ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Location A1', 'Managua 1', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.25, 12.13), 4326)),
  ('a1000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Location A2', 'Managua 2', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.26, 12.14), 4326)),
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Location B1', 'Leon 1', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.88, 12.43), 4326))
ON CONFLICT (id) DO NOTHING;

-- N:M Location Assignments (Valid Hex UUIDs)
INSERT INTO public.business_member_locations (id, business_member_id, business_location_id) VALUES
  ('c1000000-0000-4000-8000-000000000001', 'a3333333-3333-3333-3333-333333333333', 'a1000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000001', 'b2222222-2222-2222-2222-222222222222', 'b1000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- Synthetic Drivers & Documents
INSERT INTO public.drivers (id, national_id_number, license_number, verification_status, account_status) VALUES
  ('44444444-4444-4444-4444-444444444444', 'ID-DRIVER-A', 'LIC-DRIVER-A', 'PENDING', 'REGISTERED'),
  ('55555555-5555-5555-5555-555555555555', 'ID-DRIVER-B', 'LIC-DRIVER-B', 'PENDING', 'REGISTERED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.driver_documents (id, driver_id, document_type, storage_path, verification_status) VALUES
  ('d1000000-0000-4000-8000-000000000001', '44444444-4444-4444-4444-444444444444', 'NATIONAL_ID', '/docs/driver_a.pdf', 'VERIFIED'),
  ('d2000000-0000-4000-8000-000000000001', '55555555-5555-5555-5555-555555555555', 'NATIONAL_ID', '/docs/driver_b.pdf', 'VERIFIED')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.driver_presence (driver_id, operational_state) VALUES
  ('44444444-4444-4444-4444-444444444444', 'OFFLINE'),
  ('55555555-5555-5555-5555-555555555555', 'OFFLINE')
ON CONFLICT (driver_id) DO NOTHING;

-- 7. Behavioral RLS Suite under authenticated Role

-- Context: Owner A (User A)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

SELECT is(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'auth.uid() set to Owner A'); -- 1 assertion

SELECT results_eq(
  'SELECT id FROM public.profiles WHERE id = ''11111111-1111-1111-1111-111111111111''',
  ARRAY['11111111-1111-1111-1111-111111111111'::uuid],
  'Owner A can read own profile'
); -- 1 assertion

SELECT is_empty(
  'SELECT id FROM public.profiles WHERE id = ''22222222-2222-2222-2222-222222222222''',
  'Owner A denied reading User B profile'
); -- 1 assertion

SELECT is_empty(
  'UPDATE public.profiles SET platform_role = ''super_admin'' WHERE id = ''11111111-1111-1111-1111-111111111111'' RETURNING id',
  'Owner A direct UPDATE on profiles platform_role affects 0 rows'
); -- 1 assertion

SET LOCAL ROLE postgres;
SELECT results_eq(
  'SELECT platform_role FROM public.profiles WHERE id = ''11111111-1111-1111-1111-111111111111''',
  ARRAY['none'],
  'platform_role remained unchanged after attempted escalation'
); -- 1 assertion

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

SELECT results_eq(
  'SELECT id FROM public.businesses WHERE id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  ARRAY['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid],
  'Owner A can read Business A'
); -- 1 assertion

SELECT is_empty(
  'SELECT id FROM public.businesses WHERE id = ''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb''',
  'Owner A denied reading Business B'
); -- 1 assertion

-- Bidirectional cross-tenant check: Outsider B denied Business A
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SELECT is(auth.uid(), '22222222-2222-2222-2222-222222222222'::uuid, 'auth.uid() set to Outsider B'); -- 1 assertion
SELECT is_empty(
  'SELECT id FROM public.businesses WHERE id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'Outsider B denied reading Business A (Bidirectional isolation)'
); -- 1 assertion

SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
SELECT is(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'auth.uid() reset to Owner A'); -- 1 assertion

SELECT lives_ok(
  'SELECT id FROM public.business_members WHERE business_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  'business_members query executes without RLS recursion'
); -- 1 assertion

SELECT results_eq(
  'SELECT id FROM public.business_members WHERE business_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'' ORDER BY id',
  ARRAY['a1111111-1111-1111-1111-111111111111'::uuid, 'a3333333-3333-3333-3333-333333333333'::uuid],
  'Owner A reads members of Business A'
); -- 1 assertion

SELECT is_empty(
  'SELECT id FROM public.business_members WHERE id = ''b2222222-2222-2222-2222-222222222222''',
  'Owner A denied reading member of Business B'
); -- 1 assertion

SELECT results_eq(
  'SELECT id FROM public.business_locations WHERE business_id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'' ORDER BY name',
  ARRAY['a1000000-0000-4000-8000-000000000001'::uuid, 'a1000000-0000-4000-8000-000000000002'::uuid],
  'Owner A can view all locations of Business A'
); -- 1 assertion

SELECT results_eq(
  'SELECT id FROM public.business_member_locations WHERE business_location_id = ''a1000000-0000-4000-8000-000000000001''',
  ARRAY['c1000000-0000-4000-8000-000000000001'::uuid],
  'Owner A can view business_member_locations assignments for Business A'
); -- 1 assertion

-- Context: Employee A (User C - assigned only to location_a1)
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';

SELECT is(auth.uid(), '33333333-3333-3333-3333-333333333333'::uuid, 'auth.uid() set to Employee A'); -- 1 assertion

SELECT results_eq(
  'SELECT id FROM public.business_locations WHERE id = ''a1000000-0000-4000-8000-000000000001''',
  ARRAY['a1000000-0000-4000-8000-000000000001'::uuid],
  'Employee A can view assigned location A1'
); -- 1 assertion

SELECT is_empty(
  'SELECT id FROM public.business_locations WHERE id = ''a1000000-0000-4000-8000-000000000002''',
  'Employee A denied viewing unassigned location A2'
); -- 1 assertion

SELECT is_empty(
  'SELECT id FROM public.business_locations WHERE id = ''b1000000-0000-4000-8000-000000000001''',
  'Employee A denied viewing cross-business location B1'
); -- 1 assertion

SELECT results_eq(
  'SELECT id FROM public.business_member_locations WHERE id = ''c1000000-0000-4000-8000-000000000001''',
  ARRAY['c1000000-0000-4000-8000-000000000001'::uuid],
  'Employee A can view own business_member_locations assignment'
); -- 1 assertion

SELECT is_empty(
  'SELECT id FROM public.business_member_locations WHERE id = ''c2000000-0000-4000-8000-000000000001''',
  'Employee A denied viewing Business B business_member_locations assignment'
); -- 1 assertion

-- Context: Driver A (User 4)
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';

SELECT is(auth.uid(), '44444444-4444-4444-4444-444444444444'::uuid, 'auth.uid() set to Driver A'); -- 1 assertion

SELECT results_eq(
  'SELECT id FROM public.drivers WHERE id = ''44444444-4444-4444-4444-444444444444''',
  ARRAY['44444444-4444-4444-4444-444444444444'::uuid],
  'Driver A can read own driver profile'
); -- 1 assertion

SELECT is_empty(
  'SELECT id FROM public.drivers WHERE id = ''55555555-5555-5555-5555-555555555555''',
  'Driver A denied reading Driver B profile'
); -- 1 assertion

SELECT is_empty(
  'UPDATE public.drivers SET verification_status = ''VERIFIED'' WHERE id = ''44444444-4444-4444-4444-444444444444'' RETURNING id',
  'Driver A direct UPDATE on verification_status affects 0 rows'
); -- 1 assertion

SELECT is_empty(
  'UPDATE public.drivers SET account_status = ''ACTIVE'' WHERE id = ''44444444-4444-4444-4444-444444444444'' RETURNING id',
  'Driver A direct UPDATE on account_status affects 0 rows'
); -- 1 assertion

SET LOCAL ROLE postgres;
SELECT results_eq(
  'SELECT verification_status FROM public.drivers WHERE id = ''44444444-4444-4444-4444-444444444444''',
  ARRAY['PENDING'],
  'Driver verification_status remained unchanged after attempted modification'
); -- 1 assertion

SELECT results_eq(
  'SELECT account_status FROM public.drivers WHERE id = ''44444444-4444-4444-4444-444444444444''',
  ARRAY['REGISTERED'],
  'Driver account_status remained unchanged after attempted modification'
); -- 1 assertion

SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-4444-444444444444';

SELECT results_eq(
  'SELECT id FROM public.driver_documents WHERE id = ''d1000000-0000-4000-8000-000000000001''',
  ARRAY['d1000000-0000-4000-8000-000000000001'::uuid],
  'Driver A can read own driver document'
); -- 1 assertion

SELECT is_empty(
  'SELECT id FROM public.driver_documents WHERE id = ''d2000000-0000-4000-8000-000000000001''',
  'Driver A denied reading Driver B document'
); -- 1 assertion

SELECT throws_ok(
  'INSERT INTO public.driver_documents (driver_id, document_type, storage_path, verification_status) VALUES (''44444444-4444-4444-4444-444444444444'', ''NATIONAL_ID'', ''/path'', ''VERIFIED'')',
  '42501',
  NULL,
  'Driver A denied direct INSERT on driver_documents with RLS 42501'
); -- 1 assertion

SELECT is_empty(
  'UPDATE public.driver_presence SET current_location = extensions.ST_SetSRID(extensions.ST_MakePoint(-86.25, 12.13), 4326) WHERE driver_id = ''44444444-4444-4444-4444-444444444444'' RETURNING driver_id',
  'Driver A direct UPDATE on current_location affects 0 rows'
); -- 1 assertion

SELECT is_empty(
  'UPDATE public.driver_presence SET location_updated_at = NOW() WHERE driver_id = ''44444444-4444-4444-4444-444444444444'' RETURNING driver_id',
  'Driver A direct UPDATE on location_updated_at affects 0 rows'
); -- 1 assertion

SELECT is_empty(
  'UPDATE public.driver_presence SET operational_state = ''AVAILABLE'' WHERE driver_id = ''44444444-4444-4444-4444-444444444444'' RETURNING driver_id',
  'Driver A direct UPDATE on operational_state affects 0 rows'
); -- 1 assertion

SELECT throws_ok(
  'SELECT private.get_user_business_ids(''11111111-1111-1111-1111-111111111111'')',
  '42501',
  NULL,
  'Direct client invocation of private schema helper by authenticated role denied with 42501'
); -- 1 assertion

SELECT * FROM finish();
ROLLBACK;
