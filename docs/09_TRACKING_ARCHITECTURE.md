# 09 — ARQUITECTURA DE TRACKING Y POSICIONAMIENTO (TRACKING ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Rastreabilidad GPS Adaptativa, Ingesta Autenticada y Seguridad de Tokens Web  

---

## 1. Intervalos Objetivo Adaptativos (Adaptive Target Intervals)

Güegüense no utiliza una frecuencia rígida e inalterable. La captura GPS se adapta dinámicamente al estado de la aplicación, nivel de batería y permisos del dispositivo:

| Estado de la App / Dispositivo | Intervalo Objetivo de Captura | Filtro de Distancia Mínimo |
| :--- | :--- | :--- |
| **En Ruta Activa (`TO_PICKUP`, `TO_DROPOFF`) - Primer Plano** | Cada 3 a 5 segundos | 5 metros |
| **En Ruta Activa - Segundo Plano (Background)** | Cada 8 a 12 segundos | 15 metros |
| **Batería Baja (<20%) / Ahorro de Energía** | Cada 15 a 30 segundos | 30 metros |
| **Sin Permisos de Background / Aplicación Cerrada** | Fallback a pings manuales en cambios de hito | N/A |

El servidor utiliza la columna **`location_updated_at`** de `driver_presence` como la **única autoridad de frescura del dato**.

---

## 2. Ingesta de Ubicación Autenticada y Validada

Queda prohibido emitir coordenadas directamente vía WebSockets desde la app cliente hacia otros usuarios sin validación previa en el backend.

```text
 ┌───────────────────────────┐
 │ App Driver (Sensor GPS)   │ Captura lat/lng, accuracy, heading, speed y timestamp.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Ingesta Autenticada API   │ Endpoint REST/RPC `POST /api/v1/driver/location`.
 └─────────────┬─────────────┘ Validaciones: (1) JWT válido, (2) Velocidad físicamente
               │              posible (<120 km/h), (3) Accuracy < 50m.
               ▼
 ┌───────────────────────────┐
 │ DB Update (`driver_pres.`)│ Actualiza registro en PostgreSQL PostGIS.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Realtime Broadcast Privado│ Emite actualización al canal autorizado `delivery:{id}`.
 └───────────────────────────┘
```

---

## 3. Seguridad y Privacidad del Token de Tracking Web

1. **Hash de Token (`token_hash`):** El token expuesto en la URL (`https://gueguense.app/t/<TOKEN_HIGH_ENTROPY>`) no es un ID secuencial ni UUID simple. Se almacena como un hash SHA-256 en la base de datos para prevenir enumeration attacks.
2. **Expiración e Inactivación Post-DELIVERED:**
   * Al pasar la entrega a estado `DELIVERED`, `CANCELED` o `RETURNED`, la posición GPS del motorizado **se desvincula inmediatamente** del canal de tracking web.
   * La consulta web posterior muestra el resumen de entrega completada pero **NUNCA la ubicación actual del conductor**.
3. **Encabezados HTTP de Privacidad:**
   * `Cache-Control: no-store, max-age=0` (Previene almacenamiento en caché de navegadores intermediarios).
   * `Referrer-Policy: strict-origin-when-cross-origin` (Previene fuga de tokens en encabezados referer).
   * Exclusión explícita del token en scripts de analítica web.
