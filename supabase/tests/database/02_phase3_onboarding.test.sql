BEGIN;
SELECT plan(35);

-- 1. Tables & Storage Verification (4 assertions)
SELECT has_table('public', 'audit_logs', 'Table audit_logs exists');
SELECT is(
  (SELECT c.relrowsecurity FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'audit_logs'),
  true,
  'RLS enabled on audit_logs'
);
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'driver-documents'),
  false,
  'Storage bucket driver-documents is private'
);
SELECT ok(
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'driver-documents'),
  'Storage bucket driver-documents exists'
);

-- 2. Functions Existence (4 assertions)
SELECT has_function('public', 'register_business_onboarding', ARRAY['text', 'text', 'text', 'text', 'text', 'double precision', 'double precision', 'text'], 'Function register_business_onboarding exists');
SELECT has_function('public', 'register_driver_onboarding', ARRAY['text', 'text', 'text', 'text', 'integer', 'text', 'text'], 'Function register_driver_onboarding exists');
SELECT has_function('public', 'submit_driver_document', ARRAY['text', 'text'], 'Function submit_driver_document exists');
SELECT has_function('public', 'admin_verify_driver', ARRAY['uuid', 'text', 'text'], 'Function admin_verify_driver exists');

-- 3. Setup Test Mock Identities
DO $$
DECLARE
    v_b_user UUID := '11111111-1111-4111-8111-111111111111';
    v_d_user UUID := '22222222-2222-4222-8222-222222222222';
    v_agent  UUID := '33333333-3333-4333-8333-333333333333';
    v_oper   UUID := '44444444-4444-4444-8444-444444444444';
    v_admin  UUID := '55555555-5555-4555-8555-555555555555';
BEGIN
    -- Create auth users
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES 
        (v_b_user, 'bizowner@test.com', '{"full_name":"Biz Owner"}'::jsonb),
        (v_d_user, 'driver@test.com', '{"full_name":"Test Driver"}'::jsonb),
        (v_agent, 'agent@test.com', '{"full_name":"Verification Agent"}'::jsonb),
        (v_oper, 'oper@test.com', '{"full_name":"Operator"}'::jsonb),
        (v_admin, 'admin@test.com', '{"full_name":"Admin User"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    -- Update platform roles
    UPDATE public.profiles SET platform_role = 'verification_agent' WHERE id = v_agent;
    UPDATE public.profiles SET platform_role = 'operator' WHERE id = v_oper;
    UPDATE public.profiles SET platform_role = 'admin' WHERE id = v_admin;
END;
$$;

-- 4. Business Onboarding Test (7 assertions)
DO $$
DECLARE
    v_b_user UUID := '11111111-1111-4111-8111-111111111111';
    v_res JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_b_user::text, true);
    PERFORM set_config('role', 'authenticated', true);

    v_res := public.register_business_onboarding(
        'Empresa Legal S.A.',
        'Mi Pulperia',
        'J0310000000001',
        'Sucursal Central',
        'Calle Principal #123, Managua',
        12.136389,
        -86.251389,
        'Tocar timbre en recepcion'
    );
END;
$$;

SELECT is(
    (SELECT count(*)::int FROM public.businesses WHERE tax_id = 'J0310000000001' AND verification_status = 'NOT_REQUIRED' AND account_status = 'ACTIVE'),
    1,
    'Business created with NOT_REQUIRED and ACTIVE'
);
SELECT is(
    (SELECT role FROM public.business_members WHERE user_id = '11111111-1111-4111-8111-111111111111' AND status = 'ACTIVE'),
    'business_owner',
    'Business member created as business_owner and ACTIVE'
);
SELECT is(
    (SELECT count(*)::int FROM public.business_locations WHERE name = 'Sucursal Central' AND is_active = true),
    1,
    'Initial required business_location created and active'
);
SELECT is(
    (SELECT count(*)::int FROM public.business_member_locations bml
     JOIN public.business_members bm ON bm.id = bml.business_member_id
     WHERE bm.user_id = '11111111-1111-4111-8111-111111111111'),
    1,
    'Business owner associated to initial branch in business_member_locations'
);

