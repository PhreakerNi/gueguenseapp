# Güegüense — Roadmap de Desarrollo Incremental (20 Fases)

**Versión:** 1.0.0-phase1  
**Estado General:** FASE 0 — ✅ APROBADA | FASE 1 — 🟡 EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Directiva Vigente:** `Gueguense_Paquete_Unico_Cerebro_Agente_Fase1_Cierre_DB_Types_v1_8.md`

---

## 🛠️ Stack Tecnológico Congelado (Fase 1 v1.8)

- **Node.js:** `24.18.0 LTS`
- **Gestor de Paquetes:** `pnpm@11.17.0` (Workspaces monorepo con un único `pnpm-lock.yaml`)
- **Orquestador Monorepo:** `turbo@2.10.7`
- **Lenguaje / TypeScript Matrix:**
  - TypeScript (root / web / shared): `5.8.2` (Strict Mode)
  - TypeScript (Expo mobile apps): `6.0.3` (Expo SDK 57 compatible)
- **Framework Mobile:** `Expo SDK 57` (`57.0.12`, `react-native` 0.86.2, `react` 19.2.3, `expo-router` 57.0.12, `expo-doctor` 1.20.1)
- **Framework Web:** `Next.js 16.2.12 Active LTS` (App Router, Turbopack, `eslint-config-next` 16.2.12)
- **Backend / DB:** `Supabase CLI 2.110.0` (PostgreSQL 15+, PostGIS, RLS Deny por defecto, SELECT grants para `authenticated`, types generados por CLI para `--schema public`)

---

## 🗺️ Fases del Proyecto

### Fase 0 — Especificación y Arquitectura Congelada

- **Estado:** ✅ **APROBADA** (Commit `8da741f` / v1.8)
- **Entregables:** 21 documentos en `/docs`, README principal y directiva maestra.

### Fase 1 — Fundación y Estructura Core Monorepo

- **Estado:** 🟡 **EN REVISIÓN / CANDIDATA A APROBACIÓN** (`phase/1-foundation`)
- **Objetivo:** Monorepo funcional con 4 aplicaciones, 5 paquetes compartidos, migraciones local Supabase (9 tablas foundation + RLS + pgTAP), types generados y CI pipeline.

### Fase 2 — Autenticación, Gestión de Identidad y Sesiones

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 3 — Onboarding B2B y Registro de Conductores

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 4 — Gestión de Cotización de Envíos (Quote Engine)

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 5 — Creación y Ciclo de Vida del Envío (Delivery Engine)

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 6 — Motor de Despacho e Ingesta de Ofertas (Dispatch Engine)

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 7 — Aceptación y Asignación de Conductor

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 8 — Ingesta GPS y Tracking Live

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 9 — Transferencia de Custodia y Confirmación de Entrega (OTP / Proof)

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 10 — Retornos de Paquete y Redirección

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 11 — Transferencias Handoff entre Conductores

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 12 — Gestión de Incidentes e Intervención Administrativa

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 13 — Motor de Tarifación Avanzada (Pricing Engine)

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 14 — Libro Mayor Financiero (Financial Ledger)

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 15 — Liquidaciones en Efectivo y Cobros

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 16 — Solicitud y Procesamiento de Payouts

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 17 — Sistema de Notificaciones y Push

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 18 — Panel de Operaciones Administrativas (Admin Web)

- **Estado:** ⏳ Pendiente (No iniciada)

### Fase 19 — Despliegue de Infraestructura y Producción (Deployment)

- **Estado:** ⏳ Pendiente (No iniciada)
