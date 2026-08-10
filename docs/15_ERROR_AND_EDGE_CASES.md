# 15 — CATÁLOGO DE CASOS LÍMITE Y MANEJO DE ERRORES (ERROR & EDGE CASES)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Resiliencia, Custodia de Paquetes y Mitigación de Errores Operativos  

---

## 1. Catálogo Obligatorio de Casos Límite y Mitigación

### 1. NO_DRIVERS_AVAILABLE
* **Detección:** El Dispatch Engine no encuentra conductores elegibles en el radio inicial $R$.
* **Mitigación:** Ejecuta expansión progresiva de radio en rondas (+2km). Si tras 3 rondas (2 min) nadie acepta, la entrega pasa a espera y se genera una alerta visual/sonora en Admin para intervención telefónica. El negocio puede cancelar libremente sin cobro.

### 2. ALL_OFFERS_EXPIRED
* **Detección:** Los candidatos seleccionados dejan vencer la oferta (15s) sin responder.
* **Mitigación:** La oferta cambia a `EXPIRED`. El motorizado sufre una penalización leve de prioridad. El motor pasa al siguiente candidato en el ranking.

### 3. DRIVER_CANCELS_PRE_PICKUP
* **Detección:** El conductor desiste antes de llegar a la sucursal (`TO_PICKUP`).
* **Mitigación:** El `driver_id` se establece en `NULL`, la entrega regresa automáticamente a `SEARCHING_DRIVER` y se notifica al negocio sin detener la operación.

### 4. DRIVER_ISSUE_POST_PICKUP (Custodia Protegida)
* **Detección:** El conductor sufre una avería u ostenta una emergencia con el paquete en su poder (`PICKED_UP` / `TO_DROPOFF`).
* **Mitigación:** **PROHIBIDA LA DESASIGNACIÓN DIRECTA.** Se crea un incidente `OPEN` en `incidents`. El operador autoriza la devolución (`RETURN_REQUIRED`) o un traspaso presencial supervisado con firma de custodia (`RESOLVED_HANDOFF`).

### 5. OTP_WRONG & OTP_LOCKED
* **Detección:** Inserción de código OTP erróneo.
* **Mitigación:** Límite de 3 intentos (`otp_attempt_count`). Al tercer fallo, se bloquea la verificación por 2 minutos (`otp_locked_until`).

### 6. CUSTOMER_UNREACHABLE & RECIPIENT_REFUSED
* **Detección:** El cliente no responde tras 10 minutos de gracia en el destino o rechaza el paquete.
* **Mitigación:** La entrega cambia a `RETURN_REQUIRED`. El conductor inicia el viaje de retorno a la sucursal origen (`RETURNING`) para la entrega final del paquete (`RETURNED`).

### 7. DUPLICATE_REQUEST (Idempotencia)
* **Detección:** Re-envío de la misma petición con el mismo `Idempotency-Key`.
* **Mitigación:** El backend no procesa un nuevo cobro ni crea un nuevo registro; retorna la misma respuesta almacenada de la primera transacción.
