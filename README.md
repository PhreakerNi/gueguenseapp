# GÜEGÜENSE — Plataforma Logística y Delivery B2B Bajo Demanda

**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Repositorio Oficial:** `https://github.com/PhreakerNi/gueguenseapp.git`  
**Directiva Arquitectónica Vigente:** `Gueguense_Auditoria_Cerebro_Fase0_v1_3.md`

---

## 📌 Visión del Proyecto

**Güegüense** es una infraestructura digital de logística y delivery bajo demanda diseñada primordialmente para **negocios (B2B)** que necesitan contratar motorizados verificados de forma rápida, segura y confiable.

A diferencia de las plataformas de consumo tradicional (marketplaces de comida), Güegüense prioriza la **capa logística**: un negocio (restaurante, farmacia, e-commerce, tienda, emprendimiento) con un paquete listo puede solicitar un motorizado verificado en menos de 1 minuto, monitorear la ruta en tiempo real y asegurar la entrega sin necesidad de armar un catálogo previo de productos.

---

## 🏗️ Arquitectura del Monorepo & Supabase CLI

```text
gueguenseapp/
├── apps/
│   ├── business-mobile/    # App móvil React Native (Expo) para comercios
│   ├── driver-mobile/      # App móvil React Native (Expo) para motorizados
│   ├── admin-web/          # Panel administrativo Web Next.js (Supabase SSR)
│   └── tracking-web/       # Portal web de seguimiento público de entregas
│
├── packages/
│   ├── types/              # Definiciones TypeScript globales
│   ├── schemas/            # Schemas Zod / validaciones compartidas
│   ├── domain/             # Lógica de negocio y máquina de estados pura
│   ├── ui/                 # Design System & componentes compartidos
│   └── config/             # Configuraciones compartidas (ESLint, TS, Tailwind)
│
├── supabase/               # Configuración Oficial Supabase CLI
│   ├── migrations/         # Migraciones SQL versionadas (Expand/Contract)
│   ├── functions/          # Edge Functions Serverless (TypeScript/Deno)
│   ├── tests/              # Pruebas de integración pgTAP y RLS Policies
│   ├── seed.sql            # Datos semilla para entorno local
│   └── config.toml         # Configuración del proyecto Supabase
│
└── docs/                   # Especificación técnica oficial (Fase 0)
```

---

## 📚 Índice Canónico de Documentación Técnica (/docs)

1. [01_PRODUCT_SPEC.md](docs/01_PRODUCT_SPEC.md) — Especificación de Producto, Alcance B2B, KPIs e Invariantes.
2. [02_USER_ROLES.md](docs/02_USER_ROLES.md) — Identidad `auth.users`, Roles de Plataforma vs Membresías Comerciales y Permisos Manager.
3. [03_USER_FLOWS.md](docs/03_USER_FLOWS.md) — Flujos UX Alineados con Máquina de Estados (incluyendo `PICKED_UP`), Devolución y Custodia.
4. [04_DELIVERY_STATE_MACHINE.md](docs/04_DELIVERY_STATE_MACHINE.md) — Matriz Formal de Transiciones de Estado, Sub-sistema de Incidentes y Devoluciones.
5. [05_SYSTEM_ARCHITECTURE.md](docs/05_SYSTEM_ARCHITECTURE.md) — Arquitectura de Sistemas, Supabase Integration e Ingesta GPS.
6. [06_DATABASE_ARCHITECTURE.md](docs/06_DATABASE_ARCHITECTURE.md) — Esquema Relacional PostgreSQL Completo (34 Entidades individualizadas, `private.delivery_secrets`, `private.tracking_tokens` e `idempotency_keys`).
7. [07_API_CONTRACTS.md](docs/07_API_CONTRACTS.md) — Contratos REST API Completos, DTOs, Idempotencia, Endpoints de Customer Tracking y Secretos.
8. [08_DISPATCH_ENGINE.md](docs/08_DISPATCH_ENGINE.md) — Motor de Despacho Atómico, Doble Invariante, Orden Único de Locks (`DRIVER_PRESENCE` $\rightarrow$ `DELIVERY` $\rightarrow$ `OFFER`) y Security Definer (`SET search_path = ''`).
9. [09_TRACKING_ARCHITECTURE.md](docs/09_TRACKING_ARCHITECTURE.md) — Rastreabilidad Adaptativa, Ingesta Autenticada, Sesión Realtime Scoped y Hash de Tokens.
10. [10_PRICING_ENGINE.md](docs/10_PRICING_ENGINE.md) — Tarificación Quoted vs Final y Entidad `pricing_adjustments` (`MANUAL_ADJUSTMENT`).
11. [11_FINANCIAL_LEDGER.md](docs/11_FINANCIAL_LEDGER.md) — Contabilidad Doble Entrada (Journal + Postings), 10 Ejemplos de Asientos Zero-Sum y Control de Efectivo.
12. [12_SECURITY_ARCHITECTURE.md](docs/12_SECURITY_ARCHITECTURE.md) — Hardened Security Definer, Threat Model Completo (20 Amenazas) y Cifrado de OTP (`otp_digest` + `otp_ciphertext`).
13. [13_NOTIFICATIONS.md](docs/13_NOTIFICATIONS.md) — Notificaciones Push Best-Effort, Outbox Pattern, Deduplicación y Reintentos con Exponential Backoff.
14. [14_ADMIN_OPERATIONS.md](docs/14_ADMIN_OPERATIONS.md) — Panel de Control Administrativo (17 Módulos Operativos y MFA/Step-Up).
15. [15_ERROR_AND_EDGE_CASES.md](docs/15_ERROR_AND_EDGE_CASES.md) — Catálogo Completo de Casos Límite (31 Casos con Detección, UX y Recuperación).
16. [16_DESIGN_SYSTEM.md](docs/16_DESIGN_SYSTEM.md) — Sistema de Diseño, Tokens Visuales, Layouts de Delivery Activo y Componentes UX.
17. [17_TESTING_STRATEGY.md](docs/17_TESTING_STRATEGY.md) — Estrategia de Pruebas Unitarias, RLS, Concurrencia Dual, Custodia y Resiliencia.
18. [18_OBSERVABILITY.md](docs/18_OBSERVABILITY.md) — Logs Estructurados, Redacción Recursiva de PII, Correlation IDs y Niveles de Log.
19. [19_DEPLOYMENT_ARCHITECTURE.md](docs/19_DEPLOYMENT_ARCHITECTURE.md) — Pipeline CI/CD, Estrategia Expand/Contract, Entornos y Estrategia de Actualización Forzada de Apps.
20. [20_DEVELOPMENT_ROADMAP.md](docs/20_DEVELOPMENT_ROADMAP.md) — Hoja de Ruta (Estado: `FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN`).
21. [21_CANONICAL_ENUMS.md](docs/21_CANONICAL_ENUMS.md) — Diccionario Canónico Completo de Enumeradores sin Abreviaciones.

---

## 🚫 Regla de Ejecución (Fase 0)

Durante la **Fase 0 (EN REVISIÓN)**, queda strictly prohibida la inicialización de frameworks, instalación de dependencias npm o creación de migraciones de base de datos. Toda implementación técnica iniciará únicamente tras la aprobación formal del Cerebro/usuario.
