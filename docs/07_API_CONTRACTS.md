# 07 — CONTRATOS DE API Y ENDPOINTS (API CONTRACTS)

**Proyecto:** Güegüense  
**Versión:** 1.7.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Especificación de Interfaces REST, Tablas de Especificación por Mutación Crítica por Dominio (12 Columnas Estrictas por Fila)  

---

## 1. Estándares Globales de la API

* **Autenticación:** `Authorization: Bearer <SUPABASE_JWT_TOKEN>`.
* **Idempotencia Obligatoria:** Encabezado `Idempotency-Key: <UUID-V4>` en todas las mutaciones críticas. Soporta actores `USER`, `SYSTEM`, `WEBHOOK` y `BACKGROUND_JOB`.
* **Regla Canónica de OTP:** El `DELIVERY_OTP` **NUNCA se retorna a Driver, Negocio ni Admin.** Solamente se expone al destinatario en `GET /api/v1/tracking/{token}/otp` descifrando `otp_ciphertext` durante estados de entrega autorizados ($\text{OTP\_ALLOWED\_STATES} = \{\text{PICKED\_UP}, \text{TO\_DROPOFF}, \text{ARRIVED\_DROPOFF}\}$).
* **Consolidación Handoff MVP:** No existe endpoint `/authorize` separado en MVP porque la creación por Operator/Admin (`POST /api/v1/admin/handoffs`) constituye su autorización explícita auditable. No existe endpoint `/complete` separado; `POST /api/v1/handoffs/{id}/confirm-to` es la mutación atómica que finaliza el traspaso transitándolo a estado `COMPLETED`.

---

## 2. Especificación Estructurada de Mutaciones y Operaciones Críticas (12 Columnas Estrictas por Fila)

### 2.1 Dominio: Conductor (`apps/driver-mobile`)

