# Güegüense — Roadmap de Desarrollo Incremental (20 Fases: 0–19)

**Versión:** 1.0.0-phase3  
**Estado General:** FASE 0 — ✅ APROBADA | FASE 1 — ✅ APROBADA | FASE 2 — ✅ APROBADA | FASE 3 — 🟡 EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Directiva Vigente:** `Gueguense_Paquete_Unico_Cerebro_Agente_Fase3_Correccion_v1_1.md`

---

## 🛠️ Stack Tecnológico Congelado (Fase 3 v1.1)

- **Node.js:** `24.18.0 LTS`
- **Gestor de Paquetes:** `pnpm@11.17.0` (Workspaces monorepo con un único `pnpm-lock.yaml`)
- **Orquestador Monorepo:** `turbo@2.10.7`
- **Lenguaje / TypeScript Matrix:**
  - TypeScript (root / web / shared): `5.8.2` (Strict Mode)
  - TypeScript (Expo mobile apps): `6.0.3` (Expo SDK 57 compatible)
- **Framework Mobile:** `Expo SDK 57` (`57.0.14`, `react-native` 0.86.2, `react` 19.2.3, `expo-router` 57.0.14, `expo-secure-store` 57.0.1, `expo-doctor` 1.20.1)
- **Framework Web:** `Next.js 16.2.12 Active LTS` (App Router, Turbopack, `eslint-config-next` 16.2.12, `@supabase/ssr`, `proxy.ts`)
- **Backend / DB:** `Supabase CLI 2.110.0` (PostgreSQL 15+, PostGIS, RLS Deny por defecto, backend service-only RPCs con `search_path = ''`, Storage privado con RLS)

---

## 🗺️ Fases del Proyecto (0–19 Canónicas)

### Fase 0 — Especificación y Arquitectura Congelada

- **Estado:** ✅ **APROBADA** (Commit `8da741f` / v1.8)
- **Entregables:** 21 documentos en `/docs`, README principal y directiva maestra.

### Fase 1 — Fundación y Estructura Core Monorepo

- **Estado:** ✅ **APROBADA** (Commit `49a6ee9` / Run `32086480941`)
- **Entregables:** Monorepo funcional con 4 aplicaciones, 5 paquetes compartidos, migraciones local Supabase (9 tablas foundation + RLS + 60/60 pgTAP), types generados reproducibles y CI pipeline.

### Fase 2 — Autenticación, Gestión de Identidad y Sesiones

- **Estado:** ✅ **APROBADA** (Commit `6ec0835` / Run `32274479103`)
- **Entregables:** Autenticación Supabase Auth Email/Password, persistencia segura con `expo-secure-store`, modelo compartido `IdentityContext`, route guards por membresía/driver/status con DB fixtures reales, Admin SSR Auth con `@supabase/ssr` y `proxy.ts`, MFA TOTP AAL2 real, integration test gate y pgTAP foundation tests.

### Fase 3 — Onboarding B2B y Registro de Conductores

- **Estado:** 🟡 **EN REVISIÓN / CANDIDATA A APROBACIÓN** (`phase/3-onboarding-b2b-drivers`)
- **Objetivo:** Edge Function canónica `api-v1` con Idempotency-Key transaccional race-safe, creación atómica de Business (`PENDING`) y separación de Branch (`business_locations`) con N:M (`business_member_locations`), registro de Driver personal separado de vehículo, flujo seguro de subida de documentos con signed upload URL y verificación de almacenamiento, bloqueo de bypass de storage, cola de verificación administrativa con MFA TOTP AAL2, auditoría canónica (`DRIVER_VERIFIED`, `DRIVER_REJECTED`), pgTAP tests 35/35 (total 95/95) y suite de integración HTTP 100% sobre `api-v1`.

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

### Fase 19 — Hardening, Auditoría Integral de Seguridad y Preparación para Producción

- **Estado:** ⏳ Pendiente (No iniciada)
