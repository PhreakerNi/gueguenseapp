-- Synthetic Development Seed Data (Phase 1 Foundation)
-- No real personal info, no real keys, no real addresses.

-- Placeholder synthetic businesses
INSERT INTO public.businesses (id, legal_name, brand_name, tax_id, verification_status, account_status)
VALUES 
    ('11111111-1111-1111-1111-111111111111', 'Comercio Demo S.A.', 'Gueguense Demo Store', 'J0310000000001', 'VERIFIED', 'ACTIVE')
ON CONFLICT (id) DO NOTHING;

-- Placeholder synthetic location
INSERT INTO public.business_locations (id, business_id, name, address_text, location)
VALUES
    ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Sucursal Central Demo', 'Managua, Nicaragua', extensions.ST_SetSRID(extensions.ST_MakePoint(-86.2514, 12.1314), 4326))
ON CONFLICT (id) DO NOTHING;
