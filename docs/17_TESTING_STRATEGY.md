# 17 — ESTRATEGIA DE PRUEBAS Y CALIDAD (TESTING STRATEGY)

**Proyecto:** Güegüense  
**Versión:** 1.6.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Estrategia de Pruebas Ampliada, Ingesta GPS Validada, Idempotencia No Humana y Estados Financieros

---

## 1. Cobertura y Foco de Calidad

- **Lógica Crítica de Dominio:** Cobertura exhaustiva de máquina de estados, scoring de despacho, motor de precios y ledger contable.
- **Invariantes Arquitectónicas Absolutas:** Cobertura del **100% de los escenarios e invariantes críticas de seguridad, concurrencia, custodia e ingesta GPS**.

---

## 2. Catálogo Ampliado de Escenarios de Prueba Obligatorios (v1.6)

### 2.1 Pruebas de Ingesta GPS & Seguridad RLS (Bloqueo O Requerido)

- **Driver Location Ingestion Bypass Attempt:** Validar que una petición REST directa de un conductor intentando modificar `driver_presence.current_location` o `delivery_tracking_points` sea **rechazada por las políticas RLS**.
- **Tracking Token Direct GPS Read Attempt:** Validar que la consulta directa del cliente anónimo a `delivery_tracking_points` sea **denegada por RLS** (acceso únicamente vía DTOs filtrados desde el backend).

### 2.2 Pruebas de Idempotencia y Actors No Humanos

- **Webhook Idempotency Without Auth User:** Validar que peticiones de webhook recibidas con `actor_type = 'WEBHOOK'` se registren e identifiquen correctamente en `idempotency_keys` sin requerir `auth.users` actor UUID.
- **Idempotency Key Fingerprint Mismatch:** Validar que la re-utilización de una misma `Idempotency-Key` con un `request_fingerprint` diferente retorne un error de dominio (`422 UNPROCESSABLE ENTITY / IDEMPOTENCY_FINGERPRINT_MISMATCH`).

### 2.3 Pruebas de Estados Financieros y Registro Canónico de Eventos

- **Payout Approval State Separation:** Validar que la acción `POST /admin/payouts/{id}/approve` coloque la solicitud en estado `APPROVED` y **NUNCA salte directamente al estado terminal `PAID`**.
- **Canonical Event Registry Validation:** Validar que el 100% de los eventos emitidos por endpoints API existan formalmente en la lista de `EVENT_TYPE` de `21_CANONICAL_ENUMS.md`.

### 2.4 Pruebas de Máquina de Estados, Despacho y Custodia

- **State Machine Transitions:** Validar la secuencia `SEARCHING_DRIVER` $\rightarrow$ `DRIVER_ASSIGNED` $\rightarrow$ `TO_PICKUP` $\rightarrow$ `ARRIVED_PICKUP` $\rightarrow$ `PICKED_UP` $\rightarrow$ `TO_DROPOFF` $\rightarrow$ `ARRIVED_DROPOFF` $\rightarrow$ `DELIVERED`.
- **Stale GPS in Accept:** Validar error `STALE_DRIVER_LOCATION` al intentar aceptar una oferta con GPS desactualizado (> 3 min initial default / configurable policy).
- **OTP State Visibility:** Validar que `GET /api/v1/tracking/{token}/otp` exponga el OTP **únicamente** en `OTP_ALLOWED_STATES` (`PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`) y lo deniegue en etapas de retorno o terminales.
- **Ledger Zero-Sum:** Validar que todos los asientos cumplan $\sum \text{amount} = 0$.
