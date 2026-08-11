# 01 — ESPECIFICACIÓN DE PRODUCTO (PRODUCT SPECIFICATION)

**Proyecto:** Güegüense  
**Versión:** 1.6.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Especificación de Producto, 4 Aplicaciones Canónicas, KPIs e Invariantes

---

## 1. Visión del Producto

La visión estratégica de **Güegüense** es construir la infraestructura digital de logística y entregas urbanas bajo demanda más confiable, transparente y eficiente de la región, conectando a comercios de cualquier escala con una red de motorizados previamente verificados en tiempo real.

Güegüense transforma la necesidad operativa del comercio:

> **"Tengo un paquete listo para enviar"** $\rightarrow$ **"Un motorizado verificado está en camino a mi sucursal"**  
> en el menor número de interacciones y segundos posibles.

---

## 2. Aplicaciones Canónicas del Proyecto (4 Apps)

El ecosistema de software está compuesto de forma exclusiva por 4 aplicaciones:

1. **`apps/business-mobile`:** App móvil React Native (Expo) para comercios. Solicitud, cotización, seguimiento y confirmación de custodia.
2. **`apps/driver-mobile`:** App móvil React Native (Expo) para motorizados. Recepción de ofertas, navegación, verificación de custodia y entrega OTP.
3. **`apps/admin-web`:** Panel de control Web Next.js (Supabase SSR) para administradores y operadores de la plataforma.
4. **`apps/tracking-web`:** Web Next.js de seguimiento para el cliente destinatario, **sin registro de cuenta pero protegida por un bearer tracking token de alta entropía**.

---

## 3. Alcance del Proyecto (`MVP SCOPE`)

### 3.1 Dentro del Alcance MVP (`MVP IN SCOPE`)

- **Modalidad Solo Delivery B2B:** Contratación directa de envíos sin catálogo previo de productos.
- **App Güegüense Negocios (`business-mobile`):** Cotización instantánea (`QUOTED`), confirmación, seguimiento y gestión de sucursales.
- **App Güegüense Motorizado (`driver-mobile`):** Recepción atómica de ofertas, navegación, verificación de custodia por `PICKUP_CODE` y confirmación por `DELIVERY_OTP`.
- **Güegüense Admin (`admin-web`):** Mesa de control de operaciones en vivo, verificación de documentos, gestión de incidentes y devoluciones.
- **Portal de Tracking Web (`tracking-web`):** Seguimiento mediante bearer token con acceso restringido al `DELIVERY_OTP` de 6 dígitos en `OTP_ALLOWED_STATES`.

### 3.2 Fuera del Alcance MVP (`MVP OUT OF SCOPE / POST-MVP`)

- **Modalidad Catálogo / Menú Directo (Fase 9 Post-MVP):** Creación de tiendas públicas y menús digitales de productos.
- **Entregas Multiparada / Batch:** Optimización de rutas con múltiples recogidas o entregas simultáneas por conductor.

---

## 4. Indicadores Clave de Rendimiento (`KPIs`) y Criterios de Éxito

### 4.1 KPIs del Sistema (Métricas de Operación con Umbrales Configurables):

- **Assignment Time:** Tiempo promedio desde `SEARCHING_DRIVER` hasta `DRIVER_ASSIGNED`.
- **Acceptance Rate:** Porcentaje de ofertas aceptadas por conductores en la primera ronda.
- **Successful Delivery Rate:** Porcentaje de entregas que concluyen exitosamente en `DELIVERED`.
- **Pre-Pickup Cancellation Rate:** Porcentaje de solicitudes canceladas exclusivamente en etapa pre-pickup (las situaciones post-custodia no constituyen cancelaciones simples, sino sub-ciclos de `RETURN_REQUIRED` o `CONTROLLED_HANDOFF`).
- **Average Pickup Wait:** Tiempo transcurrido entre `ARRIVED_PICKUP` y `PICKED_UP`.
- **Stale Tracking Rate:** Frecuencia de pérdida de señal GPS (> 60s `initial default / configurable policy`).
- **Incident Rate:** Porcentaje de entregas con registros de incidencias en `incidents`.

---

## 5. Invariantes Absolutos del Producto

1. **Backend como Fuente de Verdad:** Ninguna app cliente calcula precios ni fuerza estados de forma autónoma.
2. **Doble Invariante de Despacho:**
   - **Invariante A:** Máximo 1 conductor activo por entrega.
   - **Invariante B:** Máximo 1 entrega comprometida por conductor (`DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP`, `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`, `RETURN_REQUIRED`, `RETURNING`).
3. **Resguardo Criptográfico de Códigos:**
   - **`PICKUP_CODE`:** Mostrado exclusivamente en la app del Driver al estar en `ARRIVED_PICKUP`. El despachador del negocio lo introduce en su app. Guardado en `private.delivery_secrets.pickup_code_digest`.
   - **`DELIVERY_OTP`:** 6 dígitos. Resguardado como `otp_digest` y `otp_ciphertext` (cifrado con clave server-only) en `private.delivery_secrets` (los campos de OTP se generan tras confirmarse `PICKED_UP`). **NUNCA se expone por API al Driver, Negocio ni Admin.** Solo es retreadable por el cliente destinatario desde su sesión de tracking web en estados autorizados (`PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`).
