BEGIN;
SELECT plan(6);

-- 1. Verify authenticated user identity context
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';

SELECT is(auth.uid(), '11111111-1111-1111-1111-111111111111'::uuid, 'auth.uid() properly set for authenticated user A');

-- 2. User A can read own profile
SELECT results_eq(
  'SELECT id FROM public.profiles WHERE id = ''11111111-1111-1111-1111-111111111111''',
  ARRAY['11111111-1111-1111-1111-111111111111'::uuid],
  'User A can read own profile'
);

-- 3. User A is denied reading User B profile
SELECT is_empty(
  'SELECT id FROM public.profiles WHERE id = ''22222222-2222-2222-2222-222222222222''',
  'User A denied reading User B profile'
);

-- 4. User A cannot escalate platform_role to super_admin or admin
SELECT throws_ok(
  'UPDATE public.profiles SET platform_role = ''super_admin'' WHERE id = ''11111111-1111-1111-1111-111111111111''',
  '42501',
  NULL,
  'User A update on platform_role denied with 42501'
);

-- 5. User A cannot update driver verification_status
SELECT throws_ok(
  'UPDATE public.drivers SET verification_status = ''VERIFIED'' WHERE id = ''44444444-4444-4444-4444-444444444444''',
  '42501',
  NULL,
  'User A update on driver verification_status denied with 42501'
);

-- 6. User A cannot update business account_status
SELECT throws_ok(
  'UPDATE public.businesses SET account_status = ''ACTIVE'' WHERE id = ''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''',
  '42501',
  NULL,
  'User A update on business account_status denied with 42501'
);

SELECT * FROM finish();
ROLLBACK;
