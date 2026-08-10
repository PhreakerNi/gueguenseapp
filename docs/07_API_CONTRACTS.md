# 07 — CONTRATOS DE API Y ENDPOINTS (API CONTRACTS)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Especificación de Interfaces REST, Serverless Actions, DTOs y Manejo de Errores  

---

## 1. Estándares Globales de la API

* **Formato de Protocolo:** RESTful sobre HTTPS / JSON API v1.
* **Autenticación:** Encabezado `Authorization: Bearer <SUPABASE_JWT_TOKEN>`.
* **Idempotencia:** Operaciones mutativas (`POST`, `PUT`) requieren el encabezado opcional pero recomendado `Idempotency-Key: <UUID>`.
* **Respuesta de Error Estándar:**
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "La entrega solicitada no existe o no tiene permisos para verla.",
    "details": {},
    "timestamp": "2026-08-10T14:30:00Z"
  }
}
```

---

## 2. Contratos Principales por Dominio

### 2.1 Dominio: Cotizaciones y Solicitudes (`/api/v1/quotes` & `/api/v1/deliveries`)

#### Endpoint: `POST /api/v1/quotes` (Crear Cotización)
* **Descripción:** Calcula el costo y tiempo estimado de un envío previo a crearlo.
* **Rol Autorizado:** `business_owner`, `business_manager`, `business_employee`.
* **Request Payload:**
```json
{
  "location_id": "8f3b2a11-4c5d-4e6f-8a9b-0c1d2e3f4a5b",
  "dropoff_address": {
    "street_text": "De los semáforos de Villa Fontana 2c al sur",
    "latitude": 12.11542,
    "longitude": -86.25412
  },
  "package_type": "FOOD",
  "cash_to_collect": 0.00
}
```
* **Response Payload (200 OK):**
```json
{
  "quote_id": "q_991823a-12",
  "distance_km": 4.85,
  "estimated_duration_minutes": 18,
  "pricing_breakdown": {
    "base_fee": 35.00,
    "distance_fee": 24.25,
    "total_price": 59.25,
    "currency": "NIO"
  },
  "expires_at": "2026-08-10T14:35:00Z"
}
```

#### Endpoint: `POST /api/v1/deliveries` (Solicitar Delivery / Disparar Dispatch)
* **Descripción:** Confirma una cotización y coloca la solicitud en la máquina de estados en `SEARCHING_DRIVER`.
* **Request Payload:**
```json
{
  "quote_id": "q_991823a-12",
  "recipient": {
    "name": "Carlos Mendoza",
    "phone": "+50588887777",
    "instructions": "Entregar en portón negro de dos plantas"
  }
}
```
* **Response Payload (201 Created):**
```json
{
  "delivery_id": "d_11223344-5566-7788-9900-aabbccddeeff",
  "status": "SEARCHING_DRIVER",
  "created_at": "2026-08-10T14:31:00Z"
}
```

---

### 2.2 Dominio: Operaciones del Motorizado (`/api/v1/driver`)

#### Endpoint: `POST /api/v1/driver/presence` (Alternar Disponibilidad)
* **Request Payload:**
```json
{
  "operational_state": "AVAILABLE",
  "current_location": {
    "latitude": 12.12001,
    "longitude": -86.25001
  }
}
```
* **Response Payload (200 OK):** `{"status": "UPDATED", "operational_state": "AVAILABLE"}`

#### Endpoint: `POST /api/v1/driver/offers/{offer_id}/accept` (Aceptar Oferta Atómica)
* **Descripción:** Intenta adjudicarse una entrega ofrecida dentro de la ventana de 15 segundos.
* **Response Payload Exitoso (200 OK):**
```json
{
  "success": true,
  "delivery_id": "d_11223344-5566-7788-9900-aabbccddeeff",
  "new_status": "DRIVER_ASSIGNED",
  "pickup_location": {
    "business_name": "Farmacia La Buena Salud",
    "address": "Plaza España 1c abajo",
    "latitude": 12.1311,
    "longitude": -86.2700
  }
}
```
* **Response Payload Conflicto (409 Conflict - Ya asignado a otro):**
```json
{
  "error": {
    "code": "OFFER_EXPIRED_OR_TAKEN",
    "message": "La entrega ya fue asignada a otro conductor o el tiempo de oferta expiró."
  }
}
```

#### Endpoint: `POST /api/v1/driver/deliveries/{id}/verify-pin` (Confirmar Entrega)
* **Request Payload:** `{"pin": "4829"}`
* **Response Payload (200 OK):**
```json
{
  "success": true,
  "delivery_id": "d_11223344-5566-7788-9900-aabbccddeeff",
  "status": "DELIVERED",
  "credited_earning": 45.00,
  "delivered_at": "2026-08-10T14:52:10Z"
}
```

---

### 2.3 Dominio: Tracking Público del Cliente (`/api/v1/tracking/{token}`)

#### Endpoint: `GET /api/v1/tracking/{token}` (Datos de Tracking Web Publico)
* **Descripción:** Endpoint público (sin encabezado de Auth, autenticado únicamente por la firma del token).
* **Response Payload (200 OK):**
```json
{
  "delivery_id": "d_11223344-5566-7788-9900-aabbccddeeff",
  "status": "TO_DROPOFF",
  "business": {
    "name": "Restaurante El Güegüense"
  },
  "driver": {
    "full_name": "Juan Pérez",
    "avatar_url": "https://gueguense.app/avatars/driver_12.jpg",
    "vehicle_plate": "M-123456",
    "rating": 4.95
  },
  "driver_location": {
    "latitude": 12.1250,
    "longitude": -86.2580,
    "updated_at": "2026-08-10T14:48:30Z"
  },
  "eta_minutes": 7,
  "customer_pin": "4829"
}
```

---

### 2.4 Catálogo de Códigos de Error Globales API

* `AUTH_INVALID_TOKEN`: Token JWT expirado o inválido.
* `PERMISSION_DENIED`: El rol del usuario no tiene autorización para esta acción.
* `INVALID_STATE_TRANSITION`: Intento de cambiar el estado de la entrega violando la máquina de estados.
* `OFFER_TIMEOUT`: La ventana de 15 segundos para aceptar la oferta ha vencido.
* `PIN_INVALID`: El código PIN ingresado por el conductor no coincide con el registrado.
* `LOCATION_OUT_OF_BOUNDS`: El punto de entrega está fuera del radio de cobertura operativo.
* `IDEMPOTENCY_CONFLICT`: Petición duplicada procesada anteriormente con el mismo `Idempotency-Key`.
