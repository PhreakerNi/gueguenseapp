# 15 — CATÁLOGO DE CASOS LÍMITE Y MANEJO DE ERRORES (ERROR & EDGE CASES)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Resiliencia, Custodia de Paquetes y Mitigación de Errores  

---

## 1. Protocolos de Cancelación y Custodia

### 1.1 Cancelación del Conductor ANTES del Pickup (`DRIVER_ASSIGNED` / `TO_PICKUP`)
* **Condición:** El motorizado sufre un imprevisto antes de retirar el paquete en la sucursal.
* **Protocolo:**
  1. El conductor presiona "Cancelar Aceptación".
  2. El backend libera la entrega (`driver_id = NULL`).
  3. El viaje retorna a `SEARCHING_DRIVER` para ser re-ofrecido inmediatamente a la flota. El comercio no sufre interrupción.

### 1.2 Incidencia DESPUÉS del Pickup (`PICKED_UP` / `TO_DROPOFF`)
* **REGLA DE ORO DE CUSTODIA:** El conductor ya posee la mercadería física. **NUNCA SE PERMITE LA DESASIGNACIÓN SIMPLE O LIBERACIÓN DIRECTA DE LA ENTREGA.**
* **Protocolo:**
  1. El conductor reporta la avería. Se registra un incidente `OPEN` en la tabla `incidents`.
  2. El operador en Admin analiza el caso:
     * *Opción A (Retorno):* El viaje cambia a `RETURN_REQUIRED`. El conductor debe trasladar el paquete de regreso a la sucursal.
     * *Opción B (Traspaso Físico):* Se envía un segundo conductor al punto GPS del primero. Ambos conductores firman digitalmente la transferencia de custodia en presencia del paquete.

---

## 2. Intentos Excesivos de OTP de Entrega (`DELIVERY_OTP`)

* **Síntoma:** El conductor ingresa un OTP erróneo 3 veces seguidas.
* **Protocolo:**
  1. El backend bloquea las verificaciones de ese `delivery_id` durante 2 minutos (`otp_locked_until = NOW() + INTERVAL '2 minutes'`).
  2. Se notifica al cliente final en su web de tracking para confirmar que le dictó el código correcto.
  3. Evita ataques de fuerza bruta automatizados sobre el código de entrega.
