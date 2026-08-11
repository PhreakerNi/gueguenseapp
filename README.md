# GÜEGÜENSE — Plataforma Logística y Delivery B2B Bajo Demanda

**Versión:** 1.0.0-phase1  
**Estado:** FASE 0 — ✅ APROBADA \| FASE 1 — 🟡 EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Rama de Desarrollo:** `phase/1-foundation`  
**Repositorio Oficial:** `https://github.com/PhreakerNi/gueguenseapp.git`  
**Directiva Arquitectónica Vigente:** `Gueguense_Paquete_Unico_Cerebro_Agente_Fase1_v1_0.md`

---

## 📌 Visión del Proyecto

**Güegüense** es una infraestructura digital de logística y delivery bajo demanda diseñada primordialmente para **negocios (B2B)** que necesitan contratar motorizados verificados de forma rápida, segura y confiable.

---

## 🏗️ Arquitectura de Aplicaciones Canónicas (Monorepo)

```text
gueguenseapp/
├── apps/
│   ├── business-mobile/    # App móvil Expo SDK 57 (React Native) para comercios
│   ├── driver-mobile/      # App móvil Expo SDK 57 (React Native) para motorizados
│   ├── admin-web/          # Panel administrativo Web Next.js 16.x (App Router)
│   └── tracking-web/       # Portal web de seguimiento Next.js 16.x (App Router)
│
├── packages/
│   ├── types/              # Definiciones TypeScript globales y tipos DB generados
│   ├── schemas/            # Schemas Zod y validaciones compartidas
│   ├── domain/             # Estados canónicos, guards puros y lógica pura
│   ├── ui/                 # Design System tokens y componentes compartidos
│   └── config/             # TSConfig base y configuraciones compartidas
│
├── supabase/               # Configuración Oficial Supabase CLI
│   ├── migrations/         # Migraciones SQL de Fundación (Identity, Business, Driver)
│   ├── functions/          # Edge Functions Serverless (TypeScript/Deno)
│   ├── tests/              # Pruebas pgTAP de RLS y schema foundation
│   ├── seed.sql            # Datos sintéticos para entorno de desarrollo local
│   └── config.toml         # Configuración del proyecto local Supabase CLI
│
└── docs/                   # Especificación técnica oficial
```

---

## 📚 Índice Canónico de Documentación Técnica (/docs)

