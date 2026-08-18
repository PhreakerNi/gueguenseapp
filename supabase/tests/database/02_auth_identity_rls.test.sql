BEGIN;
SELECT plan(10);

-- Setup test users
INSERT INTO auth.users (id, email)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'user_a@test.com'),
  ('00000000-0000-0000-0000-000000000002', 'user_b@test.com')
ON CONFLICT (id) DO NOTHING;

-- 1. Verify profile auto-creation trigger for user_a and user_b (2 assertions)
SELECT is(
  (SELECT platform_role FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'),
  'none'::public.platform_role,
  'User A profile auto-created with default platform_role none'
);

SELECT is(
  (SELECT platform_role FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002'),
  'none'::public.platform_role,
  'User B profile auto-created with default platform_role none'
);

-- Set authenticated session as User A
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

-- 2. User A can read their own profile (1 assertion)
SELECT is(
  (SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'),
  1,
  'User A can read own profile'
);

-- 3. User A cannot read User B profile (1 assertion)
SELECT is(
  (SELECT count(*)::integer FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000002'),
  0,
  'User A cannot read User B profile'
);

-- 4. User A cannot update their own platform_role (privilege escalation protection) (2 assertions)
PREPARE escalate_role AS
  UPDATE public.profiles
  SET platform_role = 'super_admin'
  WHERE id = '00000000-0000-0000-0000-000000000001';

-- Attempting update: RLS policy only allows updating safe fields or denies platform_role update
SELECT throws_matching(
  'escalate_role',
  '42501|violates row-level security policy|permission denied',
  'User A cannot escalate platform_role to super_admin'
);

SELECT is(
  (SELECT platform_role FROM public.profiles WHERE id = '00000000-0000-0000-0000-000000000001'),
  'none'::public.platform_role,
  'User A platform_role remains none after attempted escalation'
);

-- 5. User A cannot create or update drivers verification status (2 assertions)
PREPARE update_driver_status AS
  UPDATE public.drivers
  SET verification_status = 'VERIFIED'
  WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT throws_matching(
  'update_driver_status',
  '42501|violates row-level security policy|permission denied',
  'User A cannot self-verify driver verification_status'
);

-- 6. User A cannot create or update business account_status (2 assertions)
PREPARE update_business_status AS
  UPDATE public.businesses
  SET account_status = 'ACTIVE'
  WHERE id = '00000000-0000-0000-0000-000000000001';

SELECT throws_matching(
  'update_business_status',
  '42501|violates row-level security policy|permission denied',
  'User A cannot update business account_status without admin'
);

SELECT is(
  (SELECT count(*)::integer FROM public.drivers WHERE verification_status = 'VERIFIED' AND id = '00000000-0000-0000-0000-000000000001'),
  0,
  'Driver verification_status cannot be self-escalated'
);

SELECT is(
  (SELECT count(*)::integer FROM public.businesses WHERE account_status = 'ACTIVE' AND id = '00000000-0000-0000-0000-000000000001'),
  0,
  'Business account_status cannot be self-escalated'
);

SELECT * FROM finish();
ROLLBACK;
