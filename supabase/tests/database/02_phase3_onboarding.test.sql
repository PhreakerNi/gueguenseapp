BEGIN;

SELECT plan(35);

-- 1. Structural Checks: Idempotency Keys, Audit Logs, Bucket & Indexes (5 assertions: 1-5)
SELECT has_table('public', 'idempotency_keys', 'public.idempotency_keys table exists');
SELECT is(
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'idempotency_keys'),
    true,
    'public.idempotency_keys has RLS enabled'
);
SELECT has_table('public', 'audit_logs', 'public.audit_logs table exists');
SELECT is(
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'audit_logs'),
    true,
    'public.audit_logs has RLS enabled'
);
SELECT is(
    (SELECT public FROM storage.buckets WHERE id = 'driver-documents'),
    false,
    'storage bucket driver-documents is private'
);

-- 2. Function Signature & Security Checks (5 assertions: 6-10)
SELECT has_function('public', 'create_business', ARRAY['uuid', 'text', 'text', 'text'], 'create_business function exists with correct parameters');
SELECT has_function('public', 'create_business_location', ARRAY['uuid', 'uuid', 'text', 'text', 'double precision', 'double precision', 'text'], 'create_business_location function exists with correct parameters');
SELECT has_function('public', 'add_business_member', ARRAY['uuid', 'uuid', 'uuid', 'text', 'uuid[]'], 'add_business_member function exists with correct parameters');
SELECT has_function('public', 'register_driver', ARRAY['uuid', 'text', 'text'], 'register_driver function exists with correct parameters');
SELECT has_function('public', 'admin_verify_driver', ARRAY['uuid', 'uuid', 'text', 'text', 'text', 'text'], 'admin_verify_driver function exists with correct parameters');

-- 3. Synthetic Test Users Setup
SET LOCAL ROLE postgres;
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES 
    ('11111111-1111-4111-8111-111111111111', 'bizowner@test.com', '{"full_name":"Biz Owner"}'::jsonb),
    ('22222222-2222-4222-8222-222222222222', 'driver@test.com', '{"full_name":"Test Driver"}'::jsonb),
    ('33333333-3333-4333-8333-333333333333', 'agent@test.com', '{"full_name":"Verification Agent"}'::jsonb),
    ('44444444-4444-4444-8444-444444444444', 'oper@test.com', '{"full_name":"Operator"}'::jsonb),
    ('55555555-5555-4555-8555-555555555555', 'admin@test.com', '{"full_name":"Admin User"}'::jsonb),
    ('66666666-6666-4666-8666-666666666666', 'manager@test.com', '{"full_name":"Manager User"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET platform_role = 'verification_agent' WHERE id = '33333333-3333-4333-8333-333333333333';
UPDATE public.profiles SET platform_role = 'operator' WHERE id = '44444444-4444-4444-8444-444444444444';
UPDATE public.profiles SET platform_role = 'admin' WHERE id = '55555555-5555-4555-8555-555555555555';

-- 4. Direct Client Execution Revoked (Priority 5: 2 assertions: 11-12)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';

SELECT throws_ok(
    $$SELECT public.create_business('11111111-1111-4111-8111-111111111111'::uuid, 'Empresa S.A.', 'Mi Tienda', 'J0319999999999')$$,
    '42501',
    NULL,
    'Direct RPC execution of create_business by authenticated role is denied'
);

SELECT throws_ok(
    $$SELECT public.register_driver('22222222-2222-4222-8222-222222222222'::uuid, '001-010190-9999Z', 'LIC-99999999')$$,
    '42501',
    NULL,
    'Direct RPC execution of register_driver by authenticated role is denied'
);

-- 5. Business Onboarding & Branch Creation via Service Role (6 assertions: 13-18)
SET LOCAL ROLE service_role;

SELECT public.create_business(
    '11111111-1111-4111-8111-111111111111'::uuid,
    'Empresa Nueva S.A.',
    'Mi Pulperia Nueva',
    'J0319999999999'
);

SELECT is(
    (SELECT verification_status FROM public.businesses WHERE legal_name = 'Empresa Nueva S.A.'),
    'PENDING',
    'Business initial verification_status is PENDING'
);

SELECT is(
    (SELECT role FROM public.business_members WHERE user_id = '11111111-1111-4111-8111-111111111111'),
    'business_owner',
    'Creator assigned business_owner role'
);

-- Separate Branch Creation
SELECT public.create_business_location(
    '11111111-1111-4111-8111-111111111111'::uuid,
    (SELECT id FROM public.businesses WHERE legal_name = 'Empresa Nueva S.A.'),
    'Sucursal Central',
    'Calle Principal #123, Managua',
    12.136389,
    -86.251389,
    'Tocar timbre en recepcion'
);

SELECT is(
    (SELECT name FROM public.business_locations WHERE address_text = 'Calle Principal #123, Managua'),
    'Sucursal Central',
    'First branch created separately with correct name'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.business_member_locations bml
        JOIN public.business_members bm ON bm.id = bml.business_member_id
        WHERE bm.user_id = '11111111-1111-4111-8111-111111111111'
    ),
    'Business owner linked to branch via N:M business_member_locations'
);