1. [01_PRODUCT_SPEC.md](docs/01_PRODUCT_SPEC.md) — Especificación de Producto, 4 Apps Canónicas, KPIs e Invariantes.
2. [02_USER_ROLES.md](docs/02_USER_ROLES.md) — Identidad `auth.users`, Roles de Plataforma, Membresías Comerciales (`business_member_locations` N:M) y Residencia de Custodia en Cuentas Suspendidas.
3. [03_USER_FLOWS.md](docs/03_USER_FLOWS.md) — Flujos UX Alineados con Máquina de Estados (`ARRIVED_PICKUP` $\rightarrow$ `PICKED_UP` $\rightarrow$ `TO_DROPOFF`), Devolución y Custodia.
4. [04_DELIVERY_STATE_MACHINE.md](docs/04_DELIVERY_STATE_MACHINE.md) — Matriz Formal de Transiciones con 11 Atributos por Transición, Inmutabilidad de Quote Consumido y Sub-sistema de Incidentes.
5. [05_SYSTEM_ARCHITECTURE.md](docs/05_SYSTEM_ARCHITECTURE.md) — Arquitectura de Sistemas, Ingesta GPS Validada por Backend y Tracking Web MVP vía Adaptive Short Polling.
6. [06_DATABASE_ARCHITECTURE.md](docs/06_DATABASE_ARCHITECTURE.md) — Esquema Relacional PostgreSQL Completo (37 Entidades MVP individualizadas con plantilla de 15 propiedades, `idempotency_keys` para Webhooks/System, `notification_deliveries`).
7. [07_API_CONTRACTS.md](docs/07_API_CONTRACTS.md) — Contratos REST API Completos Especificados por Tablas de Mutación Crítica por Dominio (12 columnas estrictas por fila) y Semántica de Procesamiento Interno de Payout (`REQUESTED` $\rightarrow$ `APPROVED` $\rightarrow$ `PROCESSING` $\rightarrow$ `PAID`/`FAILED`).
8. [08_DISPATCH_ENGINE.md](docs/08_DISPATCH_ENGINE.md) — Motor de Despacho (Algoritmo 13 Pasos, Scoring, Compute Route Matrix Top-N), Mutex `driver_presence`, Freshness GPS y Permisos Security Definer.
9. [09_TRACKING_ARCHITECTURE.md](docs/09_TRACKING_ARCHITECTURE.md) — Rastreabilidad Adaptativa, Polling, Headers `no-store` / `no-referrer` y Visibilidad de OTP en `OTP_ALLOWED_STATES`.
10. [10_PRICING_ENGINE.md](docs/10_PRICING_ENGINE.md) — Tarificación Quoted vs Final, Entidad `pricing_adjustments` (`MANUAL_ADJUSTMENT`) y Umbrales Configurables (`initial default / configurable policy`).
11. [11_FINANCIAL_LEDGER.md](docs/11_FINANCIAL_LEDGER.md) — Contabilidad Doble Entrada (Journal + Postings), Convención `+` Débito / `-` Crédito, Suma Cero, Ciclo Payouts (`REQUESTED` $\rightarrow$ `APPROVED` $\rightarrow$ `PROCESSING` $\rightarrow$ `PAID`) y Ejemplos por `transaction_type`.
12. [12_SECURITY_ARCHITECTURE.md](docs/12_SECURITY_ARCHITECTURE.md) — Hardened Security Definer, Threat Model Evaluado (20 Amenazas) y Ciclo de Vida de Secretos en `private.delivery_secrets`.
13. [13_NOTIFICATIONS.md](docs/13_NOTIFICATIONS.md) — Notificaciones Push Best-Effort, Outbox Pattern, Entidad `notification_deliveries` y Reintentos con Exponential Backoff + Jitter.
14. [14_ADMIN_OPERATIONS.md](docs/14_ADMIN_OPERATIONS.md) — Panel de Control Administrativo (17 Módulos Operativos con Roles Mínimos, Justificación `reason` y Cuatro Ojos Configurable).
15. [15_ERROR_AND_EDGE_CASES.md](docs/15_ERROR_AND_EDGE_CASES.md) — Catálogo Completo de Casos Límite (31 Casos con Estados Canónicos Exactos y Sin Pseudoestados Operativos).
16. [16_DESIGN_SYSTEM.md](docs/16_DESIGN_SYSTEM.md) — Sistema de Diseño, Tokens Visuales, Layouts de Delivery Activo y Componentes UX.
17. [17_TESTING_STRATEGY.md](docs/17_TESTING_STRATEGY.md) — Estrategia de Pruebas Unitarias, RLS, Concurrencia Dual, Ingesta GPS Validada, Idempotencia No Humana y Payout States.
18. [18_OBSERVABILITY.md](docs/18_OBSERVABILITY.md) — Logs Estructurados, Redacción Recursiva de PII, Sanitización de URLs/Headers, Omisión de Bearer Tokens en Access Logs y Reducción de Precisión GPS.
19. [19_DEPLOYMENT_ARCHITECTURE.md](docs/19_DEPLOYMENT_ARCHITECTURE.md) — Pipeline CI/CD, Promoción Dev $\rightarrow$ Staging $\rightarrow$ Prod, Secrets Ownership, Restore Drills, Drift Check y Forced Upgrade.
20. [20_DEVELOPMENT_ROADMAP.md](docs/20_DEVELOPMENT_ROADMAP.md) — Hoja de Ruta (Estado: `FASE 0 — ✅ APROBADA | FASE 1 — 🟡 EN REVISIÓN / CANDIDATA A APROBACIÓN`).
21. [21_CANONICAL_ENUMS.md](docs/21_CANONICAL_ENUMS.md) — Diccionario Canónico Completo de Enumeradores y Statuses Auxiliares `CHECK-backed` de Base de Datos.
