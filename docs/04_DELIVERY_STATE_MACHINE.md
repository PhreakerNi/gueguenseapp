# 04 — MÁQUINA DE ESTADOS Y SUBSISTEMAS DE ENTREGA (DELIVERY STATE MACHINE)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Matriz Formal de Transiciones de Estado con 11 Atributos, Quote vs Delivery Lifecycle e Incidentes  

---

## 1. Ciclos de Vida Separados

Güegüense diferencia el **Quote Lifecycle** del **Delivery Lifecycle**:
* **Quote Lifecycle:** `DRAFT` $\rightarrow$ `QUOTED` $\rightarrow$ `CONSUMED` (o `EXPIRED` / `CANCELED`).
* **Delivery Lifecycle:** `SEARCHING_DRIVER` $\rightarrow$ `DRIVER_ASSIGNED` $\rightarrow$ `TO_PICKUP` $\rightarrow$ `ARRIVED_PICKUP` $\rightarrow$ `PICKED_UP` $\rightarrow$ `TO_DROPOFF` $\rightarrow$ `ARRIVED_DROPOFF` $\rightarrow$ `DELIVERED`.
* **Return Sub-cycle:** `RETURN_REQUIRED` $\rightarrow$ `RETURNING` $\rightarrow$ `RETURNED`.
* **Terminal States:** `DELIVERED`, `RETURNED`, `CANCELED`, `FAILED`.

---

## 2. MATRIZ FORMAL CANÓNICA DE TRANSICIONES DE ESTADO (11 ATRIBUTOS POR FILA)

