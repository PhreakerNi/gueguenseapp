# 09 — ARQUITECTURA DE TRACKING Y POSICIONAMIENTO (TRACKING ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Rastreabilidad GPS Adaptativa, Tracking Web MVP y Visibilidad del OTP  

---

## 1. Ciclo de Vida del Token de Tracking y Visibilidad del OTP

1. **Creación y Hash (`private.tracking_tokens`):** Token bearer de 256 bits resguardado como `token_hash` SHA-256 en base de datos.
2. **Visibilidad Autorizada del `DELIVERY_OTP`:**
   * El `DELIVERY_OTP` se genera al confirmarse la custodia en el negocio (`PICKED_UP`).
   * El cliente destinatario solo puede consultar su OTP desde `GET /api/v1/tracking/{token}/otp` durante los estados activos autorizados: **`PICKED_UP`**, **`TO_DROPOFF`** y **`ARRIVED_DROPOFF`**.
   * En estados terminales (`DELIVERED`, `RETURN_REQUIRED`, `RETURNING`, `RETURNED`, `CANCELED`, `FAILED`), el endpoint **NO retorna el OTP**.
3. **Desvinculación GPS en Estados Terminales:** Al concluir el viaje, el servidor desvincula inmediatamente la ubicación GPS del conductor del canal de tracking web.

---

## 2. Ingesta GPS y Validación Configurable de Anomalías

Las señales GPS recibidas en `POST /api/v1/driver/location` pasan por filtros de calidad configurables:

* **`accuracy` (Precisión):** Si la precisión es mayor a 50m (configurable), la señal se registra marcando `location_quality = 'LOW'`.
* **`speed` (Velocidad):** Si la velocidad entre puntos excede los 120 km/h (configurable), el sistema marca `anomaly_flag = true` para auditoría anti-spoofing en `delivery_tracking_points`.
* **Freshness:** La base de datos asigna `server_received_at` como la única autoridad de frescura temporal.
