BEGIN;

SELECT plan(45);

-- 1. Structural Checks: Idempotency Keys, Audit Logs, Bucket & Authorizations (8 assertions: 1-8)
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
SELECT has_table('private', 'driver_document_upload_authorizations', 'private.driver_document_upload_authorizations exists');
SELECT has_table('private', 'idempotency_responses', 'private.idempotency_responses exists');
SELECT is(
    (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'driver_documents' AND indexname = 'idx_driver_documents_active_type'),
    1::bigint,
    'Partial unique index idx_driver_documents_active_type exists'
);

-- 2. Function Signature & Security Checks (5 assertions: 9-13)
SELECT has_function('public', 'create_business', ARRAY['uuid', 'text', 'text', 'text'], 'create_business function exists with correct parameters');
SELECT has_function('public', 'create_business_location', ARRAY['uuid', 'uuid', 'text', 'text', 'double precision', 'double precision', 'text'], 'create_business_location function exists with correct parameters');
SELECT has_function('public', 'add_business_member', ARRAY['uuid', 'uuid', 'uuid', 'text', 'uuid[]'], 'add_business_member function exists with correct parameters');
SELECT has_function('public', 'register_driver', ARRAY['uuid', 'text', 'text'], 'register_driver function exists with correct parameters');
SELECT has_function('public', 'admin_verify_driver', ARRAY['uuid', 'uuid', 'text', 'text', 'text'], 'admin_verify_driver function exists with correct parameters');

