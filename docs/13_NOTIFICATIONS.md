# 13 — SISTEMA DE NOTIFICACIONES Y EVENTOS (NOTIFICATIONS ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Push Notifications Best-Effort, Outbox Pattern y Manejo Diferenciado de Errores  

---

## 1. Principio de Push Notifications "Best-Effort"

Las Notificaciones Push (FCM / APNs) son un canal de alerta complementario y **BEST-EFFORT** (no garantizado al 100%).

**REGLA TÉCNICA:** La oferta de viaje real y el estado del delivery residen **EXCLUSIVAMENTE en la base de datos PostgreSQL**.

Cuando la App Driver despierta o recupera conectividad, ejecuta automáticamente el endpoint de sincronización:
```http
GET /api/v1/driver/offers/active
```
Esto garantiza que el conductor visualice las ofertas disponibles aunque la Push no haya llegado.

---

## 2. Patron Outbox (`notification_outbox`) y Errores de Infraestructura

Todos los eventos de salida se registran en `notification_outbox` para reintento asíncrono.

### Manejo Diferenciado de Errores de Notificación:
1. **Error `DeviceNotRegistered` / `InvalidToken`:**
   * Indica que la app fue desinstalada o el token expiró.
   * **Acción:** Se desactiva **EXCLUSIVAMENTE** el token del dispositivo afectado en `device_tokens`. NUNCA se invalida la cuenta ni la sesión del usuario.
2. **Error `InvalidCredentials` / `AuthError`:**
   * Indica una falla de configuración de credenciales del servidor de FCM/APNs.
   * **Acción:** Emite una alerta de infraestructura de alta prioridad en Admin. **PROHIBIDO INVALIDAR TOKENS DE DISPOSITIVOS O USUARIOS.**
3. **Error `MessageRateExceeded` / HTTP 5xx:**
   * Reintento automático mediante algoritmo de **Exponential Backoff con Jitter**.
