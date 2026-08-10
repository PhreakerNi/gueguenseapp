# GÜEGÜENSE — Plataforma Logística y Delivery B2B Bajo Demanda

**Versión:** 1.0.0-phase0  
**Estado:** Fase 0 — Especificación y Arquitectura  
**Repositorio Oficial:** `https://github.com/PhreakerNi/gueguenseapp.git`

---

## 📌 Visión del Proyecto

**Güegüense** es una infraestructura digital de logística y delivery bajo demanda diseñada primordialmente para **negocios (B2B)** que necesitan contratar motorizados verificados de forma rápida, segura y confiable.

A diferencia de las plataformas de consumo tradicional (marketplaces de comida), Güegüense prioriza la **capa logística**: un negocio (restaurante, farmacia, e-commerce, tienda, emprendimiento) con un paquete listo puede solicitar un motorizado verificado en menos de 1 minuto, monitorear la ruta en tiempo real y asegurar la entrega sin necesidad de armar un catálogo previo de productos.

---

## 🏗️ Arquitectura Futura del Proyecto (Monorepo)

El proyecto se estructurará como un **monorepo modular** utilizando la siguiente distribución:

```text
gueguenseapp/
├── apps/
│   ├── business-mobile/    # App móvil React Native (Expo) para comercios
│   ├── driver-mobile/      # App móvil React Native (Expo) para motorizados
│   ├── admin-web/          # Panel administrativo Web Next.js
│   └── tracking-web/       # Portal web de seguimiento público de entregas
│
├── packages/
│   ├── ui/                 # Design System & componentes compartilhados
│   ├── types/              # Definiciones TypeScript globales
│   ├── schemas/            # Schemas Zod / validaciones compartidas
│   ├── domain/             # Lógica de negocio y máquina de estados pura
│   └── config/             # Configuraciones compartidas (ESLint, TS, Tailwind)
│
├── backend/                # Serverless Edge Functions / Supabase Functions
│   ├── dispatch/           # Motor de asignación atómica de motorizados
│   ├── pricing/            # Motor de cálculo dinámico de tarifas
│   ├── finance/            # Procesamiento de Ledger contable
│   └── notifications/      # Manejo de Push, SMS y Webhooks
│
├── database/               # Esquema de base de datos PostgreSQL / Supabase
│   ├── migrations/         # Migraciones SQL versionadas
│   ├── seeds/              # Datos semilla para desarrollo/testing
│   ├── policies/           # Políticas de Seguridad Row Level Security (RLS)
│   └── functions/          # Stored procedures y PL/pgSQL atómicos
│
└── docs/                   # Especificación técnica oficial del proyecto (Fase 0)
```

---

## 📚 Índice de Documentación Técnica (/docs)

Toda la arquitectura y especificación del sistema ha sido meticulosamente documentada en el directorio `/docs`:

1. [01_PRODUCT_SPEC.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/01_PRODUCT_SPEC.md) — Especificación de Producto y Modelo B2B.
2. [02_USER_ROLES.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/02_USER_ROLES.md) — Modelo de Roles, Responsabilidades y Permisos.
3. [03_USER_FLOWS.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/03_USER_FLOWS.md) — Flujos de Usuario de Negocio, Motorizado, Admin y Cliente.
4. [04_DELIVERY_STATE_MACHINE.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/04_DELIVERY_STATE_MACHINE.md) — Máquina de Estados de Entrega (Fuente de Verdad).
5. [05_SYSTEM_ARCHITECTURE.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/05_SYSTEM_ARCHITECTURE.md) — Arquitectura Técnica de Sistemas y Componentes.
6. [06_DATABASE_ARCHITECTURE.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/06_DATABASE_ARCHITECTURE.md) — Modelo Relacional PostgreSQL, Índices, Geoespacial & RLS.
7. [07_API_CONTRACTS.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/07_API_CONTRACTS.md) — Contratos de API, Endpoints, DTOs y Esquemas de Error.
8. [08_DISPATCH_ENGINE.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/08_DISPATCH_ENGINE.md) — Motor de Despacho, Selección, Scoring y Asignación Atómica.
9. [09_TRACKING_ARCHITECTURE.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/09_TRACKING_ARCHITECTURE.md) — Arquitectura de Posicionamiento GPS, Realtime y Privacidad.
10. [10_PRICING_ENGINE.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/10_PRICING_ENGINE.md) — Motor de Tarifas, Distancia, Zonas y Recargos.
11. [11_FINANCIAL_LEDGER.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/11_FINANCIAL_LEDGER.md) — Contabilidad de Partida Doble, Ganancias, Efectivo y Retiros.
12. [12_SECURITY_ARCHITECTURE.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/12_SECURITY_ARCHITECTURE.md) — Modelo de Seguridad, Threat Model, RLS y Archivos Privados.
13. [13_NOTIFICATIONS.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/13_NOTIFICATIONS.md) — Eventos del Sistema, Notificaciones Push, SMS y Webhooks.
14. [14_ADMIN_OPERATIONS.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/14_ADMIN_OPERATIONS.md) — Operaciones de Control, Verificaciones e Incidencias.
15. [15_ERROR_AND_EDGE_CASES.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/15_ERROR_AND_EDGE_CASES.md) — Catálogo Completo de Casos Límite y Protocolos de Mitigación.
16. [16_DESIGN_SYSTEM.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/16_DESIGN_SYSTEM.md) — Sistema de Diseño, Tokens Visuales, UX Móvil/Web.
17. [17_TESTING_STRATEGY.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/17_TESTING_STRATEGY.md) — Estrategia de Pruebas Unitarias, Integración, RLS y E2E.
18. [18_OBSERVABILITY.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/18_OBSERVABILITY.md) — Logs Estructurados, Métricas, Trazabilidad y Telemetría.
19. [19_DEPLOYMENT_ARCHITECTURE.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/19_DEPLOYMENT_ARCHITECTURE.md) — Pipeline de CI/CD, Entornos, Secretos y Releases.
20. [20_DEVELOPMENT_ROADMAP.md](file:///c:/Users/acern/Documents/proyectos/delivery%20app/docs/20_DEVELOPMENT_ROADMAP.md) — Hoja de Ruta de Desarrollo Fase por Fase y Definition of Done.

---

## 🚫 Regla de Ejecución (Fase 0)

Durante la **Fase 0**, queda estrictamente prohibida la inicialización de frameworks, instalación de dependencias npm o creación de migraciones de base de datos. Toda implementación técnica iniciará únicamente tras la aprobación formal de la documentación contenida en `/docs`.
