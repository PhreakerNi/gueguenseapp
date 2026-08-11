-- Migration 3: Driver Foundation Tables + RLS

-- 1. Drivers (1:1 with auth.users)
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED')),
    account_status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (account_status IN ('REGISTERED', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED')),
    national_id_number TEXT,
    license_number TEXT,
    rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.00,
    total_deliveries INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Driver Documents
CREATE TABLE public.driver_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'CRIMINAL_RECORD', 'INSURANCE')),
    upload_id UUID UNIQUE NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Vehicles
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INT,
    license_plate TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Driver Presence (1:1 with Drivers)
CREATE TABLE public.driver_presence (
    driver_id UUID PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
    operational_state TEXT NOT NULL DEFAULT 'OFFLINE' CHECK (operational_state IN ('OFFLINE', 'AVAILABLE', 'OFFERED', 'BUSY', 'PAUSED')),
    current_location extensions.geography(POINT, 4326),
    location_updated_at TIMESTAMPTZ
);

CREATE INDEX idx_driver_presence_geo ON public.driver_presence USING GIST(current_location);

-- Enable RLS (Deny by default)
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_presence ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Drivers
CREATE POLICY "Drivers can view own profile"
    ON public.drivers FOR SELECT
    TO authenticated
    USING (auth.uid() = id);

-- Note: Drivers CANNOT update verification_status or account_status directly via client RLS.

-- RLS Policies: Driver Documents
CREATE POLICY "Drivers can view own documents"
    ON public.driver_documents FOR SELECT
    TO authenticated
    USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own documents"
    ON public.driver_documents FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = driver_id);

-- RLS Policies: Vehicles
CREATE POLICY "Drivers can view own vehicles"
    ON public.vehicles FOR SELECT
    TO authenticated
    USING (auth.uid() = driver_id);

CREATE POLICY "Drivers can insert own vehicles"
    ON public.vehicles FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = driver_id);

-- RLS Policies: Driver Presence
CREATE POLICY "Drivers can view own presence"
    ON public.driver_presence FOR SELECT
    TO authenticated
    USING (auth.uid() = driver_id);

-- Driver can toggle operational_state but CANNOT update current_location directly via REST/RLS bypass.
-- Location updates require authenticated RPC (POST /api/v1/driver/location).
CREATE POLICY "Drivers can toggle operational state"
    ON public.driver_presence FOR UPDATE
    TO authenticated
    USING (auth.uid() = driver_id)
    WITH CHECK (
        auth.uid() = driver_id
        -- Ensure current_location is NOT modified directly via client REST
        AND current_location IS NOT DISTINCT FROM (SELECT dp.current_location FROM public.driver_presence dp WHERE dp.driver_id = auth.uid())
    );
