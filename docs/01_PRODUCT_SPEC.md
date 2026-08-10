# 01 — ESPECIFICACIÓN DE PRODUCTO (PRODUCT SPECIFICATION)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Especificación de Producto y Estrategia B2B  

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

## 3. Propuesta de Valor B2B

Güegüense no compite como un simple directorio de comida; opera como una **Plataforma de Logística como Servicio (LaaS)** para negocios.

### Principales Pilares B2B:
* **Logística Plug-and-Play:** El negocio utiliza Güegüense para entregar cualquier pedido, sin importar si la venta ocurrió por WhatsApp, llamada, red social o tienda física.
* **Seguridad y Confianza Garantizada:** 100% de los motorizados pasan por un proceso de verificación documental riguroso (identidad, antecedentes, vehículo) antes de recibir su primer servicio.
* **Despacho Automatizado e Inteligente:** Algoritmo que empareja la entrega con el motorizado más apto en segundos, asegurando que un conductor no tenga más de una entrega activa en el MVP.
* **Trazabilidad y Confirmación Segura por OTP:** Transparencia total de ubicación GPS y verificación de recepción mediante un código **DELIVERY_OTP** exclusivo del cliente final que el conductor nunca puede obtener vía API.
* **Certeza Financiera:** Tarifas claras, cálculo dinámico basado en distancia/tiempo y control de cobro de efectivo en mano con liquidación transparente.

---

## 4. Usuarios Objetivos (Target Persona)

| Tipo de Usuario | Descripción | Necesidad Principal |
| :--- | :--- | :--- |
| **Comercio / Negocio (B2B)** | Restaurantes, farmacias, tiendas, supermercados, floristerías, e-commerce, pymes. | Encontrar un motorizado verificado de forma inmediata para enviar un paquete sin pagar comisiones sobre el valor de su venta. |
| **Motorizado (Driver)** | Conductores independientes de motocicleta con vehículo propio y documentación en regla. | Obtener ingresos justos, transparentes y bajo demanda, optimizando sus rutas y tiempos operativos. |
| **Equipo Operativo / Admin** | Personal administrativo y de soporte de Güegüense. | Monitorear la flota activa, auditar verificaciones, resolver disputas y mantener la salud financiera del sistema. |
| **Cliente Final (Consumidor)** | Receptor del paquete o comprador del negocio. | Conocer cuándo llegará su pedido mediante un enlace de tracking web dinámico y confirmar la recepción entregando su OTP al conductor. |

---

## 5. Modalidades de Servicio

### 5.1 Modalidad A — Solo Delivery (Prioridad Absoluta MVP)
El comercio ya realizó la venta por sus propios canales. La app se utiliza puramente como **motor de contratación logística**.
* **Entradas:** Dirección de recogida (sucursal), dirección de entrega, contacto del destinatario, tipo de paquete, cobro en destino (si aplica).
* **Salidas:** Cotización instantánea, asignación de motorizado verificado, seguimiento GPS en vivo, validación de entrega por DELIVERY_OTP.
* **Requisito de catálogo:** Ninguno.

### 5.2 Modalidad B — Catálogo / Menú Directo (Fase Posterior)
Permite al negocio registrar su menú/catálogo dentro de Güegüense y obtener una storefront pública para recibir pedidos directos.

---

## 6. Componentes de la Plataforma (Monorepo & Supabase CLI)

```text
                                ┌───────────────────────────┐
                                │   Supabase / PostgreSQL   │
                                │   (Auth, DB, Realtime, Edge)│
                                └─────────────┬─────────────┘
                                              │
        ┌──────────────────────┬──────────────┴──────────────┬──────────────────────┐
        │                      │                             │                      │
┌───────▼───────────┐  ┌───────▼───────────┐         ┌───────▼───────────┐  ┌───────▼───────────┐
│ Güegüense Negocios│  │ Güegüense Driver  │         │  Güegüense Admin  │  │   Tracking Web    │
│  (App Mobile B2B) │  │  (App Mobile)     │         │   (Panel Web)     │  │   (Cliente Web)   │
└───────────────────┘  └───────────────────┘         └───────────────────┘  └───────────────────┘
```

---

## 7. Reglas Fundamentales del Producto y Seguridad

1. **Backend como Fuente de Verdad:** Ninguna aplicación cliente calcula precios, asigna estados ni adjudica viajes por su cuenta. Todo cambio de estado es validado por el backend.
2. **Doble Invariante de Despacho:** Una entrega NUNCA puede tener dos motorizados asignados en paralelo, y un motorizado NUNCA puede tener dos entregas activas simultáneamente en el MVP.
3. **Separación Estricta de Códigos (PICKUP_CODE vs. DELIVERY_OTP):**
   * **`PICKUP_CODE`:** Código opcional de transferencia de custodia en el negocio (no confirma la entrega final).
   * **`DELIVERY_OTP`:** Código numérico de 4 a 6 dígitos exclusivo del cliente final. El backend NUNCA lo envía al conductor ni al negocio. La App Driver solo permite escribir el código dictado por el destinatario.
4. **Resguardo de OTP:** Almacenado como hash (`otp_hash`) con límite de intentos y expiración.
5. **Separación de Liciclos (Delivery vs. Incidencias):** Los problemas operativos (accidente, avería, pérdida de GPS) se manejan en la entidad `incidents` sin corromper el ciclo de vida del delivery.