| Endpoint / Action | Actor | Auth / Authorization | Allowed Current State | Request Payload | Response Payload | Resulting State | Idempotency | Domain Errors | Events | Notifications | Financial Effects |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`POST /api/v1/driver/onboarding`** | Driver | JWT (`drivers.account_status = REGISTERED`) | `REGISTERED` | `{"national_id": "001-XXXXXX-XXXX", "license": "LIC-9921"}` | `{"verification_status": "PENDING", "account_status": "REGISTERED"}` | `verification_status = PENDING`, `account_status = REGISTERED` | Obligatoria | `ALREADY_REGISTERED` | `DRIVER_REGISTERED` | Push/Email Admin | N/A |
| **`POST /api/v1/driver/documents/upload-authorization`** | Driver | JWT (Driver en onboarding) | `PENDING`, `REJECTED` | `{"document_type": "NATIONAL_ID"}` | `{"upload_id": "<UUID>", "upload_url": "https://...", "expires_at": "..."}` | N/A | Opcional | `INVALID_DOCUMENT_TYPE` | N/A | N/A | N/A |
| **`POST /api/v1/driver/documents`** | Driver | JWT (Driver en onboarding) | `PENDING`, `REJECTED` | `{"upload_id": "<UUID>", "document_type": "NATIONAL_ID"}` | `{"document_id": "<UUID>"}` | `verification_status = PENDING` (en `driver_documents`) | Obligatoria | `UPLOAD_UNVERIFIED`, `EXPIRED_UPLOAD_REF` | `DOCUMENT_SUBMITTED` | Push Admin | N/A |
| **`POST /api/v1/driver/vehicles`** | Driver | JWT (Driver activo/pending) | N/A | `{"make": "Yamaha", "model": "FZ", "year": 2023, "license_plate": "M-12345"}` | `{"vehicle_id": "<UUID>"}` | Registrado (en `vehicles`) | Obligatoria | `PLATE_ALREADY_EXISTS` | `VEHICLE_REGISTERED` | N/A | N/A |
| **`POST /api/v1/driver/availability`** | Driver | JWT (`drivers.account_status = ACTIVE`) | `OFFLINE` / `AVAILABLE` | `{"operational_state": "AVAILABLE"}` | `{"operational_state": "AVAILABLE"}` | `AVAILABLE` (en `driver_presence`) | Opcional | `DRIVER_NOT_AUTHORIZED` | `AVAILABILITY_CHANGED` | N/A | N/A |
| **`GET /api/v1/driver/state`** | Driver | JWT | N/A | N/A | `{"operational_state": "AVAILABLE", ...}` | N/A | No | N/A | N/A | N/A | N/A |
| **`GET /api/v1/driver/offers/active`** | Driver | JWT | N/A | N/A | `{"offers": [...]}` | N/A | No | N/A | N/A | N/A | N/A |
| **`POST /api/v1/driver/offers/{id}/accept`** | Driver | JWT (`drivers.account_status = ACTIVE`) | `driver_presence.operational_state IN (AVAILABLE, OFFERED)` | `{}` | `{"success": true, "delivery_id": "<UUID>"}` | `DRIVER_ASSIGNED` | Obligatoria | `OFFER_EXPIRED`, `DRIVER_ALREADY_BUSY`, `STALE_DRIVER_LOCATION` | `OFFER_ACCEPTED`, `DRIVER_ASSIGNED` | Push/Socket a Negocio | N/A |
| **`POST /api/v1/driver/offers/{id}/reject`** | Driver | JWT | `OFFERED` | `{}` | `{"success": true}` | `REJECTED` (en `delivery_offers`) | Opcional | `OFFER_EXPIRED` | `OFFER_REJECTED` | Dispatch re-assign | N/A |
| **`GET /api/v1/driver/deliveries/active`** | Driver | JWT | N/A | N/A | `{"delivery": {...}}` | N/A | No | N/A | N/A | N/A | N/A |
| **`POST /api/v1/driver/deliveries/{id}/start-pickup`** | Driver | JWT (Driver asignado) | `DRIVER_ASSIGNED` | `{}` | `{"status": "TO_PICKUP"}` | `TO_PICKUP` | Opcional | `INVALID_DELIVERY_STATE` | `TO_PICKUP_STARTED` | Socket a Negocio | N/A |
| **`POST /api/v1/driver/deliveries/{id}/arrived-pickup`** | Driver | JWT (Driver asignado) | `TO_PICKUP` | `{}` | `{"status": "ARRIVED_PICKUP"}` | `ARRIVED_PICKUP` | Opcional | `LOCATION_OUT_OF_RANGE` | `ARRIVED_PICKUP` | Push/Socket a Negocio | N/A |
| **`POST /api/v1/driver/deliveries/{id}/start-dropoff`** | Driver | JWT (Driver asignado) | `PICKED_UP` | `{}` | `{"status": "TO_DROPOFF"}` | `TO_DROPOFF` | Opcional | `INVALID_DELIVERY_STATE` | `TO_DROPOFF_STARTED` | SMS/Tracking a Cliente | N/A |
| **`POST /api/v1/driver/deliveries/{id}/arrived-dropoff`** | Driver | JWT (Driver asignado) | `TO_DROPOFF` | `{}` | `{"status": "ARRIVED_DROPOFF"}` | `ARRIVED_DROPOFF` | Opcional | `LOCATION_OUT_OF_RANGE` | `ARRIVED_DROPOFF` | SMS/Push a Cliente | N/A |
| **`POST /api/v1/driver/deliveries/{id}/verify-otp`** | Driver | JWT (Driver asignado) | `ARRIVED_DROPOFF` | `{"otp": "123456"}` | `{"status": "DELIVERED"}` | `DELIVERED` | Obligatoria | `INVALID_OTP`, `OTP_LOCKED`, `MAX_ATTEMPTS_EXCEEDED` | `OTP_VERIFIED`, `DELIVERY_COMPLETED` | Push a Negocio y Cliente | Journal Entry (Earning Credited) |
| **`POST /api/v1/driver/deliveries/{id}/incidents`** | Driver | JWT (Driver asignado) | Estado Activo | `{"incident_type": "ACCIDENT", "notes": "..."}` | `{"incident_id": "<UUID>"}` | `OPEN` (en `incidents`) | Obligatoria | `INVALID_INCIDENT_TYPE` | `INCIDENT_OPENED` | Push a Admin | N/A |
| **`POST /api/v1/driver/deliveries/{id}/return/start`** | Driver / Resolution | JWT (Driver asignado) | `RETURN_REQUIRED` | `{}` | `{"status": "RETURNING"}` | `RETURNING` | Opcional | `INVALID_DELIVERY_STATE` | `RETURN_STARTED` | Socket a Negocio | N/A |
| **`POST /api/v1/driver/location`** | Driver | JWT | N/A | `{"lat": 12.13, "lng": -86.25, "accuracy": 10}` | `{"success": true}` | N/A | Sequence-based | `STALE_LOCATION`, `INVALID_COORDINATES` | N/A | N/A | N/A |
| **`GET /api/v1/driver/earnings`** | Driver | JWT | N/A | N/A | `{"total_earnings": 1500.00}` | N/A | No | N/A | N/A | N/A | N/A |
| **`GET /api/v1/driver/payout-methods`** | Driver | JWT (Driver activo) | N/A | N/A | `{"payout_methods": [...]}` | N/A | No | N/A | N/A | N/A | N/A |
| **`POST /api/v1/driver/payout-methods`** | Driver | JWT (Driver activo) | N/A | `{"provider_type": "BANK_TRANSFER", "masked_value": "••••1234", "token_ref": "tok_xyz"}` | `{"method_id": "<UUID>"}` | `verification_status = PENDING` | Obligatoria | `INVALID_PAYOUT_METHOD` | `PAYOUT_METHOD_ADDED` | Email Confirmación | N/A |
| **`PATCH /api/v1/driver/payout-methods/{id}`** | Driver | JWT (Driver activo) | N/A | `{"is_active": false}` | `{"success": true}` | Desactivado (`is_active = false`) | Obligatoria | `METHOD_NOT_FOUND` | `PAYOUT_METHOD_DISABLED` | Email Alerta | N/A |
| **`GET /api/v1/driver/payouts/{id}`** | Driver | JWT | N/A | N/A | `{"payout": {...}}` | N/A | No | `PAYOUT_NOT_FOUND` | N/A | N/A | N/A |
| **`POST /api/v1/driver/payouts`** | Driver | JWT (Driver activo) | N/A | `{"payout_method_id": "<UUID>", "amount": 1000.00}` | `{"payout_id": "<UUID>", "status": "REQUESTED"}` | `REQUESTED` (en `payouts`) | Obligatoria | `INSUFFICIENT_BALANCE` | `PAYOUT_REQUESTED` | Push a Admin | Hold en Saldo Driver |