-- Add Business Manager linked to branch
SELECT public.add_business_member(
    '11111111-1111-4111-8111-111111111111'::uuid,
    (SELECT id FROM public.businesses WHERE legal_name = 'Empresa Nueva S.A.'),
    '66666666-6666-4666-8666-666666666666'::uuid,
    'business_manager',
    ARRAY[(SELECT id FROM public.business_locations WHERE address_text = 'Calle Principal #123, Managua')]::uuid[]
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.business_member_locations bml
        JOIN public.business_members bm ON bm.id = bml.business_member_id
        WHERE bm.user_id = '66666666-6666-4666-8666-666666666666'
    ),
    'Manager linked to branch via N:M business_member_locations'
);

-- Duplicate business creation check
SELECT throws_ok(
    $$SELECT public.create_business(
        '11111111-1111-4111-8111-111111111111'::uuid,
        'Empresa Nueva S.A.',
        'Mi Pulperia Nueva',
        'J0319999999999'
    )$$,
    'P0001',
    'ALREADY_REGISTERED: User is already an active member of a business',
    'Duplicate call to create_business is rejected'
);

-- 6. Driver Registration & Vehicle Registration via Service Role (5 assertions: 19-23)
SELECT public.register_driver(
    '22222222-2222-4222-8222-222222222222'::uuid,
    '001-010190-9999Z',
    'LIC-99999999'
);

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'PENDING',
    'Driver initial verification_status is PENDING'
);

