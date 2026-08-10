# 15 — CATÁLOGO DE CASOS LÍMITE Y MANEJO DE ERRORES (ERROR & EDGE CASES)

**Proyecto:** Güegüense  
**Versión:** 1.5.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Catálogo Completo de Casos Límite (31 Casos), Estados Canónicos Exactos y Resiliencia  

---

## 1. Reglas Globales de Resiliencia Operativa

1. **Push Best-Effort:** NUNCA se aplica una penalización automática a un conductor por no responder una notificación push perdida.
2. **Custodia Protegida Post-Pickup:** Una vez alcanzado el estado `PICKED_UP`, queda **ESTRICTAMENTE PROHIBIDA** la desasignación directa del viaje. Se exige sub-ciclo `RETURN_REQUIRED` o `CONTROLLED_HANDOFF`.
3. **Listas Explícitas de Estados Sin Wildcards:** Se prohíben los comodines (ej: `* -> RETURN_REQUIRED`) y las comparaciones ordinales (ej: `status < PICKED_UP`).

---

## 2. Catálogo Canónico Completo de Casos Límite (31 Casos)

| Caso Límite | Detección | Comportamiento Backend | Impacto UX | Transición Permitida | Evento Emitido | Impacto Financiero | Recuperación / Escalación |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1. NO_DRIVERS_AVAILABLE** | 0 candidatos en radio initial $R$. | Expande radio progresivamente (+2km, 3 rondas). | Alerta de búsqueda extendida. | Permanece `SEARCHING_DRIVER` | `SEARCH_EXPANDED` | Sin cargo al comercio. | Escalación sonora a Admin. |
| **2. ALL_OFFERS_EXPIRED** | Expiración de ofertas (15s). | Ofertas cambian a `EXPIRED`. pasa a sig. ranking. | Re-emisión a siguiente driver. | Permanece `SEARCHING_DRIVER` | `OFFER_EXPIRED` | Sin impacto. | Re-intento en siguiente ronda. |
| **3. DRIVER_REJECTS** | Clic en "Rechazar". | Oferta pasa a `REJECTED`, emite a sig. candidato. | Driver regresa a `AVAILABLE`. | Permanece `SEARCHING_DRIVER` | `OFFER_REJECTED` | Sin impacto. | Algoritmo pasa a sig. driver. |
| **4. DRIVER_CANCELS_PRE_PICKUP**| Clic desistir pre-pickup. | Limpia `driver_id = NULL`, busca nuevo driver. | Comercio notificado del cambio. | `DRIVER_ASSIGNED` $\rightarrow$ `SEARCHING_DRIVER` | `DRIVER_UNASSIGNED` | Penalización leve a conductor. | Re-búsqueda automática. |
| **5. BUSINESS_CANCELS** | Clic cancelar en Negocio. | Valida si estado está en (`SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP`). | Driver notificado de cancelación. | Pre-pickup $\rightarrow$ `CANCELED` (Quote `CONSUMED`) | `DELIVERY_CANCELED` | Cobro `CANCEL_FEE` si aplica. | Proceso cerrado. |
| **6. CUSTOMER_CANCELS_IF_ALLOWED**| Solicitud vía soporte. | Evaluado manualmente por Operador pre-pickup. | Destinatario notificado. | Pre-pickup $\rightarrow$ `CANCELED` / Post $\rightarrow$ `RETURN_REQUIRED` | `INCIDENT_OPENED` | Según política comercial. | Intervención operador. |
| **7. GPS_LOST** | > 60s sin pings GPS. | Marca frescura de señal como `DELAYED`/`STALE`. | Advertencia en mapa Admin. | Sin cambio de estado delivery. | `INCIDENT_OPENED` | Sin impacto inmediato. | Re-conexión app driver. |
| **8. LOCATION_STALE** | > 3 min sin pings GPS. | Marca frescura tracking como `UNAVAILABLE` (sin alterar `driver_presence`). | Alerta en mapa live. | Incidente en `incidents`. | `INCIDENT_OPENED` | Alerta preventiva. | Contacto telefónico Admin. |
| **9. NETWORK_LOST** | Desconexión Socket. | Retiene estado en DB backend. | App driver en modo offline. | Sin cambio de estado delivery. | N/A | Sin impacto. | Re-sincronización REST al volver. |
| **10. APP_TERMINATED** | SO liquida app driver. | Tareas background dependen del SO. | Banner al reabrir app. Frescura `STALE`. | Sin cambio de estado delivery. | N/A | Sin impacto. | Polling al abrir app (`GET /active`). |
| **11. PUSH_LOST** | Falla de red FCM/APNs. | La oferta sigue vigente en DB. | Driver sincroniza en polling. | Sin cambio de estado delivery. | N/A | Sin impacto. | Sincronización REST. |
| **12. REALTIME_LOST** | WebSocket caído. | Caída de conexión detectada por cliente. | Fallback a Short Polling (15s). | Sin cambio de estado delivery. | N/A | Sin impacto. | Re-conexión automática socket. |
| **13. MAPS_PROVIDER_FAILURE**| Error 5xx Google API. | Intenta cache/retry; no cotiza en Haversine. | Notifica servicio no disponible. | N/A | `MAPS_FALLBACK_USED` | Sin cobro erróneo. | Re-intento programado. |
| **14. BUSINESS_CLOSED** | Llegada a local cerrado. | Driver reporta; Operador autoriza cancelación. | Negocio/Driver notificados. | `ARRIVED_PICKUP` $\rightarrow$ `CANCELED` (Quote `CONSUMED`) | `INCIDENT_OPENED` | Pago de traslado a conductor. | Cancelación por operador. |
| **15. PACKAGE_NOT_READY** | Demora en preparación. | Driver inicia contador de espera (> 5 min). | Negocio notificado de espera. | Permanece `ARRIVED_PICKUP` | `WAITING_STARTED` | Genera `WAITING_FEE`. | Acreditación al conductor. |
| **16. WAITING_TIMEOUT** | Espera > 15 min en local. | Conductor solicita; Operador autoriza cancelación. | Negocio notificado. | `ARRIVED_PICKUP` $\rightarrow$ `CANCELED` (Quote `CONSUMED`) | `INCIDENT_OPENED` | Cobro `CANCEL_FEE` + espera. | Cancelación autorizada. |
| **17. CUSTOMER_UNREACHABLE**| 10 min en destino sin res.| Driver activa aviso de ausencia. | Cliente recibe SMS/Alerta. | `ARRIVED_DROPOFF` $\rightarrow$ `RETURN_REQUIRED` | `INCIDENT_OPENED` | Genera `RETURN_FEE`. | Retorno obligatorio a sucursal. |
| **18. WRONG_ADDRESS** | Dirección errónea. | Driver notifica; Operador recalcula o retorna. | Negocio ajusta o acepta retorno. | Incidente `ADDRESS_PROBLEM` | `INCIDENT_OPENED` | Genera `pricing_adjustment`. | Recálculo o Devolución. |
| **19. RECIPIENT_REFUSED** | Cliente rechaza paquete. | Driver reporta rechazo de entrega. | Negocio notificado de rechazo. | `ARRIVED_DROPOFF` $\rightarrow$ `RETURN_REQUIRED` | `RETURN_REQUIRED` | Genera `RETURN_FEE`. | Retorno obligatorio a sucursal. |
| **20. PACKAGE_DAMAGED** | Paquete dañado en ruta. | Driver reporta avería con foto. | Incidente `PACKAGE_DAMAGED`. | Incidente en `incidents` | `INCIDENT_OPENED` | Seguro / Arbitraje. | Intervención mesa de ayuda. |
| **21. OTP_WRONG** | Código OTP erróneo. | Incrementa `otp_attempt_count`. | Muestra intento fallido (x/3). | Sin cambio de estado. | `OTP_ATTEMPT_FAILED` | Sin impacto. | Re-ingreso por cliente. |
| **22. OTP_LOCKED** | 3er intento OTP fallido. | Activa `otp_locked_until` (2 min). | Conductor bloqueado 2 min. | Permanece `ARRIVED_DROPOFF` | `OTP_LOCKED` | Sin impacto. | Espera de tiempo de bloqueo. |
| **23. CASH_MISMATCH** | Descalce de efectivo. | Conductor reporta monto diferente. | Operador ajusta liquidación. | Incidente `CASH_MISMATCH` | `INCIDENT_OPENED` | Ajuste contable manual. | Conciliación en Admin. |
| **24. PAYMENT_FAILED** | Recompra/saldo insuf. | Pago de comercio rechazado. | Suspensión de solicitudes. | `QUOTED` no se consume. | `PAYMENT_FAILED` | Sin saldo debitado. | Recarga de saldo prepago. |
| **25. DUPLICATE_REQUEST** | Mismo `Idempotency-Key`| Backend retorna respuesta previa. | Transparente para usuario. | Retorna estado existente. | N/A | 1 solo cobro. | Resuelto por idempotencia. |
| **26. DUPLICATE_WEBHOOK** | Re-emisión de webhook. | Descarte por `idempotency_keys`. | Sin efecto repetido. | N/A | N/A | 1 sola transacción. | Resuelto por idempotencia. |
| **27. DRIVER_SUSPENDED_MID**| Conductor suspendido. | Rebotan nuevas ofertas; custodia se preserva.| Conductor deshabilitado. | `PICKED_UP`/`DROPOFF` $\rightarrow$ `RETURN_REQUIRED`/`HANDOFF` | `DRIVER_SUSPENDED` | Liquidación retenida. | Operador ordena RETURN / HANDOFF |
| **28. BIZ_SUSPENDED_MID** | Comercio suspendido. | Entregas activas concluyen. | Bloqueo de nuevos envíos. | Entregas activas terminan. | `BUSINESS_SUSPENDED` | Saldo congelado. | Arbitraje administrativo. |
| **29. RETURN_REQUIRED** | Devolución obligatoria. | Inicia flujo de retorno a sucursal. | Negocio notificado de regreso. | `PICKED_UP`/`DROPOFF` $\rightarrow$ `RETURN_REQUIRED` | `RETURN_REQUIRED` | Genera `RETURN_FEE`. | Conductor navega a origen. |
| **30. CONTROLLED_HANDOFF** | Avería de moto en ruta. | Operador asigna 2do conductor. | Ambos firman `custody_handoffs`| Permanece `TO_DROPOFF` | `HANDOFF_STARTED` | Split de tarifa de servicio. | Traspaso presencial de paquete |
| **31. DB_TEMP_FAILURE** | Caída temporal DB. | Retry con backoff en Edge Func. | Mensaje de reintento. | Transacciones rollback. | N/A | Sin corrupción de saldo. | Resiliencia infraestructura. |
