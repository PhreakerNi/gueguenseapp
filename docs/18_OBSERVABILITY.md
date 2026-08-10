# 18 — OBSERVABILIDAD, LOGS Y TELEMETRÍA (OBSERVABILITY)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Logs Estructurados, Trazabilidad, Monitoreo de Errores y Métricas Operativas  

---

## 1. Estrategia de Trazabilidad Unificada

Güegüense implementa un esquema de **Logs Estructurados en formato JSON** enriquecidos con identificadores de correlación (**Correlation IDs**). Esto permite rastrear el ciclo completo de una entrega a través de las apps móviles, llamadas a la API, eventos de base de datos y pasarelas externas.

```text
               ┌────────────────────────────────────────────────────────┐
               │                  CORRELATION CONTEXT                   │
               │  `x-correlation-id`: c_987123-abc                      │
               │  `x-delivery-id`:    d_112233-4455                     │
               │  `x-user-id`:        u_778899-0011                     │
               └───────────────────────────┬────────────────────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         │                                 │                                 │
         ▼                                 ▼                                 ▼
┌──────────────────┐             ┌──────────────────┐             ┌──────────────────┐
│  Mobile App Log  │             │   API Edge Log   │             │   Database Event │
│ (Sentry / Logtail│             │  (Structured JSON│             │   (audit_logs)   │
└──────────────────┘             └──────────────────┘             └──────────────────┘
```

---

## 2. Formato de Logs Estructurados (JSON Schema)

Todos los componentes del sistema emiten registros siguiendo esta estructura uniforme:

```json
{
  "timestamp": "2026-08-10T14:35:10.123Z",
  "level": "INFO",
  "service": "dispatch-engine",
  "correlation_id": "c_987123-abc",
  "delivery_id": "d_112233-4455",
  "user": {
    "id": "u_driver_88",
    "role": "driver"
  },
  "event": "DISPATCH_OFFER_ACCEPTED",
  "message": "Motorizado u_driver_88 aceptó la oferta para la entrega d_112233-4455",
  "context": {
    "round": 1,
    "distance_meters": 1250,
    "latency_ms": 45
  }
}
```

---

## 3. Niveles de Registro y Canales de Monitoreo

1. **`ERROR` / `FATAL` (Monitoreo vía Sentry / PostHog):**
   * Excepciones no capturadas en apps móviles, fallas de la base de datos, intentos de transiciones inválidas o errores de la pasarela de notificaciones. Disparan alertas en tiempo real al canal de operaciones en Slack / Discord.
2. **`WARN` (Alertas Operativas):**
   * Desconexión prolongada de GPS durante un viaje, temporizadores de oferta expirados, reintentos de peticiones de red o entregas retrasadas.
3. **`INFO` (Logs de Auditoría y Negocio):**
   * Registros de cambios de estado de entrega, asientos en el ledger contable, logins de usuarios y aprobaciones de verificación documental.

---

## 4. Tabla de Auditoría Administrativa (`audit_logs`)

Toda acción destructiva, cambio de tarifa, sobreescritura de estado o modificación de permisos realizada desde el panel **Güegüense Admin** se registra de forma inalterable en la tabla `audit_logs`:
* **Campos:** `id`, `actor_id`, `actor_role`, `action` (ej. `PRICE_RATE_UPDATED`), `resource_affected`, `old_values` (JSONB), `new_values` (JSONB), `ip_address`, `timestamp`.
