# 10 — MOTOR DE PRECIOS Y AJUSTES (PRICING ENGINE)

**Proyecto:** Güegüense  
**Versión:** 1.5.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Tarificación Dinámica, Precios Cotizados vs. Finales, Umbrales Configurables y Resiliencia  

---

## 1. Distinción Entre `quoted_price` y `final_price`

1. **`quoted_price`:** Tarifa estimada calculada al crear la cotización (`QUOTED`), basada en la distancia teórica vial y tiempo estimado original.
2. **`final_price`:** Monto total real a liquidar tras concluir la entrega, que resulta de la consolidación de `quoted_price` más o menos la lista de **Ajustes de Tarifa (`pricing_adjustments`)**.

$$\text{final\_price} = \text{quoted\_price} + \sum \text{pricing\_adjustments}$$

---

## 2. Umbrales Operativos Configurables (`Configurable Policies / Initial Defaults`)

Los siguientes valores representan parámetros de configuración iniciales del sistema (no invariantes hardcoded):
* **Quote Expiry:** 5 minutos (`initial default / configurable policy`).
* **Offer Timeout:** 15 segundos (`initial default / configurable policy`).
* **Waiting Grace Period:** 5 minutos (`initial default / configurable policy`).
* **Waiting Timeout:** 15 minutos (`initial default / configurable policy`).
* **Customer Unreachable Timeout:** 10 minutos (`initial default / configurable policy`).
* **GPS Delayed / Stale Threshold:** 60s / 3 min (`initial default / configurable policy`).
* **OTP Max Attempts / Lock Duration:** 3 intentos / 2 min (`initial default / configurable policy`).
* **Four-Eyes Approval Threshold:** C$ 5,000.00 NIO (`initial default / configurable policy`).

---

## 3. Resiliencia ante Fallas del Proveedor de Mapas (Routes API)

PostGIS / Haversine se utilizan **exclusivamente para filtrado grueso de candidatos y estimación de proximidad**.

**REGLA EN CASO DE FALLO DE GOOGLE ROUTES API:** Si la API de rutas no responde durante la generación de una cotización oficial:
1. Se intenta recuperar un cálculo en cache válido para el par de origen/destino.
2. Se ejecuta un re-intento controlado con timeout estricto.
3. Si la falla persiste, el sistema notifica temporalmente que la cotización no está disponible. **SE PROHIBE FACTURAR UNA COTIZACIÓN OFICIAL EN LÍNEA RECTA (HAVERSINE) DE FORMA SILENCIOSA.**
