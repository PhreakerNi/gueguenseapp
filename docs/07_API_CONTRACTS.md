# 07 — CONTRATOS DE API Y ENDPOINTS (API CONTRACTS)

**Proyecto:** Güegüense  
**Versión:** 1.5.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Especificación de Interfaces REST, Tabla de Especificación por Mutación e Idempotencia  

---

## 1. Estándares Globales de la API

* **Autenticación:** `Authorization: Bearer <SUPABASE_JWT_TOKEN>`.
* **Idempotencia Obligatoria:** Encabezado `Idempotency-Key: <UUID-V4>` en todas las mutaciones críticas.
* **Regla Canónica de OTP:** El `DELIVERY_OTP` **NUNCA se retorna a Driver, Negocio ni Admin.** Solamente se expone al destinatario en `GET /api/v1/tracking/{token}/otp` descifrando `otp_ciphertext` durante estados de entrega autorizados (`PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`).

---

## 2. Especificación Estructurada de Mutaciones y Operaciones Críticas

### 2.1 Dominio: Conductor (`apps/driver-mobile`)

| Endpoint / Action | Actor | Auth / Authorization | Allowed Current State | Request Payload | Resulting State | Idempotency | Domain Errors | Events | Notifications | Financial Effects |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`POST /api/v1/driver/offers/{id}/accept`** | Driver | JWT (`drivers.account_status = ACTIVE`) | `driver_presence.operational_state IN (AVAILABLE, OFFERED)` | `{}` | `DRIVER_ASSIGNED` | Obligatoria | `OFFER_EXPIRED`, `DRIVER_ALREADY_BUSY`, `STALE_DRIVER_LOCATION` | `OFFER_ACCEPTED`, `DRIVER_ASSIGNED` | Push/Socket a Negocio | N/A |
| **`POST /api/v1/driver/deliveries/{id}/start-pickup`** | Driver | JWT (Driver asignado) | `DRIVER_ASSIGNED` | `{}` | `TO_PICKUP` | Opcional | `INVALID_DELIVERY_STATE` | `TO_PICKUP_STARTED` | Socket a Negocio | N/A |
| **`POST /api/v1/driver/deliveries/{id}/arrived-pickup`** | Driver | JWT (Driver asignado) | `TO_PICKUP` | `{}` | `ARRIVED_PICKUP` | Opcional | `LOCATION_OUT_OF_RANGE` | `ARRIVED_PICKUP` | Push/Socket a Negocio | N/A |
| **`POST /api/v1/driver/deliveries/{id}/start-dropoff`** | Driver | JWT (Driver asignado) | `PICKED_UP` | `{}` | `TO_DROPOFF` | Opcional | `INVALID_DELIVERY_STATE` | `TO_DROPOFF_STARTED` | SMS/Tracking a Cliente | N/A |
| **`POST /api/v1/driver/deliveries/{id}/arrived-dropoff`** | Driver | JWT (Driver asignado) | `TO_DROPOFF` | `{}` | `ARRIVED_DROPOFF` | Opcional | `LOCATION_OUT_OF_RANGE` | `ARRIVED_DROPOFF` | SMS/Push a Cliente | N/A |
| **`POST /api/v1/driver/deliveries/{id}/verify-otp`** | Driver | JWT (Driver asignado) | `ARRIVED_DROPOFF` | `{"otp": "123456"}` | `DELIVERED` | Obligatoria | `INVALID_OTP`, `OTP_LOCKED`, `MAX_ATTEMPTS_EXCEEDED` | `OTP_VERIFIED`, `DELIVERY_COMPLETED` | Push a Negocio y Cliente | Journal Entry (Earning Credited) |
| **`POST /api/v1/driver/payout-methods`** | Driver | JWT (Driver activo) | N/A | `{"provider_type": "BANK_TRANSFER", "masked_value": "••••1234", "token_ref": "tok_xyz"}` | `PENDING` (en `driver_payout_methods`) | Obligatoria | `INVALID_PAYOUT_METHOD` | `PAYOUT_METHOD_ADDED` | Email Confirmación | N/A |
| **`POST /api/v1/driver/payouts`** | Driver | JWT (Driver activo) | N/A | `{"payout_method_id": "<UUID>", "amount": 1000.00}` | `REQUESTED` (en `payouts`) | Obligatoria | `INSUFFICIENT_BALANCE` | `PAYOUT_REQUESTED` | Push a Admin | Hold en Saldo Driver |

---