| FROM | TO | ACTOR | TRIGGER | PRECONDITIONS | SERVER_VALIDATIONS | EVENTS | SIDE_EFFECTS | NOTIFICATIONS | IDEMPOTENCY | DOMAIN_ERRORS |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **DRAFT** | **QUOTED** | Business Member / System | Request Quote | Pickup & Dropoff valid coords. | Calculate distance/pricing version. | `QUOTE_CALCULATED` | Quote record created, `expires_at` set (5m). | N/A | No | `INVALID_LOCATIONS`, `PRICING_UNAVAILABLE` |
| **QUOTED** | **CONSUMED** | Business Member | Confirm Quote | Quote status = `QUOTED` & not expired. | Idempotency Key checked, Balance/Credit valid. | `QUOTE_CONSUMED`, `DELIVERY_CREATED` | Delivery created in `SEARCHING_DRIVER`. | Driver Fleet Alert | Obligatoria | `QUOTE_EXPIRED`, `QUOTE_ALREADY_CONSUMED` |
| **QUOTED** | **EXPIRED** | System | Expire Timeout | Quote status = `QUOTED` & `now() > expires_at`. | Background job checks timestamp. | `QUOTE_EXPIRED` | Quote disabled for consumption. | N/A | No | N/A |
| **QUOTED** | **CANCELED** | Business Member | Cancel Draft | Quote status = `QUOTED`. | User owns quote. | `QUOTE_CANCELED` | Quote marked canceled. | N/A | Obligatoria | `INVALID_QUOTE_STATE` |
| **CREATE** | **SEARCHING_DRIVER** | Business Member | Create Delivery | Valid consumed quote. | Idempotency checked. | `DELIVERY_CREATED`, `SEARCH_STARTED` | Dispatch Engine round 1 initiated. | Push/Realtime to nearby drivers | Obligatoria | `INSUFFICIENT_FUNDS`, `DUPLICATE_REQUEST` |
| **SEARCHING_DRIVER** | **DRIVER_ASSIGNED** | Driver (vía Stored Proc) | Accept Offer | Driver active count = 0, Offer = `OPEN`. | Driver verified & active, `driver_presence` locked. | `OFFER_ACCEPTED`, `DRIVER_ASSIGNED` | Offer = `ACCEPTED`, Presence = `BUSY`, Other offers = `CANCELED`. | Business Push/Socket | Obligatoria | `OFFER_EXPIRED`, `DRIVER_ALREADY_BUSY`, `DELIVERY_TAKEN` |
| **DRIVER_ASSIGNED** | **TO_PICKUP** | Driver | Iniciar Ruta | Delivery = `DRIVER_ASSIGNED`. | Driver matches `driver_id`. | `TO_PICKUP_STARTED` | Navigation route loaded. | Business Socket | Opcional | `INVALID_DELIVERY_STATE` |
| **TO_PICKUP** | **ARRIVED_PICKUP** | Driver | Avisar Llegada | Delivery = `TO_PICKUP`. | Driver location within radius of business location. | `ARRIVED_PICKUP` | Backend generates `pickup_code_digest` in `private.secrets`. | Business Push/Socket | Opcional | `LOCATION_OUT_OF_RANGE` |
| **ARRIVED_PICKUP** | **PICKED_UP** | Business Employee | Confirm Custody | Delivery = `ARRIVED_PICKUP`. | Digest matches `pickup_code_digest`, Member scope valid. | `CUSTODY_TRANSFERRED` | Custody transferred, `pickup_code` invalidated. | Driver Push/Socket | Obligatoria | `INVALID_PICKUP_CODE`, `UNAUTHORIZED_MEMBER` |
| **PICKED_UP** | **TO_DROPOFF** | Driver | Iniciar Ruta Cliente | Delivery = `PICKED_UP`. | Driver matches `driver_id`. | `TO_DROPOFF_STARTED` | Navigation to dropoff loaded. | Customer SMS/Tracking | Opcional | `INVALID_DELIVERY_STATE` |
| **TO_DROPOFF** | **ARRIVED_DROPOFF** | Driver | Avisar Llegada | Delivery = `TO_DROPOFF`. | Driver location within radius of dropoff location. | `ARRIVED_DROPOFF` | `DELIVERY_OTP` activated for customer tracking view. | Customer SMS/Push | Opcional | `LOCATION_OUT_OF_RANGE` |
| **ARRIVED_DROPOFF** | **DELIVERED** | Driver | Verify OTP | Delivery = `ARRIVED_DROPOFF`. | Submitted OTP hash matches `otp_digest` & attempts < 3. | `OTP_VERIFIED`, `DELIVERY_COMPLETED` | Ledger transaction executed, Driver earning credited. | Business & Customer Push | Obligatoria | `INVALID_OTP`, `OTP_LOCKED`, `MAX_ATTEMPTS_EXCEEDED` |
| **DRIVER_ASSIGNED** | **SEARCHING_DRIVER** | Driver (Pre-Pickup) | Cancel Acceptance | Delivery status = `DRIVER_ASSIGNED`. | Physical custody NOT transferred. | `DRIVER_UNASSIGNED`, `SEARCH_STARTED` | Driver unassigned (`driver_id = NULL`), penalty logged. | Business Push/Socket | Obligatoria | `CUSTODY_ALREADY_TRANSFERRED` |
| **TO_PICKUP** | **SEARCHING_DRIVER** | Driver (Pre-Pickup) | Cancel Acceptance | Delivery status = `TO_PICKUP`. | Physical custody NOT transferred. | `DRIVER_UNASSIGNED`, `SEARCH_STARTED` | Driver unassigned (`driver_id = NULL`), penalty logged. | Business Push/Socket | Obligatoria | `CUSTODY_ALREADY_TRANSFERRED` |
| **ARRIVED_PICKUP** | **SEARCHING_DRIVER** | Driver (Pre-Pickup) | Cancel Acceptance | Delivery status = `ARRIVED_PICKUP`. | Physical custody NOT transferred (`PICKED_UP` not reached). | `DRIVER_UNASSIGNED`, `SEARCH_STARTED` | Driver unassigned (`driver_id = NULL`), penalty logged. | Business Push/Socket | Obligatoria | `CUSTODY_ALREADY_TRANSFERRED` |
| **PICKED_UP** | **RETURN_REQUIRED** | Operator / System | Ordenar Devolución | Custody transferred & dropoff unreachable/refused. | Active incident resolved as `RESOLVED_RETURN`. | `RETURN_REQUIRED`, `RETURN_AUTHORIZED` | Return adjustment fee calculated. | Business & Driver Push | Obligatoria | `INVALID_DELIVERY_STATE` |
| **TO_DROPOFF** | **RETURN_REQUIRED** | Operator / System | Ordenar Devolución | Custody transferred & dropoff unreachable/refused. | Active incident resolved as `RESOLVED_RETURN`. | `RETURN_REQUIRED`, `RETURN_AUTHORIZED` | Return adjustment fee calculated. | Business & Driver Push | Obligatoria | `INVALID_DELIVERY_STATE` |
| **ARRIVED_DROPOFF** | **RETURN_REQUIRED** | Operator / System | Ordenar Devolución | Custody transferred & dropoff unreachable/refused. | Active incident resolved as `RESOLVED_RETURN`. | `RETURN_REQUIRED`, `RETURN_AUTHORIZED` | Return adjustment fee calculated. | Business & Driver Push | Obligatoria | `INVALID_DELIVERY_STATE` |
| **RETURN_REQUIRED** | **RETURNING** | Driver | Iniciar Retorno | Delivery = `RETURN_REQUIRED`. | Driver matches `driver_id`. | `RETURN_STARTED` | Navigation to business location opened. | Business Socket | Opcional | `INVALID_DELIVERY_STATE` |
| **RETURNING** | **RETURNED** | Business Employee | Recibir Devolución | Delivery = `RETURNING`. | Business member confirms physical return. | `RETURN_COMPLETED`, `CUSTODY_RETURNED` | Delivery status = `RETURNED`, Custody closed. | Admin & Driver Push | Obligatoria | `UNAUTHORIZED_MEMBER` |
| **SEARCHING_DRIVER** | **CANCELED** | Business Member | Cancel Pre-Pickup | Delivery = `SEARCHING_DRIVER`. | Physical custody NOT transferred. | `DELIVERY_CANCELED` | Search aborted, quote canceled. | Fleet Socket | Obligatoria | `CANNOT_CANCEL_IN_TRANSIT` |
| **DRIVER_ASSIGNED** | **CANCELED** | Business Member | Cancel Pre-Pickup | Delivery = `DRIVER_ASSIGNED`. | Physical custody NOT transferred. | `DELIVERY_CANCELED` | Driver unassigned, cancel fee evaluated. | Driver Push/Socket | Obligatoria | `CANNOT_CANCEL_IN_TRANSIT` |
| **TO_PICKUP** | **CANCELED** | Business Member | Cancel Pre-Pickup | Delivery = `TO_PICKUP`. | Physical custody NOT transferred. | `DELIVERY_CANCELED` | Driver unassigned, cancel fee evaluated. | Driver Push/Socket | Obligatoria | `CANNOT_CANCEL_IN_TRANSIT` |
| **ARRIVED_PICKUP** | **CANCELED** | Business Member | Cancel Pre-Pickup | Delivery = `ARRIVED_PICKUP`. | Physical custody NOT transferred (`PICKED_UP` not reached). | `DELIVERY_CANCELED` | Driver unassigned, cancel fee evaluated. | Driver Push/Socket | Obligatoria | `CUSTODY_ALREADY_TRANSFERRED` |
| **SEARCHING_DRIVER** | **FAILED** | System | Terminal Failure | Max search rounds reached (2h timeout). | No drivers available after max retries. | `DELIVERY_FAILED` | Delivery marked failed, no pending custody. | Business Push | Obligatoria | `INVALID_DELIVERY_STATE` |

---

## 3. Sub-sistema Independiente de Incidentes (`incidents`)

* **`INCIDENT_TYPE` Canónico:** `VEHICLE_BREAKDOWN`, `ACCIDENT`, `GPS_LOST`, `NETWORK_LOST`, `PACKAGE_DAMAGED`, `BUSINESS_CLOSED`, `PACKAGE_NOT_READY`, `CUSTOMER_UNREACHABLE`, `RECIPIENT_REFUSED`, `ADDRESS_PROBLEM`, `PAYMENT_PROBLEM`, `CASH_MISMATCH`, `SAFETY_ISSUE`, `OTHER`.
* **`INCIDENT_STATUS` Canónico:** `OPEN`, `UNDER_INVESTIGATION`, `RESOLVED_CONTINUE`, `RESOLVED_RETURN`, `RESOLVED_HANDOFF`, `CLOSED`.
