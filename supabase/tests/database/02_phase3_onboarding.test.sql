BEGIN;

SELECT plan(35);

-- 1. Structural Checks: Audit Logs Table & Private Storage Bucket (4 assertions)
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
SELECT ok(
    EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'driver-documents'),
    'storage bucket driver-documents exists in storage.buckets'
);

-- 2. Function Signature & Security Checks (4 assertions)
SELECT has_function('public', 'register_business_onboarding', ARRAY['text', 'text', 'text', 'text', 'text', 'double precision', 'double precision', 'text'], 'register_business_onboarding function exists with correct parameters');
SELECT has_function('public', 'register_driver_onboarding', ARRAY['text', 'text', 'text', 'text', 'integer', 'text', 'text'], 'register_driver_onboarding function exists with correct parameters');
SELECT has_function('public', 'submit_driver_document', ARRAY['text', 'text'], 'submit_driver_document function exists with correct parameters');
SELECT has_function('public', 'admin_verify_driver', ARRAY['uuid', 'text', 'text'], 'admin_verify_driver function exists with correct parameters');

-- 3. Synthetic Test Users Setup
SET LOCAL ROLE postgres;
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES 
    ('11111111-1111-4111-8111-111111111111', 'bizowner@test.com', '{"full_name":"Biz Owner"}'::jsonb),
    ('22222222-2222-4222-8222-222222222222', 'driver@test.com', '{"full_name":"Test Driver"}'::jsonb),
    ('33333333-3333-4333-8333-333333333333', 'agent@test.com', '{"full_name":"Verification Agent"}'::jsonb),
    ('44444444-4444-4444-8444-444444444444', 'oper@test.com', '{"full_name":"Operator"}'::jsonb),
    ('55555555-5555-4555-8555-555555555555', 'admin@test.com', '{"full_name":"Admin User"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET platform_role = 'verification_agent' WHERE id = '33333333-3333-4333-8333-333333333333';
UPDATE public.profiles SET platform_role = 'operator' WHERE id = '44444444-4444-4444-8444-444444444444';
UPDATE public.profiles SET platform_role = 'admin' WHERE id = '55555555-5555-4555-8555-555555555555';

-- 4. Business Onboarding Test (7 assertions)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-4111-8111-111111111111';
SET LOCAL "request.jwt.claims" = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

SELECT lives_ok(
    $$SELECT public.register_business_onboarding(
        'Empresa Legal S.A.',
        'Mi Pulperia',
        'J0310000000001',
        'Sucursal Central',
        'Calle Principal #123, Managua',
        12.136389,
        -86.251389,
        'Tocar timbre en recepcion'
    )$$,
    'register_business_onboarding executes without error'
);

SELECT is(
    (SELECT brand_name FROM public.businesses WHERE legal_name = 'Empresa Legal S.A.'),
    'Mi Pulperia',
    'Business created with correct brand_name'
);

SELECT is(
    (SELECT role FROM public.business_members WHERE user_id = '11111111-1111-4111-8111-111111111111'),
    'business_owner',
    'Creator assigned business_owner role'
);

SELECT is(
    (SELECT status FROM public.business_members WHERE user_id = '11111111-1111-4111-8111-111111111111'),
    'ACTIVE',
    'Business owner membership is ACTIVE'
);

SELECT is(
    (SELECT name FROM public.business_locations WHERE address_text = 'Calle Principal #123, Managua'),
    'Sucursal Central',
    'First branch created with correct name'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.business_member_locations bml
        JOIN public.business_members bm ON bm.id = bml.business_member_id
        WHERE bm.user_id = '11111111-1111-4111-8111-111111111111'
    ),
    'Business owner linked to first branch via N:M business_member_locations'
);

-- Idempotency check: duplicate call returns existing business
SELECT lives_ok(
    $$SELECT public.register_business_onboarding(
        'Empresa Legal S.A.',
        'Mi Pulperia',
        'J0310000000001',
        'Sucursal Central',
        'Calle Principal #123, Managua',
        12.136389,
        -86.251389
    )$$,
    'Idempotent call to register_business_onboarding returns gracefully'
);

-- 5. Driver Onboarding & Vehicle Registration Test (7 assertions)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-4222-8222-222222222222';
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

