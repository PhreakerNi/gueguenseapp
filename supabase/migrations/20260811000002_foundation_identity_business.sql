-- Migration 2: Identity & Business Foundation Tables + Non-Recursive RLS + Private Helpers

-- 1. Profiles (1:1 with auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    platform_role TEXT NOT NULL DEFAULT 'none' CHECK (platform_role IN ('super_admin', 'admin', 'operator', 'verification_agent', 'none')),
    full_name TEXT,
    avatar_url TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_platform_role ON public.profiles(platform_role);

-- Trigger: Auto-create profile on user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Businesses
CREATE TABLE public.businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    legal_name TEXT,
    brand_name TEXT,
    tax_id TEXT UNIQUE,
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('NOT_REQUIRED', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED')),
    account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (account_status IN ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_businesses_verification_status ON public.businesses(verification_status);
CREATE INDEX idx_businesses_account_status ON public.businesses(account_status);

-- 3. Business Members
CREATE TABLE public.business_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'business_employee' CHECK (role IN ('business_owner', 'business_manager', 'business_employee')),
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INVITED', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT business_members_business_user_unique UNIQUE (business_id, user_id)
);

CREATE INDEX idx_business_members_business_id ON public.business_members(business_id);
CREATE INDEX idx_business_members_user_id ON public.business_members(user_id);

-- 4. Business Locations
CREATE TABLE public.business_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address_text TEXT NOT NULL,
    location extensions.geography(POINT, 4326) NOT NULL,
    pickup_instructions TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_locations_business_id ON public.business_locations(business_id);
CREATE INDEX idx_business_locations_geo ON public.business_locations USING GIST(location);

-- 5. Business Member Locations (Scope N:M)
CREATE TABLE public.business_member_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_member_id UUID NOT NULL REFERENCES public.business_members(id) ON DELETE CASCADE,
    business_location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bml_member_location_unique UNIQUE(business_member_id, business_location_id)
);

CREATE INDEX idx_bml_member_id ON public.business_member_locations(business_member_id);
CREATE INDEX idx_bml_location_id ON public.business_member_locations(business_location_id);

-- Private Security Helpers (Avoids RLS recursion)
CREATE OR REPLACE FUNCTION private.is_active_business_member(p_business_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.business_members bm
        WHERE bm.business_id = p_business_id
          AND bm.user_id = auth.uid()
          AND bm.status = 'ACTIVE'
    );
$$;

REVOKE EXECUTE ON FUNCTION private.is_active_business_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.is_active_business_member(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION private.is_active_business_member(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION private.can_access_business_location(p_location_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.business_locations bl
        JOIN public.business_members bm ON bm.business_id = bl.business_id
        LEFT JOIN public.business_member_locations bml ON bml.business_member_id = bm.id
        WHERE bl.id = p_location_id
          AND bm.user_id = auth.uid()
          AND bm.status = 'ACTIVE'
          AND (bm.role = 'business_owner' OR bml.business_location_id = p_location_id)
    );
$$;

REVOKE EXECUTE ON FUNCTION private.can_access_business_location(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.can_access_business_location(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION private.can_access_business_location(UUID) TO authenticated;

-- Enable RLS (Deny by default)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_member_locations ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Profiles
CREATE POLICY "Users can read own profile"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Note: UPDATE direct from client on public.profiles is DENIED in Phase 1 to prevent platform_role privilege escalation.

-- RLS Policies: Businesses (Tenancy restricted via helper)
CREATE POLICY "Active business members can view business"
    ON public.businesses FOR SELECT
    TO authenticated
    USING (private.is_active_business_member(id));

-- RLS Policies: Business Members (Non-recursive)
CREATE POLICY "Active business members can view co-members"
    ON public.business_members FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR private.is_active_business_member(business_id));

-- RLS Policies: Business Locations
CREATE POLICY "Authorized members can view locations"
    ON public.business_locations FOR SELECT
    TO authenticated
    USING (private.can_access_business_location(id));

-- RLS Policies: Business Member Locations
CREATE POLICY "Active business members can view location assignments"
    ON public.business_member_locations FOR SELECT
    TO authenticated
    USING (
        private.is_active_business_member(
            (SELECT bm.business_id FROM public.business_members bm WHERE bm.id = business_member_locations.business_member_id)
        )
    );

-- Table Grants: authenticated SELECT ONLY
GRANT SELECT ON TABLE
    public.profiles,
    public.businesses,
    public.business_members,
    public.business_locations,
    public.business_member_locations
TO authenticated;