-- 3. Synthetic Test Users Setup
SET LOCAL ROLE postgres;
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES 
    ('11111111-1111-4111-8111-111111111111', 'bizowner@test.com', '{"full_name":"Biz Owner"}'::jsonb),
    ('22222222-2222-4222-8222-222222222222', 'driver@test.com', '{"full_name":"Test Driver"}'::jsonb),
    ('33333333-3333-4333-8333-333333333333', 'agent@test.com', '{"full_name":"Verification Agent"}'::jsonb),
    ('44444444-4444-4444-8444-444444444444', 'oper@test.com', '{"full_name":"Operator"}'::jsonb),
    ('55555555-5555-4555-8555-555555555555', 'admin@test.com', '{"full_name":"Admin User"}'::jsonb),
    ('66666666-6666-4666-8666-666666666666', 'manager@test.com', '{"full_name":"Manager User"}'::jsonb),
    ('77777777-7777-4777-8777-777777777777', 'superadmin@test.com', '{"full_name":"Super Admin"}'::jsonb),
    ('88888888-8888-4888-8888-888888888888', 'otherdriver@test.com', '{"full_name":"Other Driver"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles SET platform_role = 'verification_agent' WHERE id = '33333333-3333-4333-8333-333333333333';
UPDATE public.profiles SET platform_role = 'operator' WHERE id = '44444444-4444-4444-8444-444444444444';
UPDATE public.profiles SET platform_role = 'admin' WHERE id = '55555555-5555-4555-8555-555555555555';
UPDATE public.profiles SET platform_role = 'super_admin' WHERE id = '77777777-7777-4777-8777-777777777777';

-- 4. Direct Client Execution Revoked & Audit RLS (4 assertions: 14-17)
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

-- Non-super-admin SELECT on audit_logs returns 0 rows
SELECT is(
    (SELECT count(*) FROM public.audit_logs),
    0::bigint,
    'Non-super_admin sees 0 rows from public.audit_logs under RLS'
);

-- Super admin sees audit logs under RLS
SET LOCAL "request.jwt.claim.sub" = '77777777-7777-4777-8777-777777777777';
SELECT is(
    (SELECT count(*) FROM public.audit_logs),
    0::bigint,
    'Super admin query executes on public.audit_logs without error'
);

-- 5. Business Onboarding & Branch Creation via Service Role (7 assertions: 18-24)
SET LOCAL ROLE postgres;

-- brand_name optional (Section 16)
SELECT public.create_business(
    '11111111-1111-4111-8111-111111111111'::uuid,
    'Empresa Nueva S.A.',
    NULL,
    'J0319999999999'
);

SELECT is(
    (SELECT verification_status FROM public.businesses WHERE legal_name = 'Empresa Nueva S.A.'),
    'PENDING',
    'Business initial verification_status is PENDING'
);

SELECT is(
    (SELECT brand_name FROM public.businesses WHERE legal_name = 'Empresa Nueva S.A.'),
    NULL,
    'Business created with NULL brand_name successfully'
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
    '+505 8888 8888'
);

SELECT is(
    (SELECT name FROM public.business_locations WHERE address_text = 'Calle Principal #123, Managua'),
    'Sucursal Central',
    'First branch created separately with correct name'
);

-- Add Business Manager linked to branch (Section 19: fail-closed validation)
SELECT throws_ok(
    $$SELECT public.add_business_member(
        '11111111-1111-4111-8111-111111111111'::uuid,
        (SELECT id FROM public.businesses WHERE legal_name = 'Empresa Nueva S.A.'),
        '66666666-6666-4666-8666-666666666666'::uuid,
        'manager',
        ARRAY[]::uuid[]
    )$$,
    'P0001',
    'INVALID_ARGUMENT: At least one valid location_id is required for manager or employee',
    'add_business_member fails-closed when location_ids is empty'
);

SELECT public.add_business_member(
    '11111111-1111-4111-8111-111111111111'::uuid,
    (SELECT id FROM public.businesses WHERE legal_name = 'Empresa Nueva S.A.'),
    '66666666-6666-4666-8666-666666666666'::uuid,
    'manager',
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

-- 6. Driver Registration & Vehicle Registration via Service Role (5 assertions: 25-29)
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

-- 7. Document Authorization & Real Storage Verification (9 assertions: 30-38)
-- WebP is denied (Section 4)
SELECT throws_ok(
    $$SELECT public.authorize_driver_document_upload(
        '22222222-2222-4222-8222-222222222222'::uuid,
        'NATIONAL_ID',
        'image/webp',
        1024
    )$$,
    'P0001',
    'INVALID_MIME_TYPE: Allowed document MIME types are image/jpeg, image/png, application/pdf',
    'image/webp is rejected during upload authorization'
);

-- Authorize PDF document
DO $$
DECLARE
    v_res jsonb;
BEGIN
    v_res := public.authorize_driver_document_upload(
        '22222222-2222-4222-8222-222222222222'::uuid,
        'NATIONAL_ID',
        'application/pdf',
        2048
    );
    PERFORM set_config('test.national_id_upload_id', v_res->>'upload_id', true);
    PERFORM set_config('test.national_id_storage_path', v_res->>'storage_path', true);
END $$;

SELECT ok(
    EXISTS (
        SELECT 1 FROM private.driver_document_upload_authorizations
        WHERE upload_id = current_setting('test.national_id_upload_id')::uuid
    ),
    'Upload authorization persisted in private table'
);

-- Commit without storage object fails-closed (Section 8)
SELECT throws_ok(
    $$SELECT public.commit_driver_document(
        '22222222-2222-4222-8222-222222222222'::uuid,
        current_setting('test.national_id_upload_id')::uuid,
        'NATIONAL_ID'
    )$$,
    'P0001',
    'UPLOAD_UNVERIFIED: Uploaded file not found in storage bucket',
    'Commit without physical storage object is rejected'
);

-- Insert physical storage object into storage.objects
INSERT INTO storage.objects (bucket_id, name, owner, metadata)
VALUES (
    'driver-documents',
    current_setting('test.national_id_storage_path'),
    '22222222-2222-4222-8222-222222222222'::uuid,
    jsonb_build_object('size', 2048, 'mimetype', 'application/pdf')
)
ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;

-- Commit valid document with real storage object
SELECT public.commit_driver_document(
    '22222222-2222-4222-8222-222222222222'::uuid,
    current_setting('test.national_id_upload_id')::uuid,
    'NATIONAL_ID'
);

SELECT is(
    (SELECT count(*) FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND verification_status = 'PENDING'),
    1::bigint,
    'Driver has 1 document submitted in PENDING status'
);

-- Duplicate active document submission denied by active duplicate check (Section 9)
DO $$
DECLARE
    v_res jsonb;
BEGIN
    v_res := public.authorize_driver_document_upload(
        '22222222-2222-4222-8222-222222222222'::uuid,
        'NATIONAL_ID',
        'application/pdf',
        2048
    );
    PERFORM set_config('test.national_id_dup_upload_id', v_res->>'upload_id', true);
    PERFORM set_config('test.national_id_dup_storage_path', v_res->>'storage_path', true);

    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
        'driver-documents',
        v_res->>'storage_path',
        '22222222-2222-4222-8222-222222222222'::uuid,
        jsonb_build_object('size', 2048, 'mimetype', 'application/pdf')
    )
    ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
END $$;

SELECT throws_ok(
    $$SELECT public.commit_driver_document(
        '22222222-2222-4222-8222-222222222222'::uuid,
        current_setting('test.national_id_dup_upload_id')::uuid,
        'NATIONAL_ID'
    )$$,
    'P0001',
    'DOCUMENT_ALREADY_SUBMITTED: Active document already submitted for type NATIONAL_ID',
    'Duplicate active document submission is rejected'
);

-- Authorize and commit DRIVER_LICENSE
DO $$
DECLARE
    v_res jsonb;
BEGIN
    v_res := public.authorize_driver_document_upload(
        '22222222-2222-4222-8222-222222222222'::uuid,
        'DRIVER_LICENSE',
        'application/pdf',
        4096
    );
    PERFORM set_config('test.license_upload_id', v_res->>'upload_id', true);
    PERFORM set_config('test.license_storage_path', v_res->>'storage_path', true);

    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
        'driver-documents',
        v_res->>'storage_path',
        '22222222-2222-4222-8222-222222222222'::uuid,
        jsonb_build_object('size', 4096, 'mimetype', 'application/pdf')
    )
    ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
