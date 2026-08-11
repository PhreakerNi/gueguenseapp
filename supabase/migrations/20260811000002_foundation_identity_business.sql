-- Migration 2: Identity & Business Foundation Tables + RLS

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

-- 4. Business Locations
CREATE TABLE public.business_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address_text TEXT NOT NULL,
    location extensions.geography(POINT, 4326),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_locations_geo ON public.business_locations USING GIST(location);

-- 5. Business Member Locations (Scope N:M)
CREATE TABLE public.business_member_locations (
    member_id UUID NOT NULL REFERENCES public.business_members(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES public.business_locations(id) ON DELETE CASCADE,
    PRIMARY KEY (member_id, location_id)
);

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

CREATE POLICY "Users can update own profile (non-role fields)"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

-- RLS Policies: Businesses (Tenancy restricted)
CREATE POLICY "Business members can view their business"
    ON public.businesses FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.business_members bm
            WHERE bm.business_id = businesses.id
              AND bm.user_id = auth.uid()
              AND bm.status = 'ACTIVE'
        )
    );

-- RLS Policies: Business Members
CREATE POLICY "Business members can view co-members"
    ON public.business_members FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.business_members bm
            WHERE bm.business_id = business_members.business_id
              AND bm.user_id = auth.uid()
              AND bm.status = 'ACTIVE'
        )
    );

-- RLS Policies: Business Locations
CREATE POLICY "Location members can view assigned locations"
    ON public.business_locations FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.business_members bm
            JOIN public.business_member_locations bml ON bml.member_id = bm.id
            WHERE bm.business_id = business_locations.business_id
              AND bml.location_id = business_locations.id
              AND bm.user_id = auth.uid()
              AND bm.status = 'ACTIVE'
        )
    );

-- RLS Policies: Business Member Locations
CREATE POLICY "Location members can view member location scopes"
    ON public.business_member_locations FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.business_members bm
            WHERE bm.id = business_member_locations.member_id
              AND bm.user_id = auth.uid()
              AND bm.status = 'ACTIVE'
        )
    );
