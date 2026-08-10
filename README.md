# GÜEGÜENSE — Plataforma Logística y Delivery B2B Bajo Demanda

**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Repositorio Oficial:** `https://github.com/PhreakerNi/gueguenseapp.git`

---

## 📌 Visión del Proyecto

**Güegüense** es una infraestructura digital de logística y delivery bajo demanda diseñada primordialmente para **negocios (B2B)** que necesitan contratar motorizados verificados de forma rápida, segura y confiable.

A diferencia de las plataformas de consumo tradicional (marketplaces de comida), Güegüense prioriza la **capa logística**: un negocio (restaurante, farmacia, e-commerce, tienda, emprendimiento) con un paquete listo puede solicitar un motorizado verificado en menos de 1 minuto, monitorear la ruta en tiempo real y asegurar la entrega sin necesidad de armar un catálogo previo de productos.

---

## 🏗️ Arquitectura Futura del Proyecto (Monorepo & Supabase CLI)

El proyecto se estructurará como un **monorepo modular** alineado con las herramientas oficiales de Supabase CLI y Expo:

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
└── docs/                   # Especificación técnica oficial del proyecto (Fase 0)
```

---

## 📚 Índice de Documentación Técnica (/docs)

Toda la arquitectura y especificación del sistema se encuentra organizada en el directorio `/docs`:

1. [01_PRODUCT_SPEC.md](docs/01_PRODUCT_SPEC.md) — Especificación de Producto y Modelo B2B.
2. [02_USER_ROLES.md](docs/02_USER_ROLES.md) — Modelo de Roles (Plataforma vs Membresía Comercial) y RLS.
3. [03_USER_FLOWS.md](docs/03_USER_FLOWS.md) — Flujos de Usuario Alineados con la Máquina de Estados.
4. [04_DELIVERY_STATE_MACHINE.md](docs/04_DELIVERY_STATE_MACHINE.md) — Máquina de Estados, Sub-ciclos de Incidentes y Devolución.
5. [05_SYSTEM_ARCHITECTURE.md](docs/05_SYSTEM_ARCHITECTURE.md) — Arquitectura Técnica de Sistemas y Supabase Integration.
6. [06_DATABASE_ARCHITECTURE.md](docs/06_DATABASE_ARCHITECTURE.md) — Modelo Relacional PostgreSQL (`auth.users`), Índices y Schemas.
7. [07_API_CONTRACTS.md](docs/07_API_CONTRACTS.md) — Contratos de API REST, Endpoints, DTOs e Idempotencia Obligatoria.
8. [08_DISPATCH_ENGINE.md](docs/08_DISPATCH_ENGINE.md) — Motor de Despacho Atómico, Doble Invariante y Google Routes API.
9. [09_TRACKING_ARCHITECTURE.md](docs/09_TRACKING_ARCHITECTURE.md) — Rastreabilidad GPS Adaptativa, Ingesta Autenticada y Privacidad.
10. [10_PRICING_ENGINE.md](docs/10_PRICING_ENGINE.md) — Motor de Tarifas, Precios Cotizados vs Finales y Ajustes.
11. [11_FINANCIAL_LEDGER.md](docs/11_FINANCIAL_LEDGER.md) — Contabilidad Doble Entada (Journal + Postings) y Control de Efectivo.
12. [12_SECURITY_ARCHITECTURE.md](docs/12_SECURITY_ARCHITECTURE.md) — Modelo de Seguridad, Threat Model, Hardened Security Definer y OTP Hash.
13. [13_NOTIFICATIONS.md](docs/13_NOTIFICATIONS.md) — Notificaciones Push Best-Effort, Outbox Pattern y Canales Privados.
14. [14_ADMIN_OPERATIONS.md](docs/14_ADMIN_OPERATIONS.md) — Operaciones de Control, Verificaciones e Intervención de Incidentes.
15. [15_ERROR_AND_EDGE_CASES.md](docs/15_ERROR_AND_EDGE_CASES.md) — Catálogo de Casos Límite y Protocolos de Mitigación y Custodia.
16. [16_DESIGN_SYSTEM.md](docs/16_DESIGN_SYSTEM.md) — Sistema de Diseño, Tokens Visuales, UX Móvil y Ergonomía.
17. [17_TESTING_STRATEGY.md](docs/17_TESTING_STRATEGY.md) — Estrategia de Pruebas Unitarias, RLS, Concurrencia Doble y E2E.
18. [18_OBSERVABILITY.md](docs/18_OBSERVABILITY.md) — Logs Estructurados, Correlation IDs, Redacción de PII y Telemetría.
19. [19_DEPLOYMENT_ARCHITECTURE.md](docs/19_DEPLOYMENT_ARCHITECTURE.md) — Pipeline de CI/CD, Estrategia Expand/Contract y Secretos.
20. [20_DEVELOPMENT_ROADMAP.md](docs/20_DEVELOPMENT_ROADMAP.md) — Hoja de Ruta de Desarrollo Fase por Fase (Fase 0: En Revisión).

---

## 🚫 Regla de Ejecución (Fase 0)

Durante la **Fase 0 (EN REVISIÓN)**, queda estrictamente prohibida la inicialización de frameworks, instalación de dependencias npm o creación de migraciones/tablas de base de datos. Toda implementación técnica iniciará únicamente tras la aprobación formal de la documentación técnica.
