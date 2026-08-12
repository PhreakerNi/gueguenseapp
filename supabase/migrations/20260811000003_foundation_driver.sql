-- Migration 3: Driver Foundation Tables + Secure RLS Policies

-- 1. Drivers (1:1 with auth.users)
CREATE TABLE public.drivers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED')),
    account_status TEXT NOT NULL DEFAULT 'REGISTERED' CHECK (account_status IN ('REGISTERED', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED')),
    national_id_number TEXT UNIQUE,
    license_number TEXT UNIQUE,
    rating_avg NUMERIC(3,2) NOT NULL DEFAULT 5.00,
    total_deliveries INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drivers_verification_status ON public.drivers(verification_status);
CREATE INDEX idx_drivers_account_status ON public.drivers(account_status);

-- 2. Driver Documents
CREATE TABLE public.driver_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    document_type TEXT NOT NULL CHECK (document_type IN ('NATIONAL_ID', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION', 'CRIMINAL_RECORD', 'INSURANCE')),
    storage_path TEXT NOT NULL,
    verification_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED')),
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_documents_driver_id ON public.driver_documents(driver_id);

-- 3. Vehicles
CREATE TABLE public.vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INT NOT NULL,
    color TEXT NOT NULL,
    license_plate TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vehicles_driver_id ON public.vehicles(driver_id);

-- 4. Driver Presence (1:1 with Drivers)
CREATE TABLE public.driver_presence (
    driver_id UUID PRIMARY KEY REFERENCES public.drivers(id) ON DELETE CASCADE,
    operational_state TEXT NOT NULL DEFAULT 'OFFLINE' CHECK (operational_state IN ('OFFLINE', 'AVAILABLE', 'OFFERED', 'BUSY', 'PAUSED')),
    current_location extensions.geography(POINT, 4326),
    location_updated_at TIMESTAMPTZ
);

CREATE INDEX idx_driver_presence_state ON public.driver_presence(operational_state);
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

-- Note: UPDATE direct from client on public.drivers is DENIED to prevent verification_status/account_status self-change.

-- RLS Policies: Driver Documents
CREATE POLICY "Drivers can view own documents"
    ON public.driver_documents FOR SELECT
    TO authenticated
    USING (auth.uid() = driver_id);

-- Note: INSERT/UPDATE direct from client on public.driver_documents is DENIED in Phase 1 to prevent auto-verified document uploads.

-- RLS Policies: Vehicles
CREATE POLICY "Drivers can view own vehicles"
    ON public.vehicles FOR SELECT
    TO authenticated
    USING (auth.uid() = driver_id);

-- RLS Policies: Driver Presence
CREATE POLICY "Drivers can view own presence"
    ON public.driver_presence FOR SELECT
    TO authenticated
    USING (auth.uid() = driver_id);

-- Table Grants: authenticated SELECT ONLY
GRANT SELECT ON TABLE
    public.drivers,
    public.driver_documents,
    public.vehicles,
    public.driver_presence
TO authenticated;

-- Note: UPDATE direct from client on public.driver_presence (current_location, location_updated_at, operational_state) is DENIED. Location ingestion requires authenticated server RPC.