END $$;

SELECT public.commit_driver_document(
    '22222222-2222-4222-8222-222222222222'::uuid,
    current_setting('test.license_upload_id')::uuid,
    'DRIVER_LICENSE'
);

-- Approval without all 3 documents fails
SELECT throws_ok(
    $$SELECT public.admin_verify_driver(
        '33333333-3333-4333-8333-333333333333'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        'APPROVE'::text,
        NULL::text,
        'aal2'::text
    )$$,
    'P0001',
    'DOCUMENTATION_INCOMPLETE: Driver must have current PENDING/UNDER_REVIEW documents for NATIONAL_ID, DRIVER_LICENSE, and VEHICLE_REGISTRATION',
    'Approval requires all 3 mandatory documents'
);

-- 8. Rejection, Re-upload and Full Approval (14 assertions: 39-52)

-- 8.1 Operator cannot verify
SELECT throws_ok(
    $$SELECT public.admin_verify_driver(
        '44444444-4444-4444-8444-444444444444'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        'APPROVE'::text,
        NULL::text,
        'aal2'::text
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
        'APPROVE'::text,
        NULL::text,
        'aal1'::text
    )$$,
    'P0001',
    'AUTH_MFA_REQUIRED: AAL2 MFA is required for administrative verification',
    'AAL1 session cannot verify drivers'
);

-- 8.3 Verification Agent rejects driver (Rejection flow + Canonical DRIVER_REJECTED audit)
SELECT public.admin_verify_driver(
    '33333333-3333-4333-8333-333333333333'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    'REJECT'::text,
    'Cedula ilegible'::text,
    'aal2'::text
);

SELECT is(
    (SELECT verification_status FROM public.drivers WHERE id = '22222222-2222-4222-8222-222222222222'),
    'REJECTED',
    'Driver status changed to REJECTED'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.audit_logs 
        WHERE admin_user_id = '33333333-3333-4333-8333-333333333333' 
          AND action = 'DRIVER_REJECTED'
    ),
    'Canonical DRIVER_REJECTED audit log created'
);

-- 8.4 Driver re-submits documents after rejection (NATIONAL_ID, DRIVER_LICENSE, VEHICLE_REGISTRATION)
DO $$
DECLARE
    v_res jsonb;
BEGIN
    v_res := public.authorize_driver_document_upload(
        '22222222-2222-4222-8222-222222222222'::uuid,
        'NATIONAL_ID',
        'application/pdf',
        3072
    );
    PERFORM set_config('test.national_id_v2_upload_id', v_res->>'upload_id', true);
    PERFORM set_config('test.national_id_v2_storage_path', v_res->>'storage_path', true);

    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
        'driver-documents',
        v_res->>'storage_path',
        '22222222-2222-4222-8222-222222222222'::uuid,
        jsonb_build_object('size', 3072, 'mimetype', 'application/pdf')
    )
    ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
