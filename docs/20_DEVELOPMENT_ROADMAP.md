# 20 — HOJA DE RUTA Y ROADMAP DE DESARROLLO (DEVELOPMENT ROADMAP)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Planificación por Fases, Entregables y Definition of Done (DoD)  

---

## 1. Resumen Ejecutivo del Roadmap

El proyecto Güegüense se ejecutará en **11 Fases Secuenciales Estrictas** (Fase 0 a Fase 10). Ninguna fase iniciará si la fase previa no ha sido completada y verificada contra sus criterios de **Definition of Done (DoD)**.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        RESUMEN DE FASES DEL ROADMAP                    │
├─────────┬───────────────────────────────┬──────────────────────────────┤
│ Fase 0  │ Especificación y Arquitectura │ 🟢 COMPLETADA                │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 1  │ Fundación y Estructura Core   │ 🟡 SIGUIENTE FASE A INICIAR │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 2  │ Güegüense Motorizado (App)    │ ⚪ Pendiente                 │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 3  │ Güegüense Negocios (App)      │ ⚪ Pendiente                 │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 4  │ Dispatch Engine & Asignación  │ ⚪ Pendiente                 │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 5  │ Operación de Entrega & PIN    │ ⚪ Pendiente                 │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 6  │ Tracking Web en Vivo          │ ⚪ Pendiente                 │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 7  │ Finanzas y Ledger Contable    │ ⚪ Pendiente                 │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 8  │ Panel Güegüense Admin         │ ⚪ Pendiente                 │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 9  │ Módulo Catálogo / Menú (B)    │ ⚪ Fase Posterior al MVP     │
├─────────┼───────────────────────────────┼──────────────────────────────┤
│ Fase 10 │ Funciones Avanzadas           │ ⚪ Fase Posterior al MVP     │
└─────────┴───────────────────────────────┴──────────────────────────────┘
```

---

## 2. Detalle de Fases de Desarrollo

### 🟢 Fase 0 — Especificación y Arquitectura (Completada)
* **Objetivo:** Definir la totalidad del producto, roles, máquina de estados, arquitectura de datos, API, dispatch, seguridad y diseño antes de escribir una sola línea de código ejecutable.
* **Entregables:** 20 Documentos técnicos oficiales en `/docs` + `README.md`.
* **Definition of Done:** Documentación revisada, auditada y aprobada por el usuario.

---

### 🟡 Fase 1 — Fundación y Estructura Core (Monorepo & DB)
* **Objetivo:** Construir los cimientos técnicos de la plataforma.
* **Módulos:**
  1. Configuración de Monorepo (pnpm / Turborepo).
  2. Creación de paquetes compartidos (`@gueguense/types`, `schemas`, `domain`, `ui`).
  3. Inicialización del proyecto PostgreSQL / Supabase, migraciones iniciales de usuarios, perfiles y políticas RLS.
  4. Configuración del sistema de Auth JWT y roles.
* **Pruebas:** Test de migraciones SQL, test de políticas RLS y compilación de paquetes TypeScript.
* **DoD:** Estructura lista para importar tipos compartidos y autenticar usuarios en cualquier app.

---

### ⚪ Fase 2 — Güegüense Motorizado (App Onboarding & Presencia)
* **Objetivo:** Permitir el registro de conductores, carga de documentos y gestión de disponibilidad.
* **Entregables:** App Expo `/apps/driver-mobile` con pantallas de Registro, Carga de Fotos de Cédula/Licencia/Moto y Toggle de Presencia (`AVAILABLE` / `OFFLINE`).
* **DoD:** Conductor puede registrarse, quedar en `UNDER_REVIEW` y cambiar presencia tras ser aprobado.

---

### ⚪ Fase 3 — Güegüense Negocios (App Cotización & Solicitud)
* **Objetivo:** Permitir al comercio configurar sucursales y solicitar envíos "Solo Delivery".
* **Entregables:** App Expo `/apps/business-mobile` con formulario de destinatario, integración con Google Maps Autocomplete, cotizador en tiempo real y botón "Solicitar Motorizado".
* **DoD:** El negocio crea una solicitud y esta pasa al estado `SEARCHING_DRIVER`.

---

### ⚪ Fase 4 — Dispatch Engine (Algoritmo de Asignación Atómica)
* **Objetivo:** Implementar la lógica de búsqueda, puntuación, temporizador (15s) y asignación sin duplicidades.
* **Entregables:** Stored Procedures PL/pgSQL (`accept_delivery_offer` atómico), backend de rondas y tarjetas de oferta en la app del motorizado.
* **Pruebas:** Test de concurrencia simulada (Double Accept).
* **DoD:** La entrega se adjudica a exactamente un conductor sin posibilidad de colisión race condition.

---

### ⚪ Fase 5 — Operación de Entrega & Confirmación por PIN
* **Objetivo:** Flujo operativo completo en ruta desde la recogida hasta la entrega.
* **Entregables:** Pantallas de navegación en app driver, confirmación de llegada a sucursal, recogida, llegada a cliente final e ingreso de PIN de 4 dígitos.
* **DoD:** Una entrega puede recorrer todos los estados desde `DRIVER_ASSIGNED` hasta `DELIVERED` validando el PIN.

---

### ⚪ Fase 6 — Tracking Web en Vivo
* **Objetivo:** Portal web público de seguimiento para el cliente final.
* **Entregables:** Web Next.js `/apps/tracking-web` renderizando el mapa en tiempo real vía WebSockets Realtime con la posición del motorizado, datos del conductor y PIN del cliente.
* **DoD:** El cliente puede abrir la URL firmada en su navegador móvil y seguir al motorizado hasta la entrega.

---

### ⚪ Fase 7 — Finanzas, Precios y Ledger Contable
* **Objetivo:** Procesamiento contable inmutable de cada viaje.
* **Entregables:** Asientos contables de partida doble en `ledger_entries`, billeteras virtuales de conductores, control de efectivo en mano y gestión de solicitudes de retiro.
* **DoD:** Cada entrega `DELIVERED` genera sus asientos exactos dividiendo tarifa, ganancia de driver y comisión.

---

### 8. Fase 8 — Panel Güegüense Admin
* **Objetivo:** Herramienta de control operativo para administración.
* **Entregables:** Dashboard web Next.js `/apps/admin-web` con mapa global de flota en vivo, módulo de verificación de documentos cifrados, editor de tarifas/zonas y gestión de incidencias.
* **DoD:** Un agente de verificación puede aprobar conductores y un operador puede reasignar viajes en disputa.

---

### ⚪ Fases 9 & 10 — Catálogo y Funciones Avanzadas (Post-MVP)
* Desarrollos posteriores: Modalidad B (Menú/Catálogo digital), múltiples paradas (Multi-stop), entregas programadas e integraciones API/Webhooks corporativas.