SELECT lives_ok(
    $$SELECT public.register_driver_onboarding(
        '001-010190-0001A',
        'LIC-98765432',
        'Yamaha',
        'FZ-S',
        2023,
        'Azul',
        'M-998877'
    )$$,
    'register_driver_onboarding executes without error'
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

SELECT is(
    (SELECT make FROM public.vehicles WHERE driver_id = '22222222-2222-4222-8222-222222222222'),
    'Yamaha',
    'Vehicle created with correct make'
);

SELECT is(
    (SELECT license_plate FROM public.vehicles WHERE driver_id = '22222222-2222-4222-8222-222222222222'),
    'M-998877',
    'Vehicle created with correct license_plate'
);

-- Idempotency check: duplicate call updates profile/vehicle and returns existing driver
SELECT lives_ok(
    $$SELECT public.register_driver_onboarding(
        '001-010190-0001A',
        'LIC-98765432',
        'Yamaha',
        'FZ-S',
        2023,
        'Negro',
        'M-998877'
    )$$,
    'Idempotent call to register_driver_onboarding completes gracefully'
);

-- 6. Document Submission Tests (4 assertions)
SELECT lives_ok(
    $$SELECT public.submit_driver_document('NATIONAL_ID', '22222222-2222-4222-8222-222222222222/national_id.pdf')$$,
    'submit_driver_document NATIONAL_ID succeeds'
);

SELECT lives_ok(
    $$SELECT public.submit_driver_document('DRIVER_LICENSE', '22222222-2222-4222-8222-222222222222/driver_license.pdf')$$,
    'submit_driver_document DRIVER_LICENSE succeeds'
);

SELECT is(
    (SELECT count(*) FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222'),
    2::bigint,
    'Driver has 2 documents submitted'
);

SELECT is(
    (SELECT verification_status FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND document_type = 'NATIONAL_ID'),
    'PENDING',
    'Submitted document status is PENDING'
);

-- 7. Verification Queue: Security Constraints & Role / MFA Checks (6 assertions)

-- 7.1 Operator cannot verify drivers (Role check)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '44444444-4444-4444-8444-444444444444';
SET LOCAL "request.jwt.claims" = '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated","aal":"aal2"}';

SELECT throws_ok(
    $$SELECT public.admin_verify_driver('22222222-2222-4222-8222-222222222222'::uuid, 'APPROVE')$$,
    'P0001',
    'AUTH_ADMIN_ROLE_REQUIRED: Operator role cannot verify or approve drivers',
    'Operator cannot verify drivers'
);

-- 7.2 Verification Agent without AAL2 MFA is rejected (MFA check)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal1"}';

SELECT throws_ok(
    $$SELECT public.admin_verify_driver('22222222-2222-4222-8222-222222222222'::uuid, 'APPROVE')$$,
    'P0001',
    'AUTH_MFA_REQUIRED: AAL2 multi-factor authentication is required for driver verification actions',
    'AAL1 session cannot verify drivers'
);

-- 7.3 Verification Agent rejects driver (Rejection flow)
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '33333333-3333-4333-8333-333333333333';
SET LOCAL "request.jwt.claims" = '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2"}';

SELECT lives_ok(
    $$SELECT public.admin_verify_driver('22222222-2222-4222-8222-222222222222'::uuid, 'REJECT', 'Cedula ilegible')$$,
    'Verification Agent can reject driver with AAL2'
);

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'REJECTED',
    'Driver status changed to REJECTED'
);

SELECT is(
    (SELECT account_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'REGISTERED',
    'Driver account_status remains REGISTERED on rejection'
);

SELECT is(
    (SELECT rejection_reason FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' LIMIT 1),
    'Cedula ilegible',
    'Driver documents updated with rejection reason'
);

-- 8. Re-upload and Final Approval Flow (7 assertions)

-- Driver re-submits document -> transitions back to PENDING
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-4222-8222-222222222222';
SET LOCAL "request.jwt.claims" = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

SELECT lives_ok(
    $$SELECT public.submit_driver_document('NATIONAL_ID', '22222222-2222-4222-8222-222222222222/national_id_v2.pdf')$$,
    'Driver can re-upload document after rejection'
);

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'PENDING',
    'Driver verification_status automatically reset to PENDING after re-upload'
);

-- Admin Approves Driver
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '55555555-5555-4555-8555-555555555555';
SET LOCAL "request.jwt.claims" = '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated","aal":"aal2"}';

SELECT lives_ok(
    $$SELECT public.admin_verify_driver('22222222-2222-4222-8222-222222222222'::uuid, 'APPROVE')$$,
    'Admin approves driver with AAL2'
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

SELECT is(
    (SELECT operational_state FROM public.driver_presence WHERE driver_id = '22222222-2222-4222-8222-222222222222'),
    'OFFLINE',
    'Approved driver operational_state remains OFFLINE'
);

-- Audit log verification
SELECT ok(
    EXISTS (
        SELECT 1 FROM public.audit_logs 
        WHERE entity_id = '22222222-2222-4222-8222-222222222222' 
          AND action = 'VERIFY_DRIVER' 
          AND entity_type = 'driver'
    ),
    'Audit log created for driver verification'
);

SELECT * FROM finish();
ROLLBACK;