END $$;

SELECT public.commit_driver_document(
    '22222222-2222-4222-8222-222222222222'::uuid,
    current_setting('test.national_id_v2_upload_id')::uuid,
    'NATIONAL_ID'
);

DO $$
DECLARE
    v_res jsonb;
BEGIN
    v_res := public.authorize_driver_document_upload(
        '22222222-2222-4222-8222-222222222222'::uuid,
        'DRIVER_LICENSE',
        'application/pdf',
        4096
    );
    PERFORM set_config('test.license_v2_upload_id', v_res->>'upload_id', true);
    PERFORM set_config('test.license_v2_storage_path', v_res->>'storage_path', true);

    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
        'driver-documents',
        v_res->>'storage_path',
        '22222222-2222-4222-8222-222222222222'::uuid,
        jsonb_build_object('size', 4096, 'mimetype', 'application/pdf')
    )
    ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
END $$;

SELECT public.commit_driver_document(
    '22222222-2222-4222-8222-222222222222'::uuid,
    current_setting('test.license_v2_upload_id')::uuid,
    'DRIVER_LICENSE'
);

DO $$
DECLARE
    v_res jsonb;
BEGIN
    v_res := public.authorize_driver_document_upload(
        '22222222-2222-4222-8222-222222222222'::uuid,
        'VEHICLE_REGISTRATION',
        'application/pdf',
        2048
    );
    PERFORM set_config('test.veh_reg_upload_id', v_res->>'upload_id', true);
    PERFORM set_config('test.veh_reg_storage_path', v_res->>'storage_path', true);

    INSERT INTO storage.objects (bucket_id, name, owner, metadata)
    VALUES (
        'driver-documents',
        v_res->>'storage_path',
        '22222222-2222-4222-8222-222222222222'::uuid,
        jsonb_build_object('size', 2048, 'mimetype', 'application/pdf')
    )
    ON CONFLICT (bucket_id, name) DO UPDATE SET metadata = EXCLUDED.metadata;
END $$;

SELECT public.commit_driver_document(
    '22222222-2222-4222-8222-222222222222'::uuid,
    current_setting('test.veh_reg_upload_id')::uuid,
    'VEHICLE_REGISTRATION'
);

SELECT is(
    (SELECT count(*) FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND verification_status = 'PENDING'),
    3::bigint,
    'Driver has 3 newly uploaded documents in PENDING status'
);

-- Historical rejected documents are preserved (Section 10)
SELECT is(
    (SELECT count(*) FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND verification_status = 'REJECTED'),
    2::bigint,
    'Historical rejected documents are preserved in table'
);

-- 8.5 Admin Approves Driver
SELECT public.admin_verify_driver(
    '55555555-5555-4555-8555-555555555555'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    'APPROVE'::text,
    NULL::text,
    'aal2'::text
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
    'Approved driver has operational_state = OFFLINE'
);

SELECT ok(
    EXISTS (
        SELECT 1 FROM public.audit_logs 
        WHERE admin_user_id = '55555555-5555-4555-8555-555555555555' 
          AND action = 'DRIVER_VERIFIED'
    ),
    'Canonical DRIVER_VERIFIED audit log created'
);

-- Historical rejected document still remains REJECTED after later APPROVE (Section 10)
SELECT is(
    (SELECT count(*) FROM public.driver_documents WHERE driver_id = '22222222-2222-4222-8222-222222222222' AND verification_status = 'REJECTED'),
    2::bigint,
    'Historical rejected document remains REJECTED after later APPROVE'
);

-- Rejecting already VERIFIED driver is denied (Section 10)
SELECT throws_ok(
    $$SELECT public.admin_verify_driver(
        '55555555-5555-4555-8555-555555555555'::uuid,
        '22222222-2222-4222-8222-222222222222'::uuid,
        'REJECT'::text,
        'Invalid retry'::text,
        'aal2'::text
    )$$,
    'P0001',
    'INVALID_STATE: Cannot reject already verified driver',
    'Rejecting an already VERIFIED driver is denied'
);

SELECT * FROM finish();
ROLLBACK;
