# 01 — ESPECIFICACIÓN DE PRODUCTO (PRODUCT SPECIFICATION)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
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
* **Despacho Automatizado e Inteligente:** Algoritmo que empareja la entrega con el motorizado más apto en segundos, evitando demoras.
* **Trazabilidad de Extremo a Extremo:** Transparencia total de ubicación GPS, estado de recogida, prueba de entrega por PIN y auditoría de eventos.
* **Certeza Financiera:** Tarifas claras, cálculo dinámico basado en distancia/tiempo y control de cobro de efectivo en mano con liquidación transparente.

---

## 4. Usuarios Objetivos (Target Persona)

| Tipo de Usuario | Descripción | Necesidad Principal |
| :--- | :--- | :--- |
| **Comercio / Negocio (B2B)** | Restaurantes, farmacias, tiendas, supermercados, floristerías, e-commerce, pymes. | Encontrar un motorizado verificado de forma inmediata para enviar un pedido sin pagar comisiones sobre el valor de su venta. |
| **Motorizado (Driver)** | Conductores independientes de motocicleta con vehículo propio y documentación en regla. | Obtener ingresos justos, transparentes y bajo demanda, optimizando sus rutas y tiempos operativos. |
| **Equipo Operativo / Admin** | Personal administrativo y de soporte de Güegüense. | Monitorear la flota activa, auditar verificaciones, resolver disputas y mantener la salud financiera del sistema. |
| **Cliente Final (Consumidor)** | Receptor del paquete o comprador del negocio. | Conocer cuándo llegará su pedido mediante un enlace de tracking web dinámico y seguro sin necesidad de descargar una app. |

---

## 5. Modalidades de Servicio

### 5.1 Modalidad A — Solo Delivery (Prioridad Absoluta MVP)
El comercio ya realizó la venta por sus propios canales. La app se utiliza puramente como **motor de contratación logística**.
* **Entradas:** Dirección de recogida (sucursal), dirección de entrega, contacto del destinatario, tipo de paquete, cobro en destino (si aplica).
* **Salidas:** Cotización instantánea, asignación de motorizado verificado, seguimiento GPS en vivo, validación de entrega por PIN.
* **Requisito de catálogo:** Ninguno.

### 5.2 Modalidad B — Catálogo / Menú Directo (Fase Posterior)
Permite al negocio registrar su menú/catálogo dentro de Güegüense y obtener una storefront pública para recibir pedidos directos.
* **Funcionalidad:** Menús, categorías, variantes, modificadores, carrito de compra, pago en línea y generación automática de la orden de delivery correspondiente.

---

## 6. Componentes de la Plataforma

```text
                                ┌───────────────────────────┐
                                │   Güegüense Backend / DB  │
                                │   (PostgreSQL + Supabase) │
                                └─────────────┬─────────────┘
                                              │
        ┌──────────────────────┬──────────────┴──────────────┬──────────────────────┐
        │                      │                             │                      │
┌───────▼───────────┐  ┌───────▼───────────┐         ┌───────▼───────────┐  ┌───────▼───────────┐
│ Güegüense Negocios│  │ Güegüense Driver  │         │  Güegüense Admin  │  │   Tracking Web    │
│  (App Mobile B2B) │  │  (App Mobile)     │         │   (Panel Web)     │  │   (Cliente Web)   │
└───────────────────┘  └───────────────────┘         └───────────────────┘  └───────────────────┘
```

1. **Güegüense Negocios (Mobile App):** Para propietarios y empleados de negocios. Permite cotizar, solicitar motorizados, gestionar sucursales y ver historial.
2. **Güegüense Motorizado (Mobile App):** Para los conductores. Permite conectarse/desconectarse, recibir ofertas temporizadas, navegar, confirmar hitos operativos y ver ganancias.
3. **Güegüense Admin (Web Dashboard):** Para la operación de Güegüense. Verificación de documentos, monitoreo de flotas en mapa en vivo, reglas de tarifas, resolución de disputas y liquidaciones.
4. **Tracking Web Cliente (Web Portal):** Portal ultraliviano accesible por URL firmada de un solo uso para que el destinatario siga su paquete en vivo.

---

## 7. Alcance del MVP (Fase 1 - 8) vs. Fuera del Alcance (Fase 9+)

### INCLUIDO EN EL MVP (Scope):
* Autenticación basada en roles (Negocio, Motorizado, Admin).
* Registro y verificación documental de motorizados con aprobación en Admin.
* Configuración de negocios y múltiples sucursales.
* Cotizador dinámico de tarifas (distancia, base, zona).
* Creación de envíos "Solo Delivery" (Modalidad A).
* Motor de Despacho Atómico con timer (15s), ofertas y prevención de asignación doble.
* Flujo de entrega completo con navegación GPS e hito obligatorio de confirmación por PIN de 4 dígitos.
* Tracking web público en vivo para clientes sin login.
* Ledger de contabilidad financiera de partida doble (precio cliente, ganancia driver, comisión Güegüense, efectivo).
* Panel administrativo para monitoreo de operaciones, incidencias y gestión de estados de cuenta.

### FUERA DEL MVP (Out of Scope / Fases Futuras):
* Catálogo de productos / Menú digital / Pedidos en storefront público (Modalidad B).
* Entregas con múltiples paradas (Multi-stop) o rutas consolidadas.
* Entregas programadas en franjas futuras (Reserva diferida).
* Integración API pública/Webhooks directos para e-commerce externos (Shopify/WooCommerce).
* Desembolsos bancarios automatizados (Stripe Payouts / API bancaria local); se manejarán vía registros de payouts en Admin.
* Algoritmos de Machine Learning para predicción de demanda o precios dinámicos por demanda extrema.

---

## 8. Reglas Fundamentales del Producto

1. **Backend como Fuente de Verdad:** Ninguna aplicación cliente (Negocio o Driver) calcula precios, asigna estados ni adjudica viajes por su cuenta. Todo cambio de estado es validado y procesado por el backend.
2. **Asignación Atómica Garantizada:** Una entrega NUNCA puede ser asignada a dos motorizados en paralelo, sin importar la concurrencia de peticiones en red.
3. **Motorizados Verificados Exclusivamente:** Ningún conductor con estado `PENDING_VERIFICATION`, `REJECTED` o `BLOCKED` puede recibir ofertas de despacho.
4. **Entrega Confirmada por PIN:** Ninguna entrega pasa a estado `DELIVERED` sin ingresar la clave PIN atómica provista al cliente final o validación administrativa autorizada.
5. **No Mezclar Finanzas:** El dinero del cobro del paquete, la tarifa de envío, la ganancia del driver y la comisión de la plataforma son conceptos contables independientes en el ledger.

---

## 9. Métricas Principales de Éxito (KPIs)

* **Tiempo de Asignación (Time-to-Assign):** Mediana de segundos desde que el negocio presiona "Solicitar" hasta que un motorizado acepta la oferta (Objetivo < 60s).
* **Tiempo de Recogida (Time-to-Pickup):** Tiempo promedio desde la aceptación hasta la llegada a la sucursal (Objetivo < 12 min).
* **Tasa de Cumplimiento (Fulfillment Rate):** Porcentaje de solicitudes creadas que se completan exitosamente en estado `DELIVERED` (Objetivo > 98%).
* **Tasa de Rechazo de Oferta:** % de ofertas expiradas o rechazadas por motorizados antes de ser aceptadas.
* **Incidencias Logísticas:** % de entregas reportadas con contratiempos (dirección errónea, cliente ausente, paquete dañado).
