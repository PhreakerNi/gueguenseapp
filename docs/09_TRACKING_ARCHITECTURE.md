# 09 — ARQUITECTURA DE TRACKING Y POSICIONAMIENTO (TRACKING ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Rastreabilidad GPS Adaptativa, Sesiones Realtime Scoped, Hash de Tokens y Calidad de Señal  

---

## 1. Ciclo de Vida y Seguridad del Token de Tracking (`private.tracking_tokens`)

1. **Creación y Entropía:** Al crearse la entrega, el backend genera un token alfanumérico aleatorio de alta entropía (256 bits).
2. **Hash SHA-256 (`token_hash`):** El token expuesto en la URL (`https://gueguense.app/t/<TOKEN>`) se almacena como hash SHA-256 en `private.tracking_tokens`.
3. **Inactivación en Estados Terminales:**
   * Al pasar la entrega a estado `DELIVERED`, `RETURNED`, `CANCELED` o `FAILED`, la posición GPS del motorizado **se desvincula inmediatamente**.
   * La consulta web posterior muestra el resumen pero **NUNCA la posición GPS del conductor**.
4. **Transporte de Realtime Autorizado & Fallback:**
   * El token URL no autoriza directamente canales privados. El cliente invoca `POST /api/v1/tracking/{token}/realtime-session`, recibiendo un token temporal con scope a esa entrega.
   * Se cuenta con un mecanismo de **Short Polling (cada 15 segundos)** en caso de falla del WebSocket.

---

## 2. Ingesta GPS y Validación Configurable de Anomalías

Las señales GPS recibidas en `POST /api/v1/driver/location` pasan por filtros de calidad configurables:

* **`accuracy` (Precisión):** Si la precisión es mayor a 50m (configurable), la señal se registra marcando `location_quality = 'LOW'`.
* **`speed` (Velocidad):** Si la velocidad entre puntos excede los 120 km/h (configurable), el sistema no rechaza a ciegas sino que marca `anomaly_flag = true` para auditoría anti-spoofing en `delivery_tracking_points`.
* **Freshness:** La base de datos asigna `server_received_at` como la única autoridad de frescura temporal.
