BEGIN;
SELECT plan(15);

-- 1. Schema & Extensions Tests
SELECT has_schema('public', 'Schema public should exist');
SELECT has_schema('private', 'Schema private should exist');
SELECT has_extension('postgis', 'PostGIS extension should be installed');

-- 2. Table Existence Tests
SELECT has_table('public', 'profiles', 'Table profiles should exist');
SELECT has_table('public', 'businesses', 'Table businesses should exist');
SELECT has_table('public', 'business_members', 'Table business_members should exist');
SELECT has_table('public', 'drivers', 'Table drivers should exist');
SELECT has_table('public', 'driver_presence', 'Table driver_presence should exist');

-- 3. RLS Enabled Tests
SELECT rls_is_enabled('public', 'profiles', 'RLS should be enabled on profiles');
SELECT rls_is_enabled('public', 'businesses', 'RLS should be enabled on businesses');
SELECT rls_is_enabled('public', 'drivers', 'RLS should be enabled on drivers');
SELECT rls_is_enabled('public', 'driver_presence', 'RLS should be enabled on driver_presence');

-- 4. Schema Isolation Tests (Private schema revoked from anon/authenticated)
SELECT schema_privs_are('private', 'anon', ARRAY[]::text[], 'anon role should have no privileges on private schema');
SELECT schema_privs_are('private', 'authenticated', ARRAY[]::text[], 'authenticated role should have no privileges on private schema');

-- 5. Primary Key Tests
SELECT has_pk('public', 'profiles', 'profiles should have a primary key');

SELECT * FROM finish();
ROLLBACK;
