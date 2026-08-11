# 20 — HOJA DE RUTA Y FASES DE DESARROLLO (DEVELOPMENT ROADMAP)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase1  
**Estado:** FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Planificación Versionada, Fases de Ejecución del Monorepo y Entregables por Hito

---

## 1. Resumen Ejecutivo de Fases

```text
┌────────────────────────────────────────────────────────────────────────┐
│ FASE 0: ESPECIFICACIÓN ARQUITECTÓNICA COMPLETA                         │
│ Estado: ✅ APROBADA                                                     │
│ Entregable: 21 Documentos Técnicos + Paquete Único v1.8               │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 1: FUNDACIÓN Y ESTRUCTURA CORE (MONOREPO)                         │
│ Estado: 🟡 EN REVISIÓN / CANDIDATA A APROBACIÓN                        │
│ Entregable: Pnpm Turborepo Workspace, 4 Apps, 5 Packages,             │
│             Supabase CLI Local, RLS Foundation, Types, CI Pipeline     │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 2: IDENTIDAD, AUTENTICACIÓN Y ONBOARDING                          │
│ Estado: ⏳ PENDIENTE                                                   │
│ Entregable: Login Supabase SSR, App Motorizado Auth, App Negocios Auth │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 3: CICLO COMPLETO DE ENTREGA Y DISPATCH ENGINE                    │
│ Estado: ⏳ PENDIENTE                                                   │
│ Entregable: Cotización, Solicitud, Despacho Rondas, OTP, Devolución    │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 4: TRACKING ADAPTATIVO Y PANEL ADMINISTRATIVO OPERATIVO           │
│ Estado: ⏳ PENDIENTE                                                   │
│ Entregable: Tracking Web Short Polling, Admin Web Operations           │
├────────────────────────────────────────────────────────────────────────┤
│ FASE 5: MOTOR FINANCIERO Y CONTABILIDAD DE DOBLE ENTRADA               │
│ Estado: ⏳ PENDIENTE                                                   │
│ Entregable: Ledger, Cash Settlements, Payout Lifecycle                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Entregables Realizados en Fase 1 (Fundación Monorepo)

1. **Toolchain Reproducible:** Node 24 LTS (`24.16.0`), pnpm 11 stable (`11.21.0`), Turborepo (`2.4.4`).
2. **Monorepo Workspace:**
   - `apps/business-mobile` (Expo SDK 57, React Native 0.78 / 0.86, Expo Router, Boot Screen)
   - `apps/driver-mobile` (Expo SDK 57, React Native 0.78 / 0.86, Expo Router, Boot Screen)
   - `apps/admin-web` (Next.js 16.x Active LTS App Router, Tailwind CSS, Technical Page)
   - `apps/tracking-web` (Next.js 16.x Active LTS App Router, Tailwind CSS, Technical Page)
3. **5 Packages Compartidos (`packages/`):**
   - `@gueguense/config` (TSConfig base, convenciones)
   - `@gueguense/domain` (Estados canónicos de `21_CANONICAL_ENUMS.md`, guards puros, unit tests)
   - `@gueguense/types` (Tipos TypeScript DB generados `database.generated.ts`)
   - `@gueguense/schemas` (Validaciones Zod compartidas)
   - `@gueguense/ui` (Design Tokens derivados de `16_DESIGN_SYSTEM.md`)
4. **Supabase Local & Foundation DB:**
   - Supabase CLI fijado en devDependencies (`2.15.8`)
   - Migración 1: PostGIS extension, pgTAP extension, schema `private` privado.
   - Migración 2: Identity & Business Foundation (`profiles`, `businesses`, `business_members`, `business_locations`, `business_member_locations`).
   - Migración 3: Driver Foundation (`drivers`, `driver_documents`, `vehicles`, `driver_presence`).
   - Base de RLS Deny-By-Default + Restricción estricta de escritura directa a GPS (`driver_presence.current_location`).
   - Generador de tipos DB (`pnpm db:types`).
   - Pruebas de base de datos pgTAP (`supabase/tests/database/01_foundation_rls.test.sql`).
5. **Calidad y CI Pipeline:**
   - Workflow de GitHub Actions (`.github/workflows/ci.yml`) ejecutando format, lint, typecheck, unit tests, build web y pgTAP tests.