---

### 2.2 Dominio: Negocio (`apps/business-mobile`)

| Endpoint / Action | Actor | Auth / Authorization | Allowed Current State | Request Payload | Response Payload | Resulting State | Idempotency | Domain Errors | Events | Notifications | Financial Effects |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`POST /api/v1/businesses`** | Business Owner | JWT | N/A | `{"legal_name": "Empresa S.A.", "tax_id": "J031000"}` | `{"business_id": "<UUID>", "verification_status": "PENDING", "account_status": "ACTIVE"}` | `verification_status = PENDING`, `account_status = ACTIVE` | Obligatoria | `TAX_ID_EXISTS` | `BUSINESS_CREATED` | Push Admin | N/A |
| **`PATCH /api/v1/businesses/{id}`** | Business Owner | JWT | N/A | `{"brand_name": "Güegüense Store"}` | `{"success": true}` | Actualizado | Opcional | `UNAUTHORIZED_MEMBER` | N/A | N/A | N/A |
| **`POST /api/v1/businesses/{id}/locations`** | Business Manager | JWT (Scope N:M) | N/A | `{"name": "Sucursal Central", "address_text": "...", "lat": 12.13, "lng": -86.25}` | `{"location_id": "<UUID>"}` | Registrado en `business_locations` | Obligatoria | `INVALID_LOCATION` | `LOCATION_ADDED` | N/A | N/A |
| **`PATCH /api/v1/businesses/{id}/locations/{loc_id}`** | Business Manager | JWT (Scope N:M) | N/A | `{"name": "Sucursal Norte"}` | `{"success": true}` | Actualizado | Opcional | `UNAUTHORIZED_MEMBER` | N/A | N/A | N/A |
| **`POST /api/v1/businesses/{id}/members`** | Business Owner | JWT | N/A | `{"user_id": "<UUID>", "role": "business_employee", "location_ids": ["<UUID>"]}` | `{"member_id": "<UUID>"}` | Registrado en `business_members` | Obligatoria | `MEMBER_ALREADY_EXISTS` | `MEMBER_ADDED` | Email Invitación | N/A |
| **`PATCH /api/v1/businesses/{id}/members/{mem_id}`** | Business Owner | JWT | N/A | `{"role": "business_manager"}` | `{"success": true}` | Actualizado | Opcional | `UNAUTHORIZED_MEMBER` | N/A | N/A | N/A |
| **`DELETE /api/v1/businesses/{id}/members/{mem_id}`** | Business Owner | JWT | N/A | `{}` | `{"success": true}` | Revocado/Eliminado | Obligatoria | `CANNOT_REMOVE_OWNER` | `MEMBER_REMOVED` | Email Alerta | N/A |
| **`POST /api/v1/quotes`** | Business Member | JWT (Miembro activo en sucursal) | N/A | `{"location_id": "<UUID>", "dropoff_address": {...}, "package_type": "PARCEL"}` | `{"quote_id": "<UUID>", "quoted_total": 100.00}` | `QUOTED` (en `delivery_quotes`) | No | `INVALID_LOCATIONS`, `PRICING_UNAVAILABLE` | `QUOTE_CALCULATED` | N/A | N/A |
| **`POST /api/v1/deliveries`** | Business Member | JWT (Miembro activo en sucursal) | Quote status = `QUOTED` | `{"quote_id": "<UUID>"}` | `{"delivery_id": "<UUID>", "status": "SEARCHING_DRIVER"}` | `SEARCHING_DRIVER` | Obligatoria | `QUOTE_EXPIRED`, `INSUFFICIENT_FUNDS` | `QUOTE_CONSUMED`, `DELIVERY_CREATED` | Push a Flota Motorizados | Reserva de Fondos |
| **`GET /api/v1/deliveries/{id}`** | Business Member | JWT (Scope sucursal) | N/A | N/A | `{"delivery": {...}}` | N/A | No | N/A | N/A | N/A | N/A |
| **`GET /api/v1/businesses/{id}/deliveries`** | Business Member | JWT (Scope sucursal) | N/A | N/A | `{"deliveries": [...]}` | N/A | No | N/A | N/A | N/A | N/A |
| **`POST /api/v1/deliveries/{id}/confirm-pickup-custody`** | Business Employee | JWT (Miembro en sucursal) | `ARRIVED_PICKUP` | `{"pickup_code": "PK-8821"}` | `{"status": "PICKED_UP"}` | `PICKED_UP` | Obligatoria | `INVALID_PICKUP_CODE`, `UNAUTHORIZED_MEMBER` | `CUSTODY_TRANSFERRED` | Push a Conductor | N/A |
| **`POST /api/v1/deliveries/{id}/cancel`** | Business / Operator | JWT (Miembro u Operador) | `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP` | `{"reason": "CLIENT_CANCELED"}` | `{"status": "CANCELED"}` | `CANCELED` (Quote permanece `CONSUMED`) | Obligatoria | `CANNOT_CANCEL_IN_TRANSIT` | `DELIVERY_CANCELED` | Push a Conductor | Cancel Fee si aplica |
| **`POST /api/v1/support/tickets`** | Business Member | JWT | N/A | `{"delivery_id": "<UUID>", "category": "DELAY", "notes": "..."}` | `{"ticket_id": "<UUID>"}` | `OPEN` (en `support_tickets`) | Obligatoria | `INVALID_TICKET_CATEGORY` | `SUPPORT_TICKET_CREATED` | Push Admin | N/A |

