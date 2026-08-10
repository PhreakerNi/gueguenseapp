# 01 — ESPECIFICACIÓN DE PRODUCTO (PRODUCT SPECIFICATION)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Especificación de Producto, Alcance B2B, KPIs, Criterios de Éxito e Invariantes  

---

## 1. Visión del Producto

La visión estratégica de **Güegüense** es construir la infraestructura digital de logística y entregas urbanas bajo demanda más confiable, transparente y eficiente de la región, conectando a comercios de cualquier escala con una red de motorizados previamente verificados en tiempo real.

Güegüense transforma la necesidad operativa del comercio:
> **"Tengo un paquete listo para enviar"** $\rightarrow$ **"Un motorizado verificado está en camino a mi sucursal"**  
en el menor número de interacciones y segundos posibles.

---

## 2. Definición del Problema y Supuestos Operativos Iniciales

Los comercios locales (restaurantes, farmacias, tiendas boutique, e-commerce, distribuidores, emprendedores) enfrentan fricciones severas en la logística de última milla:
1. **Dependencia de flotas propias costosas:** Mantenimiento vehicular e ineficiencias en horas valle.
2. **Limitaciones de marketplaces tradicionales:** Comisiones del 20%-35% y obligación de cargar catálogos.
3. **Inseguridad e informalidad:** Riesgo de pérdida de mercadería y falta de liquidación de efectivo recaudado.
4. **Falta de visibilidad:** Incertidumbre sobre la ruta en tiempo real.

### Supuestos Operativos Iniciales (`INITIAL OPERATING ASSUMPTIONS`):
* El motorizado promedio realiza entregas urbanas en un radio de 1 a 12 kilómetros.
* El pago de la entrega se realiza mediante saldo prepagado/crédito del negocio o cobro en efectivo en destino.
* Las notificaciones push se consideran alertas secundarias best-effort; la base de datos PostgreSQL es la fuente de verdad.

---

## 3. Alcance del Proyecto (`MVP SCOPE`)

### 3.1 Dentro del Alcance MVP (`MVP IN SCOPE`)
* **Modalidad Solo Delivery B2B:** Contratación directa de envíos sin necesidad de catálogo previo de productos.
* **App Güegüense Negocios (Mobile & Web):** Cotización instantánea (`QUOTED`), confirmación, seguimiento y gestión de sucursales.
* **App Güegüense Motorizado (Mobile):** Recepción atómica de ofertas, navegación, verificación de custodia por `PICKUP_CODE` y confirmación por `DELIVERY_OTP`.
* **Güegüense Admin (Web):** Mesa de control de operaciones en vivo, verificación de documentos, gestión de incidentes y devoluciones.
* **Portal de Tracking Web Público:** Seguimiento para el destinatario con `DELIVERY_OTP` (6 dígitos) resguardado.

### 3.2 Fuera del Alcance MVP (`MVP OUT OF SCOPE / POST-MVP`)
* **Modalidad Catálogo / Menú Directo (Post-MVP):** Creación de tiendas públicas y menús digitales de productos.
* **Entregas Multiparada / Envíos Masivos Batch:** Algoritmos de optimización de rutas con más de 1 punto de recogida y múltiples entregas simultáneas por conductor.
* **Vehículos Pesados / Camiones:** Exclusividad de vehículos de dos ruedas (motocicletas) en la fase inicial.

---

## 4. Indicadores Clave de Rendimiento (`KPIs`) y Criterios de Éxito

### 4.1 KPIs del Sistema (Métricas de Operación):
* **Assignment Time:** Tiempo promedio desde `SEARCHING_DRIVER` hasta `DRIVER_ASSIGNED`.
* **Acceptance Rate:** Porcentaje de ofertas aceptadas por conductores en la primera ronda.
* **Successful Delivery Rate:** Porcentaje de entregas que concluyen exitosamente en `DELIVERED`.
* **Cancellation Rate:** Porcentaje de solicitudes canceladas pre-pickup y post-pickup.
* **Average Pickup Wait:** Tiempo transcurrido entre `ARRIVED_PICKUP` y `PICKED_UP`.
* **Stale Tracking Rate:** Frecuencia de pérdida de señal GPS (> 60 segundos sin actualización).
* **Incident Rate:** Porcentaje de entregas con registros de incidencias en `incidents`.

*(Nota: Los valores objetivo numéricos específicos de cada KPI se definirán formalmente en el entorno de pruebas de la Fase 1).*

---

## 5. Invariantes Absolutos del Producto

1. **Backend como Fuente de Verdad:** Ninguna app cliente calcula precios ni fuerza estados de forma autónoma.
2. **Doble Invariante de Despacho:**
   * **Invariante A:** Máximo 1 conductor activo por entrega.
   * **Invariante B:** Máximo 1 entrega comprometida por conductor (`DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP`, `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`, `RETURN_REQUIRED`, `RETURNING`).
3. **Resguardo Criptográfico de Códigos:**
   * **`PICKUP_CODE`:** Mostrado exclusivamente en la app del Driver al estar en `ARRIVED_PICKUP`. El despachador del negocio lo introduce en su app. Guardado en `private.delivery_secrets.pickup_code_digest`.
   * **`DELIVERY_OTP`:** 6 dígitos. Resguardado como `otp_digest` y `otp_ciphertext` (cifrado con clave server-only). **NUNCA se expone por API al Driver, Negocio ni Admin.** Solo es retreadable por el cliente destinatario desde su sesión de tracking web.
