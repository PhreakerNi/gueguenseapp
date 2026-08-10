# 13 — SISTEMA DE NOTIFICACIONES Y EVENTOS (NOTIFICATIONS ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Push Notifications Best-Effort, Outbox Pattern, Deduplicación y Reintentos con Backoff  

---

## 1. Principio de Push Notifications "Best-Effort"

Las Notificaciones Push son un canal complementario **BEST-EFFORT**. La fuente de verdad absoluta de ofertas y entregas radica en la base de datos PostgreSQL.

Al reconectar, la App Driver invoca `GET /api/v1/driver/offers/active` para resincronizar su estado.

---

## 2. Patron Outbox (`notification_outbox`) y Políticas Estrictas de Reintento

### Politica Completa de Gestión de Errores Push:
1. **`DeviceNotRegistered` / `InvalidToken`:**
   * **Acción:** Se desactiva **ÚNICAMENTE** el token del dispositivo en `device_tokens` (`is_active = false`). NUNCA afecta la cuenta del usuario.
2. **`InvalidCredentials` / `AuthError`:**
   * **Acción:** Emite una alerta de infraestructura de alta prioridad en Admin. **PROHIBIDO INVALIDAR TOKENS DE USUARIOS.**
3. **HTTP 429 (Too Many Requests) / `MessageRateExceeded`:**
   * **Acción:** Reintento automático con **Exponential Backoff y Jitter Aleatorio**.
4. **HTTP 5xx (Server Error del Proveedor):**
   * **Acción:** Reintento programado en Outbox con límite máximo de 5 intentos.
5. **Errores Permanentes 4xx (Payload Inválido):**
   * **Acción:** **NO SE REINTENTA INFINITAMENTE.** Se marca la notificación como `FAILED_PERMANENT` y se registra el error para auditoría.
6. **Deduplicación & Receipts:**
   * Desduplicación estricta por `notification_id` / `event_id` y actualización del campo `last_seen_at` en `device_tokens`.
