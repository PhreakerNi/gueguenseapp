# 07 — CONTRATOS DE API Y ENDPOINTS (API CONTRACTS)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Especificación de Endpoints REST, DTOs, Idempotencia y Manejo de Errores  

---

## 1. Estándares Globales de la API

* **Autenticación:** `Authorization: Bearer <SUPABASE_JWT_TOKEN>`.
* **Idempotencia Obligatoria:** Peticiones mutativas críticas (`POST /api/v1/deliveries`, `POST /api/v1/driver/offers/{id}/accept`, `POST /api/v1/payouts`) EXIGEN el encabezado `Idempotency-Key: <UUID-V4-VÁLIDO>`.
* **Manejo de Secretos:** La API NUNCA retorna el `DELIVERY_OTP` en respuestas JSON.

---

## 2. Contratos Detallados de Endpoints

### 2.1 Dominio: Registro y Verificación de Conductor (`/api/v1/driver`)

#### Endpoint: `POST /api/v1/driver/onboarding`
* **Request:** `{"national_id": "001-120595-0002K", "license_number": "LIC-998822"}`
* **Response (200 OK):** `{"driver_id": "c0a80101-0000-0000-0000-000000000001", "verification_status": "UNDER_REVIEW"}`

#### Endpoint: `POST /api/v1/driver/documents`
* **Request:** `{"document_type": "DRIVERS_LICENSE", "file_path": "drivers/lic_123.jpg"}`
* **Response (201 Created):** `{"document_id": "c0a80101-0000-0000-0000-000000000002", "status": "PENDING"}`

---

### 2.2 Dominio: Cotizaciones y Envíos (`/api/v1/deliveries`)

#### Endpoint: `POST /api/v1/quotes`
* **Request:**
```json
{
  "location_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "dropoff_address": {
    "street_text": "Semaforos de Villa Fontana 2c al sur",
    "latitude": 12.115420,
    "longitude": -86.254120
  },
  "package_type": "FOOD",
  "cash_to_collect": 0.00
}
```
* **Response (200 OK):**
```json
{
  "quote_id": "e7f8a9b0-1c2d-3e4f-5a6b-7c8d9e0f1a2b",
  "distance_km": 4.85,
  "estimated_duration_minutes": 18,
  "pricing_breakdown": {
    "base_fee": 35.00,
    "distance_fee": 24.25,
    "total_quoted_price": 59.25,
    "currency": "NIO"
  },
  "expires_at": "2026-08-10T15:00:00Z"
}
```

#### Endpoint: `POST /api/v1/deliveries` (Idempotencia Obligatoria)
* **Headers:** `Idempotency-Key: f47ac10b-58cc-4372-a567-0e02b2c3d479`
* **Request:**
```json
{
  "quote_id": "e7f8a9b0-1c2d-3e4f-5a6b-7c8d9e0f1a2b",
  "recipient": {
    "name": "Carlos Mendoza",
    "phone": "+50588887777",
    "instructions": "Entregar en portón negro"
  }
}
```
* **Response (201 Created):**
```json
{
  "delivery_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "status": "SEARCHING_DRIVER",
  "pickup_code": "PK-8821",
  "created_at": "2026-08-10T14:55:00Z"
}
```

---

### 2.3 Dominio: Despacho y Aceptación de Conductor

#### Endpoint: `POST /api/v1/driver/offers/{offer_id}/accept` (Atómico Security Definer)
* **Headers:** `Idempotency-Key: a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d`
* **Response Exitoso (200 OK):**
```json
{
  "success": true,
  "delivery_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "status": "DRIVER_ASSIGNED",
  "pickup_location": {
    "business_name": "Farmacia La Buena Salud",
    "address": "Plaza España 1c abajo",
    "latitude": 12.131100,
    "longitude": -86.270000
  }
}
```
* **Response Conflicto (409 Conflict):** `{"error": {"code": "OFFER_EXPIRED_OR_DRIVER_BUSY", "message": "Oferta expirada o ya posee otra entrega activa."}}`

#### Endpoint: `POST /api/v1/driver/deliveries/{id}/verify-otp` (Confirmar Entrega Final)
* **Request:** `{"otp": "4829"}`
* **Response (200 OK):**
```json
{
  "success": true,
  "delivery_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "status": "DELIVERED",
  "credited_earning": 45.00,
  "verified_at": "2026-08-10T15:15:20Z"
}
```

---

### 2.4 Dominio: Incidentes (`/api/v1/incidents`)

#### Endpoint: `POST /api/v1/incidents`
* **Request:** `{"delivery_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e", "incident_type": "VEHICLE_BREAKDOWN", "notes": "Llanta ponchada en semáforos de ENEL"}`
* **Response (201 Created):** `{"incident_id": "c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f", "status": "OPEN"}`