-- Duplicate Business Registration tests
SELECT throws_ok(
    $$
    SELECT public.register_business_onboarding(
        'Otra Empresa',
        'Otra Marca',
        'J0310000000002',
        'Sucursal 2',
        'Direccion 2',
        12.1,
        -86.2
    );
    $$,
    'ALREADY_REGISTERED: User is already an active member of a business',
    'Duplicate onboarding for same user rejected'
);

-- Reset jwt for tax_id collision test with fresh user
DO $$
DECLARE
    v_fresh_user UUID := '99999999-9999-4999-8999-999999999999';
BEGIN
    INSERT INTO auth.users (id, email) VALUES (v_fresh_user, 'fresh@test.com') ON CONFLICT (id) DO NOTHING;
    PERFORM set_config('request.jwt.claim.sub', v_fresh_user::text, true);
END;
$$;

SELECT throws_ok(
    $$
    SELECT public.register_business_onboarding(
        'Empresa Duplicada',
        'Marca Duplicada',
        'J0310000000001',
        'Sucursal D',
        'Direccion D',
        12.1,
        -86.2
    );
    $$,
    'TAX_ID_EXISTS: A business with this tax_id is already registered',
    'Duplicate tax_id rejected'
);

SELECT throws_ok(
    $$
    SELECT public.register_business_onboarding(
        'Empresa Mala',
        'Marca',
        'J0310000000003',
        'Sucursal',
        'Direccion',
        95.0, -- invalid lat
        -86.2
    );
    $$,
    'INVALID_ARGUMENT: branch_latitude must be between -90 and 90',
    'Invalid latitude rejected'
);

-- 5. Driver Onboarding Test (6 assertions)
DO $$
DECLARE
    v_d_user UUID := '22222222-2222-4222-8222-222222222222';
    v_res JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_d_user::text, true);
    PERFORM set_config('role', 'authenticated', true);

    v_res := public.register_driver_onboarding(
        '001-010190-0001A',
        'LIC-987654321',
        'Yamaha',
        'FZ-S',
        2022,
        'Negro',
        'M-123456'
    );
END;
$$;

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'PENDING',
    'Driver registered with verification_status = PENDING'
);
SELECT is(
    (SELECT account_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'REGISTERED',
    'Driver registered with account_status = REGISTERED'
);
SELECT is(
    (SELECT operational_state FROM public.driver_presence WHERE driver_id = '22222222-2222-4222-8222-222222222222'),
    'OFFLINE',
    'Driver presence initialized with operational_state = OFFLINE'
);
SELECT is(
    (SELECT license_plate FROM public.vehicles WHERE driver_id = '22222222-2222-4222-8222-222222222222'),
    'M-123456',
    'Initial vehicle created for driver'
);

SELECT throws_ok(
    $$
    SELECT public.register_driver_onboarding(
        '001-010190-0002B',
        'LIC-987654322',
        'Honda',
        'CB125',
        2021,
        'Rojo',
        'M-654321'
    );
    $$,
    'ALREADY_REGISTERED: User is already registered as a driver',
    'Duplicate driver registration rejected'
);

-- 6. Document Submission Test (3 assertions)
DO $$
DECLARE
    v_d_user UUID := '22222222-2222-4222-8222-222222222222';
    v_res JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_d_user::text, true);
    PERFORM set_config('role', 'authenticated', true);

    v_res := public.submit_driver_document(
        'NATIONAL_ID',
        '22222222-2222-4222-8222-222222222222/cedula_frente.jpg'
    );
    v_res := public.submit_driver_document(
        'DRIVER_LICENSE',
        '22222222-2222-4222-8222-222222222222/licencia.jpg'
    );
END;
$$;

SELECT is(
    (SELECT count(*)::int FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND verification_status = 'PENDING'),
    2,
    'Driver documents submitted with verification_status = PENDING'
);

SELECT throws_ok(
    $$
    SELECT public.submit_driver_document(
        'INVALID_TYPE',
        'path/file.jpg'
    );
    $$,
    'INVALID_ARGUMENT: Invalid document_type',
    'Invalid document type rejected'
);

-- 7. Admin Verification Queue Security & Logic Tests (11 assertions)
-- 7.1 Operator cannot verify (even with AAL2)
DO $$
DECLARE
    v_oper UUID := '44444444-4444-4444-8444-444444444444';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_oper::text, true);
    PERFORM set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-8444-444444444444", "aal":"aal2"}'::text, true);
    PERFORM set_config('role', 'authenticated', true);