---

### 2.3 Dominio: Tracking Web, Handoff, Devoluciones, Administración y Finanzas

| Endpoint / Action | Actor | Auth / Authorization | Allowed Current State | Request Payload | Response Payload | Resulting State | Idempotency | Domain Errors | Events | Notifications | Financial Effects |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`GET /api/v1/tracking/{token}`** | Tracking Holder | Bearer Tracking Token | Estado Activo / Terminal | N/A | Snapshot Delivery DTO | Snapshot | No | `INVALID_TRACKING_TOKEN`, `TOKEN_EXPIRED` | N/A | N/A | N/A |
| **`GET /api/v1/tracking/{token}/otp`** | Tracking Holder | Bearer Tracking Token | `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF` | N/A | `{"otp": "123456"}` | OTP Visible | No | `OTP_UNAVAILABLE_STATE`, `TOKEN_EXPIRED` | N/A | N/A | N/A |
| **`POST /api/v1/deliveries/{id}/return/authorize`** | Operator / Admin | JWT (Rol Operator/Admin) | `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF` | `{"reason": "RECIPIENT_REFUSED"}` | `{"status": "RETURN_REQUIRED"}` | `RETURN_REQUIRED` | Obligatoria | `INVALID_DELIVERY_STATE` | `RETURN_REQUIRED`, `RETURN_AUTHORIZED` | Push a Negocio y Conductor | Return Fee Generado |
| **`POST /api/v1/deliveries/{id}/return/confirm`** | Business Employee | JWT (Miembro en sucursal) | `RETURNING` | `{}` | `{"status": "RETURNED"}` | `RETURNED` | Obligatoria | `UNAUTHORIZED_MEMBER` | `RETURN_COMPLETED`, `CUSTODY_RETURNED` | Push a Conductor y Admin | Return Fee Debitado |
| **`POST /api/v1/admin/handoffs`** | Operator / Admin | JWT (Rol Operator/Admin) | `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF` | `{"delivery_id": "<UUID>", "from_driver_id": "...", "to_driver_id": "...", "reason": "..."}` | `{"handoff_id": "<UUID>", "status": "INITIATED"}` | `INITIATED` (Crea y autoriza el handoff) | Obligatoria | `INVALID_HANDOFF_DRIVERS` | `HANDOFF_STARTED` | Push a Ambos Conductores | Split Fee Evaluado |
| **`POST /api/v1/handoffs/{id}/confirm-from`** | From Driver | JWT (From Driver) | `INITIATED` | `{}` | `{"status": "CONFIRMED_FROM"}` | `CONFIRMED_FROM` | Obligatoria | `UNAUTHORIZED_DRIVER` | `HANDOFF_CONFIRMED_FROM` | Push a To Driver | N/A |
| **`POST /api/v1/handoffs/{id}/confirm-to`** | To Driver | JWT (To Driver) | `CONFIRMED_FROM` | `{}` | `{"status": "COMPLETED"}` | `COMPLETED` (Finaliza handoff atómicamente) | Obligatoria | `UNAUTHORIZED_DRIVER` | `HANDOFF_COMPLETED` | Push a Admin | Split Fee Ejecutado |
| **`POST /api/v1/admin/handoffs/{id}/abort`** | Operator / Admin | JWT (Rol Operator/Admin) | `INITIATED`, `CONFIRMED_FROM` | `{"reason": "DRIVER_UNAVAILABLE"}` | `{"status": "ABORTED"}` | `ABORTED` | Obligatoria | `HANDOFF_ALREADY_COMPLETED` | `HANDOFF_ABORTED` | Push a Conductores | N/A |
| **`GET /api/v1/admin/verifications/drivers`** | Verification Agent | JWT (Agent/Admin) | N/A | N/A | `{"pending_drivers": [...]}` | N/A | No | N/A | N/A | N/A | N/A |
| **`POST /api/v1/admin/drivers/{id}/approve`** | Verification Agent | JWT (Agent/Admin) | `PENDING`, `UNDER_REVIEW` | `{}` | `{"verification_status": "VERIFIED"}` | `verification_status = VERIFIED` | Obligatoria | `DOCUMENTATION_INCOMPLETE` | `DRIVER_VERIFIED` | Push a Conductor | N/A |
| **`POST /api/v1/admin/drivers/{id}/reject`** | Verification Agent | JWT (Agent/Admin) | `PENDING`, `UNDER_REVIEW` | `{"reason": "INVALID_DOCUMENTS"}` | `{"verification_status": "REJECTED"}` | `verification_status = REJECTED` | Obligatoria | `REASON_REQUIRED` | `DRIVER_REJECTED` | Push a Conductor | N/A |
| **`POST /api/v1/admin/drivers/{id}/suspend`** | Operator / Admin | JWT (Operator/Admin) | `ACTIVE` | `{"reason": "CONDUCT_VIOLATION"}` | `{"account_status": "SUSPENDED"}` | `account_status = SUSPENDED` | Obligatoria | `REASON_REQUIRED` | `DRIVER_SUSPENDED` | Push a Conductor | Rebotan nuevas ofertas |
| **`POST /api/v1/admin/drivers/{id}/reactivate`** | Admin | JWT (Rol Admin) | `SUSPENDED` | `{"reason": "SANCTION_COMPLETED"}` | `{"account_status": "ACTIVE"}` | `account_status = ACTIVE` | Obligatoria | `REASON_REQUIRED` | `DRIVER_REACTIVATED` | Push a Conductor | Habilita ofertas |
| **`POST /api/v1/admin/businesses/{id}/suspend`** | Admin | JWT (Rol Admin + MFA) | `ACTIVE` | `{"reason": "NON_PAYMENT"}` | `{"account_status": "SUSPENDED"}` | `account_status = SUSPENDED` | Obligatoria | `REASON_REQUIRED` | `BUSINESS_SUSPENDED` | Email a Comercio | Rebotan nuevas quotes |
| **`POST /api/v1/admin/businesses/{id}/reactivate`** | Admin | JWT (Rol Admin + MFA) | `SUSPENDED` | `{"reason": "PAYMENT_RECEIVED"}` | `{"account_status": "ACTIVE"}` | `account_status = ACTIVE` | Obligatoria | `REASON_REQUIRED` | `BUSINESS_REACTIVATED` | Email a Comercio | Habilita quotes |
| **`GET /api/v1/admin/operations/active`** | Operator / Admin | JWT (Operator/Admin) | N/A | N/A | `{"active_operations": [...]}` | N/A | No | N/A | N/A | N/A | N/A |
| **`POST /api/v1/admin/incidents/{id}/resolve`** | Operator / Admin | JWT (Operator/Admin) | `OPEN`, `UNDER_INVESTIGATION` | `{"resolution": "RESOLVED_CONTINUE", "notes": "..."}` | `{"status": "CLOSED"}` | `INCIDENT_STATUS = CLOSED` | Obligatoria | `INCIDENT_ALREADY_CLOSED` | `INCIDENT_RESOLVED_ADMIN` | Push a Involucrados | Ajuste tarifario si aplica |
| **`POST /api/v1/admin/deliveries/{id}/force-cancel`** | Operator / Admin | JWT (Operator/Admin) | `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP` | `{"reason": "OPERATIONAL_EMERGENCY"}` | `{"status": "CANCELED"}` | `CANCELED` (Solo pre-custodia) | Obligatoria | `CANNOT_CANCEL_IN_TRANSIT`, `REASON_REQUIRED` | `DELIVERY_FORCE_CANCELED` | Push a Involucrados y Audit | Reversión de Fondos |
| **`POST /api/v1/admin/pricing/versions/activate`** | Admin | JWT (Rol Admin + MFA) | N/A | `{"pricing_version_id": "<UUID>"}` | `{"is_active": true}` | Activado | Obligatoria | `INVALID_PRICING_VERSION` | `PRICING_VERSION_ACTIVATED` | Audit log | Tarifa Global Cambiada |
| **`GET /api/v1/admin/payouts/{id}`** | Admin | JWT (Rol Admin) | N/A | N/A | `{"payout": {...}}` | N/A | No | `PAYOUT_NOT_FOUND` | N/A | N/A | N/A |
| **`POST /api/v1/admin/payouts/{id}/approve`** | Admin | JWT (Rol Admin + MFA si > C$5,000 policy) | `REQUESTED` / `UNDER_REVIEW` | `{"reason": "AUDITED_PAYOUT"}` | `{"status": "APPROVED"}` | `status = APPROVED` (No salta a PAID) | Obligatoria | `PAYOUT_ALREADY_PROCESSED` | `PAYOUT_APPROVED` | Push a Conductor | N/A |
| **`POST /api/v1/admin/payouts/{id}/reject`** | Admin | JWT (Rol Admin + MFA) | `REQUESTED` / `UNDER_REVIEW` | `{"reason": "INVALID_BANK_DETAILS"}` | `{"status": "REJECTED"}` | `status = REJECTED` | Obligatoria | `PAYOUT_ALREADY_PROCESSED` | `PAYOUT_REJECTED` | Push a Conductor | Libera Hold en Saldo |
| **`POST /api/v1/admin/cash-settlements`** | Admin | JWT (Rol Admin) | N/A | `{"driver_id": "<UUID>", "settled_amount": 500.00}` | `{"status": "SETTLED"}` | `status = SETTLED` (en `cash_settlements`) | Obligatoria | `CASH_DISCREPANCY_UNRESOLVED` | `CASH_SETTLED` | Email a Conductor | Journal Entry Cash |
| **`GET /api/v1/admin/audit`** | SuperAdmin | JWT (Rol SuperAdmin) | N/A | N/A | `{"audit_logs": [...]}` | N/A | No | N/A | N/A | N/A | N/A |
| **`GET /api/v1/admin/ledger/transactions`** | Admin | JWT (Rol Admin) | N/A | N/A | `{"transactions": [...]}` | N/A | No | N/A | N/A | N/A | N/A |
| **`GET /api/v1/admin/ledger/accounts/{id}`** | Admin | JWT (Rol Admin) | N/A | N/A | `{"account": {...}}` | N/A | No | `ACCOUNT_NOT_FOUND` | N/A | N/A | N/A |
| **`GET /api/v1/payments/{id}`** | Business Member | JWT (Scope sucursal) | N/A | N/A | `{"payment": {...}}` | N/A | No | `PAYMENT_NOT_FOUND` | N/A | N/A | N/A |
| **`POST /api/v1/payments`** | Business Owner | JWT | N/A | `{"amount": 5000.00}` | `{"payment_id": "<UUID>", "status": "PENDING"}` | `PENDING` (en `payments`) | Obligatoria | `INVALID_PAYMENT_AMOUNT` | `PAYMENT_INITIATED` | Webhook Pasarela | Saldo Prepagado |
| **`POST /api/v1/payments/confirm`** | System / Webhook | HMAC Signature / Idempotency Key | `PENDING` | `{"provider_ref": "ref_9921"}` | `{"status": "CAPTURED"}` | `CAPTURED` (en `payments`) | Obligatoria | `INVALID_WEBHOOK_SIGNATURE` | `PAYMENT_CAPTURED` | Email a Comercio | Crédito Saldo Comercio |