SELECT is(
    (SELECT account_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'REGISTERED',
    'Driver initial account_status is REGISTERED'
);

SELECT is(
    (SELECT operational_state FROM public.driver_presence WHERE driver_id = '22222222-2222-4222-8222-222222222222'),
    'OFFLINE',
    'Driver presence initialized to OFFLINE'
);

-- Separate Vehicle Registration
SELECT public.register_vehicle(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'Yamaha',
    'FZ-S',
    2023,
    'Azul',
    'M-999999'
);

SELECT is(
    (SELECT make FROM public.vehicles WHERE driver_id = '22222222-2222-4222-8222-222222222222'),
    'Yamaha',
    'Vehicle registered separately with correct make'
);

-- Duplicate registration check
SELECT throws_ok(
    $$SELECT public.register_driver(
        '22222222-2222-4222-8222-222222222222'::uuid,
        '001-010190-9999Z',
        'LIC-99999999'
    )$$,
    'P0001',
    'ALREADY_REGISTERED: User is already registered as a driver',
    'Duplicate call to register_driver is rejected'
);

-- 7. Document Commit & Storage Prefix Checks (4 assertions: 24-27)
SELECT public.commit_driver_document(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'NATIONAL_ID',
    '22222222-2222-4222-8222-222222222222/national_id.pdf',
    2048,
    'application/pdf'
);

SELECT public.commit_driver_document(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'DRIVER_LICENSE',
    '22222222-2222-4222-8222-222222222222/driver_license.pdf',
    4096,
    'application/pdf'
);

SELECT is(
    (SELECT count(*) FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND verification_status = 'PENDING'),
    2::bigint,
    'Driver has 2 documents submitted in PENDING status'
);

SELECT is(
    (SELECT verification_status FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND document_type = 'NATIONAL_ID'),
    'PENDING',
    'Submitted document status is PENDING'
);

-- Storage prefix mismatch is rejected
SELECT throws_ok(
    $$SELECT public.commit_driver_document(
        '22222222-2222-4222-8222-222222222222'::uuid,
        'NATIONAL_ID',
        'malicious-prefix/national_id.pdf',
        2048,
        'application/pdf'
    )$$,
    'P0001',
    'INVALID_STORAGE_PATH: Storage path must reside within actor driver directory',
    'Storage prefix mismatch is rejected'
);

-- Approval without all 3 documents fails
SELECT throws_ok(
    $$SELECT public.admin_verify_driver(
        '33333333-3333-4333-8333-333333333333'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        'APPROVE',
        NULL,
        'verification_agent',
        'aal2'
    )$$,
    'P0001',
    'DOCUMENTATION_INCOMPLETE: Driver must have all 3 mandatory documents (NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION)',
    'Approval requires all 3 mandatory documents'
);

-- 8. Rejection, Re-upload and Full Approval Verification (8 assertions: 28-35)

-- 8.1 Operator cannot verify
SELECT throws_ok(
    $$SELECT public.admin_verify_driver(
        '44444444-4444-4444-8444-444444444444'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        'APPROVE',
        NULL,
        'operator',
        'aal2'
    )$$,
    'P0001',
    'AUTH_ADMIN_ROLE_REQUIRED: Only verification_agent, admin or super_admin can verify drivers',
    'Operator cannot verify drivers'
);

-- 8.2 AAL1 session cannot verify
SELECT throws_ok(
    $$SELECT public.admin_verify_driver(
        '33333333-3333-4333-8333-333333333333'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        'APPROVE',
        NULL,
        'verification_agent',
        'aal1'
    )$$,
    'P0001',
    'AUTH_MFA_REQUIRED: AAL2 MFA is required for administrative verification',
    'AAL1 session cannot verify drivers'
);

-- 8.3 Verification Agent rejects driver (Rejection flow + Canonical DRIVER_REJECTED audit)
SELECT public.admin_verify_driver(
    '33333333-3333-4333-8333-333333333333'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    'REJECT',
    'Cedula ilegible',
    'verification_agent',
    'aal2'
);

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'REJECTED',
    'Driver status changed to REJECTED'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.audit_logs 
        WHERE entity_id = '22222222-2222-4222-8222-222222222222' 
          AND action = 'DRIVER_REJECTED' 
          AND entity_type = 'driver'
    ),
    'Canonical DRIVER_REJECTED audit log created'
);

-- 8.4 Driver re-submits document and remaining 3rd document (VEHICLE_REGISTRATION)
SELECT public.commit_driver_document(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'NATIONAL_ID',
    '22222222-2222-4222-8222-222222222222/national_id_v2.pdf',
    3072,
    'application/pdf'
);

SELECT public.commit_driver_document(
    '22222222-2222-4222-8222-222222222222'::uuid,
    'VEHICLE_REGISTRATION',
    '22222222-2222-4222-8222-222222222222/veh_reg.pdf',
    2048,
    'application/pdf'
);

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'PENDING',
    'Driver verification_status automatically reset to PENDING after re-upload'
);

-- 8.5 Admin Approves Driver
SELECT public.admin_verify_driver(
    '55555555-5555-4555-8555-555555555555'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    'APPROVE',
    NULL,
    'admin',
    'aal2'
);

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'VERIFIED',
    'Approved driver has verification_status = VERIFIED'
);

SELECT is(
    (SELECT account_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'ACTIVE',
    'Approved driver has account_status = ACTIVE'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.audit_logs 
        WHERE entity_id = '22222222-2222-4222-8222-222222222222' 
          AND action = 'DRIVER_VERIFIED' 
          AND entity_type = 'driver'
    ),
    'Canonical DRIVER_VERIFIED audit log created'
);

SELECT * FROM finish();
ROLLBACK;
