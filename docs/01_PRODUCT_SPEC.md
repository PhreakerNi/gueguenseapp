# 01 — ESPECIFICACIÓN DE PRODUCTO (PRODUCT SPECIFICATION)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Especificación de Producto, Alcance B2B e Invariantes  

---

## 1. Visión del Producto

La visión estratégica de **Güegüense** es construir la infraestructura digital de logística y entregas urbanas bajo demanda más confiable, transparente y eficiente de la región, conectando a comercios de cualquier escala con una red de motorizados previamente verificados en tiempo real.

Güegüense transforma la necesidad operativa del comercio:
> **"Tengo un paquete listo para enviar"** → **"Un motorizado verificado está en camino a mi sucursal"**  
en el menor número de interacciones y segundos posibles.

---

## 2. Definición del Problema

Los comercios locales (restaurantes, farmacias, tiendas boutique, e-commerce, distribuidores, emprendedores) enfrentan fricciones severas en la logística de última milla:

1. **Dependencia de flotas propias costosas:** Mantener motorizados contratados implica costos fijos de planilla, mantenimiento vehicular e ineficiencias en horas de baja demanda.
2. **Limitaciones de las plataformas tradicionales (Marketplaces):** Exigen altas comisiones (20%-35%), obligan a cargar catálogos complejos, imponen barreras de entrada y no resuelven los envíos originados por canales propios (WhatsApp, llamadas, redes sociales, e-commerce propio).
3. **Inseguridad e informalidad:** Contratar mensajeros independientes sin verificación genera riesgo de extravío de mercadería, robo de efectivo recaudado y falta de trazabilidad.
4. **Falta de visibilidad en tiempo real:** Los negocios pierden el rastro del envío en el momento en que sale del local, generando incertidumbre y reclamos de clientes finales.

---

## 3. Propuesta de Valor B2B y Modalidades de Servicio

### 3.1 Modalidad A — Solo Delivery (Prioridad Absoluta MVP)
El comercio ya realizó la venta por sus propios canales. La app se utiliza puramente como **motor de contratación logística**.
* **Entradas:** Dirección de recogida (sucursal), dirección de entrega, contacto del destinatario, tipo de paquete, cobro en destino (si aplica).
* **Salidas:** Cotización instantánea (Quote), asignación de motorizado verificado, seguimiento GPS en vivo, validación de transferencia de custodia por `PICKUP_CODE` y confirmación de entrega por `DELIVERY_OTP`.
* **Requisito de catálogo:** Ninguno.

### 3.2 Modalidad B — Catálogo / Menú Directo (Fase Posterior al MVP)
Permite al negocio registrar su catálogo dentro de Güegüense y obtener una storefront pública para recibir pedidos directos.

---

## 4. Invariantes Absolutos del Producto

1. **Backend como Fuente de Verdad:** Ninguna aplicación cliente calcula precios, asigna estados ni adjudica viajes por su cuenta. Todo cambio de estado es validado por el backend.
2. **Doble Invariante de Despacho:**
   * **Invariante A:** Una entrega NUNCA puede tener más de 1 conductor activo.
   * **Invariante B:** Un conductor NUNCA puede tener más de 1 entrega comprometida en el MVP.
3. **Separación de Custodia y Códigos:**
   * **`PICKUP_CODE`:** Utilizado en el negocio para confirmar que el conductor asignado recibe el paquete físico.
   * **`DELIVERY_OTP`:** Código aleatorio de 6 dígitos exclusivo del destinatario. Almacenado como hash (`otp_digest`). NUNCA se retorna por API al conductor, negocio ni operadores.
4. **Separación de Ciclos de Vida:**
   * **Quote Lifecycle** (`DRAFT` $\rightarrow$ `QUOTED` $\rightarrow$ `CONSUMED` / `EXPIRED` / `CANCELED`) es independiente del **Delivery Lifecycle**.
   * **Incident Lifecycle** (`incidents`) está desacoplado del estado del delivery.
   * **Return Lifecycle** (`RETURN_REQUIRED` $\rightarrow$ `RETURNING` $\rightarrow$ `RETURNED`) maneja la devolución de custodia post-pickup.
5. **No Mezclar Finanzas:** El dinero en efectivo recaudado por el conductor (`CASH_HELD_BY_DRIVER`) es un activo separado de la ganancia por servicio (`DRIVER_PAYABLE`).