END;
$$;

SELECT throws_ok(
    $$
    SELECT public.admin_verify_driver('22222222-2222-4222-8222-222222222222', 'APPROVE');
    $$,
    'AUTH_ADMIN_ROLE_REQUIRED: Only verification_agent, admin or super_admin can verify drivers',
    'Operator cannot approve driver'
);

-- 7.2 Verification Agent with AAL1 fails MFA requirement
DO $$
DECLARE
    v_agent UUID := '33333333-3333-4333-8333-333333333333';
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_agent::text, true);
    PERFORM set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333", "aal":"aal1"}'::text, true);
    PERFORM set_config('role', 'authenticated', true);
END;
$$;

SELECT throws_ok(
    $$
    SELECT public.admin_verify_driver('22222222-2222-4222-8222-222222222222', 'APPROVE');
    $$,
    'AUTH_MFA_REQUIRED: AAL2 MFA is required for administrative verification',
    'Verification Agent without AAL2 fails MFA gate'
);

-- 7.3 Verification Agent with AAL2 Rejects Driver
DO $$
DECLARE
    v_agent UUID := '33333333-3333-4333-8333-333333333333';
    v_res JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_agent::text, true);
    PERFORM set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333", "aal":"aal2"}'::text, true);
    PERFORM set_config('role', 'authenticated', true);

    v_res := public.admin_verify_driver(
        '22222222-2222-4222-8222-222222222222',
        'REJECT',
        'La foto de la cedula es ilegible'
    );
END;
$$;

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'REJECTED',
    'Driver verification_status updated to REJECTED'
);
SELECT is(
    (SELECT account_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'REGISTERED',
    'Driver account_status remains REGISTERED on rejection'
);
SELECT is(
    (SELECT rejection_reason FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND document_type = 'NATIONAL_ID'),
    'La foto de la cedula es ilegible',
    'Document rejection_reason recorded'
);
SELECT is(
    (SELECT count(*)::int FROM public.audit_logs WHERE action = 'DRIVER_VERIFICATION_REJECTED' AND entity_id = '22222222-2222-4222-8222-222222222222'),
    1,
    'Audit log created for rejection'
);

-- 7.4 Driver Re-uploads document -> status transitions back to PENDING
DO $$
DECLARE
    v_d_user UUID := '22222222-2222-4222-8222-222222222222';
    v_res JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_d_user::text, true);
    PERFORM set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222"}'::text, true);
    PERFORM set_config('role', 'authenticated', true);

    v_res := public.submit_driver_document(
        'NATIONAL_ID',
        '22222222-2222-4222-8222-222222222222/cedula_nueva_clara.jpg'
    );
END;
$$;

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'PENDING',
    'Driver verification_status returned to PENDING after re-uploading document'
);

-- 7.5 Admin Approves Driver with AAL2
DO $$
DECLARE
    v_admin UUID := '55555555-5555-4555-8555-555555555555';
    v_res JSONB;
BEGIN
    PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
    PERFORM set_config('request.jwt.claims', '{"sub":"55555555-5555-4555-8555-555555555555", "aal":"aal2"}'::text, true);
    PERFORM set_config('role', 'authenticated', true);

    v_res := public.admin_verify_driver(
        '22222222-2222-4222-8222-222222222222',
        'APPROVE'
    );
END;
$$;

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'VERIFIED',
    'Driver verification_status updated to VERIFIED'
);
SELECT is(
    (SELECT account_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'ACTIVE',
    'Driver account_status updated to ACTIVE'
);
SELECT is(
    (SELECT operational_state FROM public.driver_presence WHERE driver_id = '22222222-2222-4222-8222-222222222222'),
    'OFFLINE',
    'Driver presence remains OFFLINE upon verification'
);
SELECT is(
    (SELECT count(*)::int FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND verification_status = 'VERIFIED'),
    2,
    'All driver documents updated to VERIFIED'
);
SELECT is(
    (SELECT count(*)::int FROM public.audit_logs WHERE action = 'DRIVER_VERIFICATION_APPROVED' AND entity_id = '22222222-2222-4222-8222-222222222222'),
    1,
    'Audit log created for approval'
);

SELECT * FROM finish();
ROLLBACK;
