# 04 — MÁQUINA DE ESTADOS Y SUBSISTEMAS DE ENTREGA (DELIVERY STATE MACHINE)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Matriz Formal de Transiciones de Estado, Quote vs Delivery Lifecycle e Incidentes  

---

## 1. Ciclos de Vida Separados

Güegüense diferencia el **Quote Lifecycle** del **Delivery Lifecycle**:
* **Quote Lifecycle:** `DRAFT` $\rightarrow$ `QUOTED` $\rightarrow$ `CONSUMED` (o `EXPIRED` / `CANCELED`).
* **Delivery Lifecycle:** `SEARCHING_DRIVER` $\rightarrow$ `DRIVER_ASSIGNED` $\rightarrow$ `TO_PICKUP` $\rightarrow$ `ARRIVED_PICKUP` $\rightarrow$ `PICKED_UP` $\rightarrow$ `TO_DROPOFF` $\rightarrow$ `ARRIVED_DROPOFF` $\rightarrow$ `DELIVERED`.
* **Return Sub-cycle:** `RETURN_REQUIRED` $\rightarrow$ `RETURNING` $\rightarrow$ `RETURNED`.
* **Terminal States:** `DELIVERED`, `RETURNED`, `CANCELED`, `FAILED`.

---

## 2. MATRIZ FORMAL CANÓNICA DE TRANSICIONES DE ESTADO

| Transition (FROM $\rightarrow$ TO) | Actor Autorizado | Trigger / Action | Preconditions | Server Validations | Events Emitted | Side Effects | Idempotency | Errors Possible |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **CREATE $\rightarrow$ SEARCHING_DRIVER** | Business Member / System | Confirm Quote | Quote status = `QUOTED` & not expired. | Idempotency key checked, Quote consumed. | `DELIVERY_CREATED`, `SEARCH_STARTED` | Quote status = `CONSUMED`, dispatch round initiated. | Obligatoria | `QUOTE_EXPIRED`, `QUOTE_ALREADY_CONSUMED` |
| **SEARCHING_DRIVER $\rightarrow$ DRIVER_ASSIGNED** | Driver (vía Stored Proc) | Accept Offer | Driver active count = 0, Offer status = `OPEN`. | Driver verified & active, Offer not expired, Delivery unassigned. | `OFFER_ACCEPTED`, `DRIVER_ASSIGNED` | Atomic DB lock, Offer = `ACCEPTED`, Presence = `BUSY`. | Obligatoria | `OFFER_EXPIRED`, `DRIVER_ALREADY_BUSY`, `DELIVERY_TAKEN` |
| **DRIVER_ASSIGNED $\rightarrow$ TO_PICKUP** | Driver | Iniciar Ruta | Delivery = `DRIVER_ASSIGNED`. | Driver matches `driver_id`. | `TO_PICKUP_STARTED` | Delivery status updated. | Opcional | `INVALID_DELIVERY_STATE` |
| **TO_PICKUP $\rightarrow$ ARRIVED_PICKUP** | Driver | Avisar Llegada | Delivery = `TO_PICKUP`. | Driver location within radius of business location. | `ARRIVED_PICKUP` | Backend generates `PICKUP_CODE` in `private.secrets`. | Opcional | `LOCATION_OUT_OF_RANGE` |
| **ARRIVED_PICKUP $\rightarrow$ PICKED_UP** | Business Employee | Confirm Custody | Delivery = `ARRIVED_PICKUP`. | Digest matches `pickup_code_digest`, Member belongs to business. | `CUSTODY_TRANSFERRED` | Custody transferred, `pickup_code` invalidated. | Obligatoria | `INVALID_PICKUP_CODE`, `UNAUTHORIZED_MEMBER` |
| **PICKED_UP $\rightarrow$ TO_DROPOFF** | Driver | Iniciar Ruta Cliente | Delivery = `PICKED_UP`. | Driver matches `driver_id`. | `TO_DROPOFF_STARTED` | Delivery status updated. | Opcional | `INVALID_DELIVERY_STATE` |
| **TO_DROPOFF $\rightarrow$ ARRIVED_DROPOFF** | Driver | Avisar Llegada | Delivery = `TO_DROPOFF`. | Driver location within radius of dropoff location. | `ARRIVED_DROPOFF` | SMS/Push with OTP sent to recipient. | Opcional | `LOCATION_OUT_OF_RANGE` |
| **ARRIVED_DROPOFF $\rightarrow$ DELIVERED** | Driver | Verify OTP | Delivery = `ARRIVED_DROPOFF`. | Submitted OTP hash matches `otp_digest` & attempts < 3. | `OTP_VERIFIED`, `DELIVERY_COMPLETED` | Ledger transaction executed, Driver earning credited. | Obligatoria | `INVALID_OTP`, `OTP_LOCKED`, `MAX_ATTEMPTS_EXCEEDED` |
| **PICKED_UP / TO_DROPOFF $\rightarrow$ RETURN_REQUIRED** | Operator / System | Ordenar Devolución | Custody transferred & recipient unreachable/refused. | Active incident resolved as `RESOLVED_RETURN`. | `RETURN_REQUIRED` | Return adjustment fee calculated. | Obligatoria | `INVALID_DELIVERY_STATE` |
| **RETURN_REQUIRED $\rightarrow$ RETURNING** | Driver | Iniciar Retorno | Delivery = `RETURN_REQUIRED`. | Driver matches `driver_id`. | `RETURN_STARTED` | Navigation to business location opened. | Opcional | `INVALID_DELIVERY_STATE` |
| **RETURNING $\rightarrow$ RETURNED** | Business Employee | Recibir Devolución | Delivery = `RETURNING`. | Business member confirms physical return. | `RETURN_COMPLETED` | Delivery status = `RETURNED`, Custody closed. | Obligatoria | `UNAUTHORIZED_MEMBER` |
| **DRIVER_ASSIGNED $\rightarrow$ SEARCHING_DRIVER** | Driver (Pre-Pickup) | Cancel Acceptance | Delivery status IN (`DRIVER_ASSIGNED`, `TO_PICKUP`). | Physical custody NOT transferred. | `DRIVER_UNASSIGNED`, `SEARCH_STARTED` | Driver unassigned (`driver_id = NULL`), penalty logged. | Obligatoria | `CUSTODY_ALREADY_TRANSFERRED` |

---

## 3. Sub-sistema Independiente de Incidentes (`incidents`)

Los imprevistos en ruta **NO** alteran el enum `DELIVERY_STATUS` a valores ambiguos. Se registran en `incidents`:
* **`INCIDENT_TYPE` Canónico:** `VEHICLE_BREAKDOWN`, `ACCIDENT`, `GPS_LOST`, `NETWORK_LOST`, `PACKAGE_DAMAGED`, `BUSINESS_CLOSED`, `PACKAGE_NOT_READY`, `CUSTOMER_UNREACHABLE`, `RECIPIENT_REFUSED`, `ADDRESS_PROBLEM`, `PAYMENT_PROBLEM`, `CASH_MISMATCH`, `SAFETY_ISSUE`, `OTHER`.
* **`INCIDENT_STATUS` Canónico:** `OPEN`, `UNDER_INVESTIGATION`, `RESOLVED_CONTINUE`, `RESOLVED_RETURN`, `RESOLVED_HANDOFF`, `CLOSED`.
