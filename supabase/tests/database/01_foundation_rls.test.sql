BEGIN;
SELECT plan(18);

-- 1. Schema & Extension Tests
SELECT has_schema('public', 'Schema public should exist');
SELECT has_schema('private', 'Schema private should exist');
SELECT has_extension('postgis', 'PostGIS extension should be installed');

-- 2. Foundation Tables Existence Tests (9 tables)
SELECT has_table('public', 'profiles', 'Table profiles should exist');
SELECT has_table('public', 'businesses', 'Table businesses should exist');
SELECT has_table('public', 'business_members', 'Table business_members should exist');
SELECT has_table('public', 'business_locations', 'Table business_locations should exist');
SELECT has_table('public', 'business_member_locations', 'Table business_member_locations should exist');
SELECT has_table('public', 'drivers', 'Table drivers should exist');
SELECT has_table('public', 'driver_documents', 'Table driver_documents should exist');
SELECT has_table('public', 'vehicles', 'Table vehicles should exist');
SELECT has_table('public', 'driver_presence', 'Table driver_presence should exist');

-- 3. RLS Enabled Tests
SELECT rls_is_enabled('public', 'profiles', 'RLS enabled on profiles');
SELECT rls_is_enabled('public', 'businesses', 'RLS enabled on businesses');
SELECT rls_is_enabled('public', 'business_members', 'RLS enabled on business_members');
SELECT rls_is_enabled('public', 'drivers', 'RLS enabled on drivers');
SELECT rls_is_enabled('public', 'driver_presence', 'RLS enabled on driver_presence');

-- 4. Schema Isolation Test
SELECT schema_privs_are('private', 'authenticated', ARRAY[]::text[], 'authenticated role has zero privileges on private schema');

-- 5. Primary Key Test
SELECT has_pk('public', 'profiles', 'profiles has PK');

SELECT * FROM finish();
ROLLBACK;