### 2.2 Dominio: Negocio (`apps/business-mobile`)

| Endpoint / Action | Actor | Auth / Authorization | Allowed Current State | Request Payload | Resulting State | Idempotency | Domain Errors | Events | Notifications | Financial Effects |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`POST /api/v1/quotes`** | Business Member | JWT (Miembro activo en sucursal) | N/A | `{"location_id": "<UUID>", "dropoff_address": {...}, "package_type": "PARCEL"}` | `QUOTED` | No | `INVALID_LOCATIONS`, `PRICING_UNAVAILABLE` | `QUOTE_CALCULATED` | N/A | N/A |
| **`POST /api/v1/deliveries`** | Business Member | JWT (Miembro activo en sucursal) | Quote status = `QUOTED` | `{"quote_id": "<UUID>"}` | `SEARCHING_DRIVER` | Obligatoria | `QUOTE_EXPIRED`, `INSUFFICIENT_FUNDS` | `QUOTE_CONSUMED`, `DELIVERY_CREATED` | Push a Flota Motorizados | Reserva de Fondos |
| **`POST /api/v1/business/deliveries/{id}/confirm-pickup-custody`** | Business Employee | JWT (Miembro en sucursal) | `ARRIVED_PICKUP` | `{"pickup_code": "PK-8821"}` | `PICKED_UP` | Obligatoria | `INVALID_PICKUP_CODE`, `UNAUTHORIZED_MEMBER` | `CUSTODY_TRANSFERRED` | Push a Conductor | N/A |
| **`POST /api/v1/business/deliveries/{id}/cancel`** | Business / Operator | JWT (Miembro u Operador) | `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP` | `{"reason": "CLIENT_CANCELED"}` | `CANCELED` (Quote permanece `CONSUMED`) | Obligatoria | `CANNOT_CANCEL_IN_TRANSIT` | `DELIVERY_CANCELED` | Push a Conductor | Cancel Fee si aplica |
| **`POST /api/v1/business/deliveries/{id}/confirm-returned`** | Business Employee | JWT (Miembro en sucursal) | `RETURNING` | `{}` | `RETURNED` | Obligatoria | `UNAUTHORIZED_MEMBER` | `RETURN_COMPLETED`, `CUSTODY_RETURNED` | Push a Conductor y Admin | Return Fee debitado |

---

### 2.3 Dominio: Tracking Web, Handoff, Administración y Finanzas

| Endpoint / Action | Actor | Auth / Authorization | Allowed Current State | Request Payload | Resulting State | Idempotency | Domain Errors | Events | Notifications | Financial Effects |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`GET /api/v1/tracking/{token}`** | Tracking Holder | Bearer Tracking Token | Estado Activo / Terminal | N/A | Snapshot Delivery | No | `INVALID_TRACKING_TOKEN`, `TOKEN_EXPIRED` | N/A | N/A | N/A |
| **`GET /api/v1/tracking/{token}/otp`** | Tracking Holder | Bearer Tracking Token | `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF` | N/A | `{"otp": "123456"}` | No | `OTP_UNAVAILABLE_STATE`, `TOKEN_EXPIRED` | N/A | N/A | N/A |
| **`POST /api/v1/admin/handoffs/authorize`** | Operator / Admin | JWT (Rol Operator/Admin) | `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF` | `{"delivery_id": "<UUID>", "from_driver_id": "...", "to_driver_id": "...", "reason": "..."}` | `INITIATED` (en `custody_handoffs`) | Obligatoria | `INVALID_HANDOFF_DRIVERS` | `HANDOFF_STARTED` | Push a Ambos Conductores | Split Fee Evaluado |
| **`POST /api/v1/admin/payouts/{id}/approve`** | Admin | JWT (Rol Admin + MFA si > C$5,000) | `REQUESTED` / `UNDER_REVIEW` | `{"reason": "AUDITED_PAYOUT"}` | `APPROVED` / `PAID` | Obligatoria | `PAYOUT_ALREADY_PROCESSED` | `PAYOUT_APPROVED` | Push a Conductor | Journal Entry Payout |
| **`POST /api/v1/admin/cash-settlements`** | Admin | JWT (Rol Admin) | N/A | `{"driver_id": "<UUID>", "settled_amount": 500.00}` | `SETTLED` (en `cash_settlements`) | Obligatoria | `CASH_DISCREPANCY_UNRESOLVED` | `CASH_SETTLED` | Email a Conductor | Journal Entry Cash |
