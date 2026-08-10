# 09 — ARQUITECTURA DE TRACKING Y POSICIONAMIENTO (TRACKING ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.5.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Rastreabilidad GPS Adaptativa, Tracking Web MVP y Visibilidad del OTP  

---

## 1. Ciclo de Vida del Token de Tracking y Visibilidad del OTP

1. **Creación y Hash (`private.tracking_tokens`):** Token bearer de 256 bits resguardado como `token_hash` SHA-256 en base de datos.
2. **Resguardo de Encabezados de Privacidad:**
   ```text
   Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
   Referrer-Policy: no-referrer
   ```
   El token bearer se omite de logs de acceso y analíticas web.

3. **Visibilidad Autorizada del `DELIVERY_OTP`:**
   * El `DELIVERY_OTP` se genera tras confirmarse la custodia en el negocio (`PICKED_UP`).
   * El cliente destinatario solo puede consultar su OTP desde `GET /api/v1/tracking/{token}/otp` durante los estados activos autorizados: **`PICKED_UP`**, **`TO_DROPOFF`** y **`ARRIVED_DROPOFF`**.
   * En estados de devolución (`RETURN_REQUIRED`, `RETURNING`) o en estados terminales (`DELIVERED`, `RETURNED`, `CANCELED`, `FAILED`), el endpoint **`OTP_DISALLOWED_STATES` NO retorna el OTP**.

4. **Desvinculación GPS en Estados Terminales:** Al alcanzar un estado terminal real (`DELIVERED`, `RETURNED`, `CANCELED`, `FAILED`), el servidor desvincula inmediatamente la ubicación GPS del conductor del canal de tracking web y el polling se detiene.

---

## 2. Resumen Completo de la Arquitectura Tracking Web MVP

```text
Cliente Destinatario (Navegador Web)
├── Abre URL con Token Bearer (https://gueguense.app/t/<TOKEN>)
├── Servidor valida hash SHA-256 en private.tracking_tokens + expiry/revocation
├── Obtenida Snapshot Inicial (GET /api/v1/tracking/{token})
├── Adaptive Short Polling (Intervalo dinámico mientras delivery esté activa)
└── Sin conexión directa anónima a Supabase Realtime en el MVP
```

---

## 3. Ingesta GPS y Clasificación de Calidad

Las señales GPS recibidas en `POST /api/v1/driver/location` se clasifican según parámetros configurables (`initial default / configurable policy`):

* **`accuracy` (Precisión):** Si la precisión es mayor a 50m, la señal se almacena en `delivery_tracking_points` clasificándose como `location_quality = 'LOW'` (sin descartar el punto ciegamente de la BD).
* **`speed` (Velocidad):** Si la velocidad entre puntos excede los 120 km/h, el sistema registra `anomaly_flag = true` para auditoría anti-spoofing.
* **Freshness:** La base de datos asigna `server_received_at` como la única autoridad de frescura temporal.
