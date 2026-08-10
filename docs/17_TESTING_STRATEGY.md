# 17 — ESTRATEGIA DE PRUEBAS Y CALIDAD (TESTING STRATEGY)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Estrategia de Pruebas Ampliada, Concurrencia Dual, RLS, Custodia, Ledger y Resiliencia  

---

## 1. Cobertura y Foco de Calidad

* **Lógica Crítica de Dominio:** Cobertura exhaustiva de máquina de estados, scoring de despacho, motor de precios y ledger contable.
* **Invariantes Arquitectónicas Absolutas:** Cobertura del **100% de los escenarios e invariantes críticas de seguridad, concurrencia y custodia**.

---

## 2. Catálogo Ampliado de Escenarios de Prueba Obligatorios

### 2.1 Pruebas de Seguridad y Privacidad de Secretos
* **Business cannot retrieve OTP:** Verificar que las APIs de comercio no retornen el OTP en ningún DTO.
* **Admin cannot retrieve OTP:** Verificar que las vistas/APIs administrativas no retornen el OTP.
* **Driver cannot retrieve OTP:** Verificar que los endpoints del motorizado reboten cualquier intento de lectura de OTP.
* **Customer OTP Access:** Validar que `GET /api/v1/tracking/{token}/otp` sea el único punto que descifre el OTP durante estados autorizados (`PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`).
* **Payout Method Privacy:** Verificar que los métodos de retiro bancario no expongan cuentas en texto plano (`driver_payout_methods`).

### 2.2 Pruebas de Custodia y Concurrencia Dual
* **Pickup Business Confirmation:** Verificar que la transferencia de custodia a `PICKED_UP` solo ocurra cuando un miembro del negocio valide `pickup_code_digest`.
* **Driver cannot self-confirm pickup:** Verificar que los endpoints del conductor rechacen autopromociones a `PICKED_UP`.
* **Same driver two deliveries:** Verificar rechazo (`DRIVER_ALREADY_BUSY`) al intentar adjudicar una 2da entrega activa al mismo conductor.
* **Two drivers same delivery:** Verificar resolución atómica (`1 200 OK`, `1 409 Conflict`) cuando dos conductores aceptan la misma oferta en paralelo.
* **RETURNING blocks new offer:** Verificar que un conductor en estado `RETURNING` sea bloqueado de recibir/aceptar nuevas ofertas.
* **Suspended driver in custody:** Verificar que un conductor suspendido post-pickup solo pueda ejecutar el flujo de resolución de custodia (Devolución/Handoff).

### 2.3 Pruebas de Cotización, Ledger y Resiliencia
* **Request 1:N Quotes:** Validar que una solicitud pueda generar múltiples cotizaciones pero solo la consumida cree la entrega.
* **Ledger Sign Convention & Zero Sum:** Validar que todos los asientos cumplan la convención `+` Débito / `-` Crédito y $\sum \text{amount} = 0$.
* **App Killed / Location Stale:** Verificar marcado de frescura `STALE/UNAVAILABLE` y emisión de alerta en Admin cuando cesan pings GPS.
