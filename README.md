# GÜEGÜENSE — Plataforma Logística y Delivery B2B Bajo Demanda

**Versión:** 1.0.0-phase2  
**Estado:** FASE 0 — ✅ APROBADA | FASE 1 — ✅ APROBADA | FASE 2 — 🟡 EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Rama de Desarrollo:** `phase/2-auth-identity-sessions`  
**Repositorio Oficial:** `https://github.com/PhreakerNi/gueguenseapp.git`  
**Directiva Arquitectónica Vigente:** `Gueguense_Paquete_Unico_Cerebro_Agente_Fase2_Correccion_v1_1.md`

---

## 📌 Visión del Proyecto

**Güegüense** es una infraestructura digital de logística y delivery bajo demanda diseñada primordialmente para **negocios (B2B)** que necesitan contratar motorizados verificados de forma rápida, segura y confiable.

---

## 🏗️ Arquitectura de Aplicaciones Canónicas (Monorepo)

```text
gueguenseapp/
├── apps/
│   ├── business-mobile/    # App móvil Expo SDK 57 (React Native 0.86.2) para comercios con Auth & Session
│   ├── driver-mobile/      # App móvil Expo SDK 57 (React Native 0.86.2) para motorizados con Auth & Session
│   ├── admin-web/          # Panel administrativo Next.js 16.2.12 (SSR Auth, Role Guards, MFA TOTP AAL2)
│   └── tracking-web/       # Portal web de seguimiento Next.js 16.2.12 (Bearer Token tracking, sin auth)
│
├── packages/
│   ├── types/              # Tipos TypeScript, database.generated.ts e IdentityContext
│   ├── schemas/            # Validaciones Zod de Auth y Dominio
│   ├── domain/             # Estados canónicos de enum 21, guards puros y unit tests
│   ├── ui/                 # Design tokens de 16_DESIGN_SYSTEM.md
│   └── config/             # TSConfig base y convenciones compartidas
│
├── supabase/
│   ├── migrations/         # Migraciones SQL de fundación (identity, business, driver, RLS, PostGIS)
│   ├── tests/database/     # Suite de pruebas de base de datos pgTAP Foundation (60/60)
│   ├── seed.sql            # Semilla sintética de desarrollo
│   └── config.toml         # Configuración del CLI local de Supabase con redirect allowlist
│
└── .github/workflows/ci.yml # Quality gates, Mobile gates, DB gates & Auth integration gates
```

---

## 🛠️ Stack Tecnológico Congelado (Fase 2 v1.1)

- **Gestor de Paquetes:** `pnpm@11.17.0` (Monorepo Workspaces con un único `pnpm-lock.yaml`)
- **Orquestador:** `turbo@2.10.7`
- **Lenguaje / TypeScript Matrix:**
  - TypeScript (root / web / shared): `5.8.2` (Strict Mode)
  - TypeScript (Expo mobile apps): `6.0.3` (Expo SDK 57 compatible)
- **Entorno:** `Node.js 24.18.0 LTS`
- **Mobile Stack:** `Expo SDK 57` (`react-native` 0.86.2, `react` 19.2.3, `expo-router` 57.0.14, `expo-secure-store` 57.0.1, Expo 57.0.14)
- **Web Stack:** `Next.js 16.2.12 Active LTS` (App Router, Turbopack, `eslint-config-next` 16.2.12, `@supabase/ssr`)
- **Base de Datos & Backend:** `Supabase CLI 2.110.0` (PostGIS, PostgreSQL 15+, RLS denegado por defecto, SELECT grants para `authenticated`, types generados por CLI 2.110.0 para `--schema public`)
- **Diagnostic Tool:** `expo-doctor 1.20.1`

---

## 🚀 Comandos de Desarrollo

```bash
# Instalación de dependencias
pnpm install

# Generación de tipos de base de datos Supabase
pnpm db:types

# Verificación de formato Prettier
pnpm format:check

# Verificación de linter ESLint v9
pnpm lint

# Verificación de compilación de tipos TypeScript
pnpm typecheck

# Ejecución de unit tests de dominio
pnpm test

# Compilación de producción de apps web Next 16
pnpm build
```

---

## 🔒 Convenciones de Git y Calidad

- **Commits:** Mensajes bajo la convención _Conventional Commits_ (ej. `feat(auth): ...`, `fix(security): ...`).
- **Prohibido:** No añadir atribución ni firmas AI en commits ("Co-Authored-By").
- **Quality Gates:** El código solo puede unirse tras aprobar format, lint, typecheck, unit tests, web build, expo config/doctor/export, pgTAP db test y auth integration test.
