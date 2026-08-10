# 07 — CONTRATOS DE API Y ENDPOINTS (API CONTRACTS)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Especificación de Interfaces REST, Endpoints, DTOs, Idempotencia y Reglas de OTP  

---

## 1. Estándares Globales de la API

* **Autenticación:** `Authorization: Bearer <SUPABASE_JWT_TOKEN>`.
* **Idempotencia Obligatoria:** Peticiones mutativas críticas (`POST /api/v1/deliveries`, `POST /api/v1/driver/offers/{id}/accept`, `POST /api/v1/deliveries/{id}/verify-otp`, `POST /api/v1/payouts`) EXIGEN el encabezado `Idempotency-Key: <UUID-V4-VÁLIDO>`. Reutilizar la misma llave con payload distinto produce `422 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`.
* **Regla Canónica de OTP:** El `DELIVERY_OTP` **NUNCA se retorna a la app del Conductor, Negocio ni Admin.** Solamente se expone al destinatario autenticado mediante su token de seguimiento en el endpoint customer-scoped `GET /api/v1/tracking/{token}/otp`.

---

## 2. Contratos Detallados por Dominio

### 2.1 Dominio: Conductor (`/api/v1/driver`)

#### Endpoint: `POST /api/v1/driver/offers/{offer_id}/accept` (Aceptar Oferta de Viaje)
* **Headers:** `Authorization: Bearer <JWT>`, `Idempotency-Key: a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d`
* **Response (200 OK):**
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
* **Headers:** `Authorization: Bearer <JWT>`, `Idempotency-Key: c1d2e3f4-a5b6-7c8d-9e0f-1a2b3c4d5e6f`
* **Request:** `{"otp": "482910"}`
* **Response (200 OK):** `{"success": true, "status": "DELIVERED", "credited_earning": 45.00}`
* **Response Error (400 / 423):** `{"success": false, "code": "OTP_LOCKED", "message": "Entrega bloqueada temporalmente por 3 intentos fallidos."}`

---

### 2.2 Dominio: Negocio (`/api/v1/business`)

#### Endpoint: `POST /api/v1/business/deliveries/{id}/confirm-pickup-custody` (Confirmar Custodia Sucursal)
* **Headers:** `Authorization: Bearer <JWT>`, `Idempotency-Key: d47ac10b-58cc-4372-a567-0e02b2c3d479`
* **Request:** `{"pickup_code": "PK-8821"}`
* **Response (200 OK):** `{"success": true, "status": "PICKED_UP", "custody_transferred_at": "2026-08-10T15:35:10Z"}`

---

### 2.3 Dominio: Tracking Web del Cliente (`/api/v1/tracking/{token}`)

#### Endpoint: `GET /api/v1/tracking/{token}` (Snapshot de Tracking)
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
    "freshness": "LIVE"
  },
  "eta_minutes": 7
}
```

#### Endpoint: `GET /api/v1/tracking/{token}/otp` (Obtener OTP del Destinatario)
* **Response (200 OK):** `{"delivery_otp": "482910", "expires_at": "2026-08-10T18:00:00Z"}`
*(Único endpoint autorizado para exponer el `DELIVERY_OTP` descifrado desde `private.delivery_secrets.otp_ciphertext`).*

#### Endpoint: `POST /api/v1/tracking/{token}/realtime-session` (Sesión Realtime Scoped)
* **Response (200 OK):** `{"realtime_channel": "delivery:b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e", "scoped_token": "eyJhbGciOi..."}`
