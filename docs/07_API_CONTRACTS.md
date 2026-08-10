# 07 — CONTRATOS DE API Y ENDPOINTS (API CONTRACTS)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Especificación de Interfaces REST, Endpoints, DTOs e Idempotencia Obligatoria  

---

## 1. Estándares Globales de la API

* **Autenticación:** `Authorization: Bearer <SUPABASE_JWT_TOKEN>`.
* **Idempotencia Obligatoria:** Peticiones mutativas críticas (`POST /api/v1/deliveries`, `POST /api/v1/driver/offers/{id}/accept`, `POST /api/v1/deliveries/{id}/verify-otp`, `POST /api/v1/payouts`) EXIGEN el encabezado `Idempotency-Key: <UUID-V4-VÁLIDO>`.
* **Secretos Protegidos:** La API NUNCA retorna el `DELIVERY_OTP` en respuestas JSON.

---

## 2. Contratos Detallados de Endpoints

### 2.1 Dominio: Cotizaciones (`/api/v1/quotes`)

#### Endpoint: `POST /api/v1/quotes` (Crear Cotización)
* **Request:**
```json
{
  "location_id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "dropoff_address": {
    "street_text": "Semáforos de Villa Fontana 2c al sur",
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
  "status": "QUOTED",
  "distance_km": 4.85,
  "estimated_duration_minutes": 18,
  "pricing_breakdown": {
    "base_fee": 35.00,
    "distance_fee": 24.25,
    "total_quoted_price": 59.25,
    "currency": "NIO"
  },
  "expires_at": "2026-08-10T15:30:00Z"
}
```

---

### 2.2 Dominio: Entregas (`/api/v1/deliveries`)

#### Endpoint: `POST /api/v1/deliveries` (Consumir Quote / Crear Delivery)
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
  "created_at": "2026-08-10T15:25:00Z"
}
```

#### Endpoint: `POST /api/v1/business/deliveries/{id}/confirm-pickup-custody` (Transferencia Custodia Sucursal)
* **Request:** `{"pickup_code": "PK-8821"}`
* **Response (200 OK):** `{"success": true, "status": "PICKED_UP", "custody_transferred_at": "2026-08-10T15:35:10Z"}`

---

### 2.3 Dominio: Operaciones del Conductor

#### Endpoint: `POST /api/v1/driver/offers/{offer_id}/accept` (Atómico Security Definer)
* **Headers:** `Idempotency-Key: a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d`
* **Response Exitoso (200 OK):**
```json
{
  "success": true,
  "delivery_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "status": "DRIVER_ASSIGNED",
  "pickup_code": "PK-8821",
  "pickup_location": {
    "business_name": "Farmacia La Buena Salud",
    "address": "Plaza España 1c abajo",
    "latitude": 12.131100,
    "longitude": -86.270000
  }
}
```

#### Endpoint: `POST /api/v1/driver/deliveries/{id}/verify-otp` (Confirmar Entrega por OTP)
* **Headers:** `Idempotency-Key: c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f`
* **Request:** `{"otp": "482910"}`
* **Response (200 OK):** `{"success": true, "status": "DELIVERED", "credited_earning": 45.00}`

---

### 2.4 Dominio: Tracking Web del Cliente (`/api/v1/tracking/{token}`)

#### Endpoint: `GET /api/v1/tracking/{token}`
* **Response (200 OK):**
```json
{
  "delivery_id": "b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e",
  "status": "TO_DROPOFF",
  "business_name": "Restaurante El Güegüense",
  "driver": {
    "full_name": "Juan Pérez",
    "avatar_url": "https://gueguense.app/avatars/driver_12.jpg",
    "vehicle_plate": "M-123456"
  },
  "driver_location": {
    "latitude": 12.125000,
    "longitude": -86.258000,
    "location_updated_at": "2026-08-10T15:28:30Z",
    "freshness": "LIVE"
  },
  "eta_minutes": 7,
  "delivery_otp": "482910"
}
```
*(Nota: `delivery_otp` solo se envía a la pantalla del cliente destinatario en la web de tracking; NUNCA en la API del motorizado).*
