# 13 — SISTEMA DE NOTIFICACIONES Y EVENTOS (NOTIFICATIONS ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Push Notifications Best-Effort, Outbox Pattern y Resincronización  

---

## 1. Principio de Push Notifications "Best-Effort"

Las Notificaciones Push (FCM / APNs) son un canal de alerta complementario y **BEST-EFFORT** (no se garantiza la entrega al 100% debido a modos de ahorro de batería o pérdida momentánea de cobertura).

**REGLA TÉCNICA:** La oferta de viaje real y el estado del delivery residen **EXCLUSIVAMENTE en la base de datos PostgreSQL**.

Cuando la App Driver despierta o recupera conectividad, ejecuta automáticamente un endpoint de sincronización:
```http
GET /api/v1/driver/offers/active
```
Esto garantiza que el conductor visualice las ofertas disponibles de inmediato aunque la notificación Push se haya retrasado o perdido. Un conductor NUNCA es penalizado por no responder a una Push no entregada.

---

## 2. Patron Outbox de Notificaciones (`notification_outbox`)

Para asegurar la confiabilidad, entrega en reintento y desduplicación, los eventos que requieren envío externo se registran en una tabla Outbox:

```sql
CREATE TABLE public.notification_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    recipient_user_id UUID REFERENCES auth.users(id),
    channel TEXT NOT NULL CHECK (channel IN ('PUSH', 'SMS', 'WHATSAPP', 'EMAIL')),
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED', 'RETRYING')),
    send_attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    error_log TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Manejo de Dispositivos No Registrados (`DeviceNotRegistered`)

Si el proveedor de Push (FCM / Expo) retorna un error `DeviceNotRegistered` o `InvalidCredentials`, el worker de notificaciones invalida automáticamente el token del dispositivo en `device_tokens` para evitar reintentos innecesarios en futuras alertas.
