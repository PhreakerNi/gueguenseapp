# GÜEGÜENSE — Plataforma Logística y Delivery B2B Bajo Demanda

**Versión:** 1.0.0-phase1  
**Estado:** FASE 0 — ✅ APROBADA | FASE 1 — 🟡 EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Rama de Desarrollo:** `phase/1-foundation`  
**Repositorio Oficial:** `https://github.com/PhreakerNi/gueguenseapp.git`  
**Directiva Arquitectónica Vigente:** `Gueguense_Paquete_Unico_Cerebro_Agente_Fase1_Cierre_v1_5.md`

---

## 📌 Visión del Proyecto

**Güegüense** es una infraestructura digital de logística y delivery bajo demanda diseñada primordialmente para **negocios (B2B)** que necesitan contratar motorizados verificados de forma rápida, segura y confiable.

---

## 🏗️ Arquitectura de Aplicaciones Canónicas (Monorepo)

```text
gueguenseapp/
├── apps/
│   ├── business-mobile/    # App móvil Expo SDK 57 (React Native 0.86.2) para comercios
│   ├── driver-mobile/      # App móvil Expo SDK 57 (React Native 0.86.2) para motorizados
│   ├── admin-web/          # Panel administrativo Web Next.js 16.2.12 Active LTS (App Router)
│   └── tracking-web/       # Portal web de seguimiento Next.js 16.2.12 Active LTS (App Router)
│
├── packages/
│   ├── types/              # Tipos TypeScript y database.generated.ts
│   ├── schemas/            # Validaciones Zod compartidas
│   ├── domain/             # Estados canónicos de enum 21, guards puros y unit tests
│   ├── ui/                 # Design tokens de 16_DESIGN_SYSTEM.md
│   └── config/             # TSConfig base y convenciones compartidas
│
├── supabase/
│   ├── migrations/         # Migraciones SQL de fundación (identity, business, driver, RLS, PostGIS)
│   ├── tests/database/     # Suite de pruebas de base de datos pgTAP
│   ├── seed.sql            # Semilla sintética de desarrollo
│   └── config.toml         # Configuración del CLI local de Supabase
│
└── .github/workflows/ci.yml # Quality gates & CI pipeline
```

---

## 🛠️ Stack Tecnológico Congelado (Fase 1 v1.5)

- **Gestor de Paquetes:** `pnpm@11.17.0` (Monorepo Workspaces con un único `pnpm-lock.yaml`)
- **Orquestador:** `turbo@2.10.7`
- **Lenguaje / TypeScript Matrix:**
  - TypeScript (root / web / shared): `5.8.2` (Strict Mode)
  - TypeScript (Expo mobile apps): `6.0.3` (Expo SDK 57 compatible)
- **Entorno:** `Node.js 24.18.0 LTS`
- **Mobile Stack:** `Expo SDK 57` (`react-native` 0.86.2, `react` 19.2.3, Expo Router 57.0.12)
- **Web Stack:** `Next.js 16.2.12 Active LTS` (App Router, Turbopack, `eslint-config-next` 16.2.12)
- **Base de Datos & Backend:** `Supabase CLI 2.110.0` (PostGIS, PostgreSQL 15+, RLS denegado por defecto)
- **Diagnostic Tool:** `expo-doctor 1.20.1`

---

## 🚀 Comandos de Desarrollo

```bash
# Instalación de dependencias
pnpm install

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

- **Commits:** Mensajes bajo la convención _Conventional Commits_ (ej. `feat(foundation): ...`, `fix(security): ...`).
- **Prohibido:** No añadir atribución ni firmas AI en commits ("Co-Authored-By").
- **Quality Gates:** El código solo puede unirse tras aprobar format, lint, typecheck, unit tests, web build, expo-doctor y pgTAP db test.
