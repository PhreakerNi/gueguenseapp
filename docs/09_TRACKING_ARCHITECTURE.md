# 09 — ARQUITECTURA DE TRACKING Y POSICIONAMIENTO (TRACKING ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Rastreabilidad GPS Adaptativa, Ingesta Autenticada y Seguridad de Tokens Web  

---

## 1. Intervalos Objetivo Adaptativos (Adaptive Target Intervals)

La captura GPS se adapta dinámicamente al estado de la aplicación, nivel de batería y permisos del dispositivo:

| Estado de la App / Dispositivo | Intervalo Objetivo | Filtro Distancia |
| :--- | :--- | :--- |
| **En Ruta Activa (`TO_PICKUP`, `TO_DROPOFF`, `RETURNING`) - Primer Plano** | Cada 3 a 5 segundos | 5 metros |
| **En Ruta Activa - Segundo Plano (Background)** | Cada 8 a 12 segundos | 15 metros |
| **Batería Baja (<20%) / Ahorro de Energía** | Cada 15 a 30 segundos | 30 metros |
| **Sin Permisos Background / App Terminated** | Fallback a pings manuales en hitos operativos | N/A |

El servidor utiliza **`location_updated_at`** de `driver_presence` como la **única autoridad de frescura del dato**.

---

## 2. Ingesta de Ubicación Autenticada

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
 │ Broadcast Autorizado      │ Emisión en Canales Privados (`delivery:{id}`).
 └───────────────────────────┘
```

---

## 3. Seguridad del Token de Tracking Web (`private.tracking_tokens`)

1. **Hash de Token (`token_hash`):** El token expuesto en la URL (`https://gueguense.app/t/<TOKEN>`) se almacena como hash SHA-256 en la tabla `private.tracking_tokens`.
2. **Inactivación Post-DELIVERED / RETURNED:**
   * Al pasar la entrega a estado `DELIVERED`, `RETURNED`, `CANCELED` o `FAILED`, la posición GPS del motorizado **se desvincula inmediatamente** del canal de tracking web.
   * La consulta web posterior muestra únicamente el resumen de entrega finalizada pero **NUNCA la ubicación actual del conductor**.
3. **Encabezados HTTP de Privacidad:**
   * `Cache-Control: no-store, max-age=0`
   * `Referrer-Policy: no-referrer`
