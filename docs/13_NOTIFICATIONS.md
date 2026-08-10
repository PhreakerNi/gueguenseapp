# 13 — SISTEMA DE NOTIFICACIONES Y EVENTOS (NOTIFICATIONS ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Push Notifications Best-Effort, Outbox Pattern y Gestión de Reintentos  

---

## 1. Principio de Push Notifications "Best-Effort"

Las Notificaciones Push son un canal complementario **BEST-EFFORT**. La fuente de verdad absoluta de ofertas y entregas radica en la base de datos PostgreSQL.

Al reconectar, la App Driver invoca `GET /api/v1/driver/offers/active` para resincronizar su estado. NUNCA se penaliza automáticamente a un conductor por no responder una alerta push perdida.

---

## 2. Patron Outbox (`notification_outbox`) y Políticas Estrictas de Reintento

1. **`DeviceNotRegistered` / `InvalidToken`:** Desactiva **ÚNICAMENTE** el token del dispositivo en `device_tokens` (`is_active = false`). NUNCA afecta la cuenta del usuario.
2. **`InvalidCredentials` / `AuthError`:** Alerta de infraestructura de alta prioridad en Admin. **PROHIBIDO INVALIDAR TOKENS DE USUARIOS.**
3. **HTTP 429 (Too Many Requests) / `MessageRateExceeded`:** Reintento automático con **Exponential Backoff y Jitter Aleatorio**.
4. **HTTP 5xx (Server Error del Proveedor):** Reintento programado en Outbox con límite máximo configurable de reintentos.
5. **Errores Permanentes 4xx (Payload Inválido):** **NO SE REINTENTA INFINITAMENTE.** Se marca como `FAILED_PERMANENT` y se registra para auditoría.
6. **Deduplicación & Receipts:** Desduplicación por `notification_id` / `event_id` y actualización del campo `last_seen_at` en `device_tokens`.
