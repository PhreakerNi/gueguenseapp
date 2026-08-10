# 17 — ESTRATEGIA DE PRUEBAS Y CALIDAD (TESTING STRATEGY)

**Proyecto:** Güegüense  
**Versión:** 1.5.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Estrategia de Pruebas Ampliada, Concurrencia Dual, RLS, Custodia, Ledger y Resiliencia  

---

## 1. Cobertura y Foco de Calidad

* **Lógica Crítica de Dominio:** Cobertura exhaustiva de máquina de estados, scoring de despacho, motor de precios y ledger contable.
* **Invariantes Arquitectónicas Absolutas:** Cobertura del **100% de los escenarios e invariantes críticas de seguridad, concurrencia y custodia**.

---

## 2. Catálogo Ampliado de Escenarios de Prueba Obligatorios

### 2.1 Pruebas de Máquina de Estados (State Machine)
* **Valid Transitions:** Verificar que la entrega avance en la secuencia exacta `SEARCHING_DRIVER` $\rightarrow$ `DRIVER_ASSIGNED` $\rightarrow$ `TO_PICKUP` $\rightarrow$ `ARRIVED_PICKUP` $\rightarrow$ `PICKED_UP` $\rightarrow$ `TO_DROPOFF` $\rightarrow$ `ARRIVED_DROPOFF` $\rightarrow$ `DELIVERED`.
* **Forbidden Transitions:** Verificar rechazo de saltos inválidos (ej: `TO_PICKUP` $\rightarrow$ `DELIVERED` o `DRAFT` $\rightarrow$ `DELIVERED`).
* **Cancellation Actors:** Validar que solo Business/Operator puedan cancelar pre-pickup, manteniendo el quote `status = CONSUMED`.
* **Return Transitions:** Validar que solo los estados post-custodia (`PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`) puedan avanzar a `RETURN_REQUIRED`.

### 2.2 Pruebas de Despacho (Dispatch Engine)
* **Stale GPS:** Validar error `STALE_DRIVER_LOCATION` al intentar aceptar una oferta con GPS desactualizado (> 3 min).
* **Suspended Driver:** Validar descarte de conductores inactivos/suspendidos en la selección Top-N.
* **Offer Expiry:** Verificar expiración automática tras 15s y re-emisión a siguiente candidato.
* **Top-N Fallback:** Validar que si Routes API falla para el Top-N, se reintente sin facturar en Haversine.
* **Same Driver / Two Deliveries:** Validar rechazo (`DRIVER_ALREADY_BUSY`) al intentar adjudicar dos viajes activos.
* **Two Drivers / Same Delivery:** Validar adjudicación atómica (`1 200 OK`, `1 409 Conflict`) en ofertas paralelas.

### 2.3 Pruebas de Seguridad y RLS Policies
* **Cross-Business Isolation:** Validar que un usuario de Empresa A no pueda leer entregas ni miembros de Empresa B.
* **Business Member Locations N:M:** Validar que gerentes/empleados solo accedan a sucursales autorizadas en `business_member_locations`.
* **Driver Own Records:** Validar que los conductores solo lean sus propias ofertas y expediente.
* **Private Schemas Inaccessible:** Validar rechazo de peticiones REST directas a `private.delivery_secrets` y `private.tracking_tokens`.
* **Admin Roles:** Validar que solo `super_admin` acceda a `audit_logs` inmutables.

### 2.4 Pruebas de OTP, Custodia y Finanzas
* **OTP State Visibility:** Validar que `GET /api/v1/tracking/{token}/otp` exponga el OTP **únicamente** en `PICKED_UP`, `TO_DROPOFF` y `ARRIVED_DROPOFF`, y lo oculte en `OTP_DISALLOWED_STATES` y terminales.
* **No Raw OTP:** Validar que Business, Driver y Admin nunca puedan leer el OTP en plano por API.
* **Pickup Business Confirmation:** Validar que solo el negocio/operador pueda confirmar custodia pasando a `PICKED_UP` mediante `pickup_code_digest`.
* **Driver Cannot Self-Confirm:** Validar que los endpoints del motorizado rechacen auto-confirmaciones de pickup.
* **Ledger Zero-Sum:** Validar que todos los asientos (`DELIVERY_SETTLEMENT`, `WAITING_FEE`, `REFUND`, `MANUAL_ADJUSTMENT`, `CASH_SETTLEMENT`, `DRIVER_PAYOUT`) cumplan $\sum \text{amount} = 0$.

### 2.5 Pruebas de Resiliencia y Fallos
* **App Killed:** Validar marcado de frescura `STALE/UNAVAILABLE` y alertas al cesar transmisiones GPS.
* **Push Lost / Realtime Lost:** Validar que la App Driver resincronice estado en vivo mediante polling REST (`GET /active`).
* **Duplicate Webhook:** Validar descarte por `idempotency_keys`.
