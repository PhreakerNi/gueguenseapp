# 05 — ARQUITECTURA TÉCNICA DE SISTEMAS (SYSTEM ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Arquitectura de Software, Estructura Supabase CLI, Google Routes API y Realtime Autorizado  

---

## 1. Estructura Canónica del Repositorio (Monorepo & Supabase CLI)

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

## 2. Ingesta GPS y Estrategia de Realtime Autorizado

### 2.1 Pipeline de Ingesta GPS Autenticada
```text
 ┌───────────────────────────┐
 │ App Driver (Sensor GPS)   │ Captura lat/lng, accuracy, heading, speed y timestamp.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Ingesta Autenticada API   │ Endpoint REST/RPC `POST /api/v1/driver/location`.
 └─────────────┬─────────────┘ Validaciones: (1) JWT válido, (2) Velocidad dentro de
               │              rango configurable, (3) Accuracy < 50m.
               ▼
 ┌───────────────────────────┐
 │ DB Update (`driver_pres.`)│ Actualiza registro en PostgreSQL PostGIS.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Broadcast Autorizado      │ Emisión en Canales Privados (`delivery:{id}`).
 └───────────────────────────┘
```

### 2.2 Canales Privados de Realtime y Sesión Scoped para Tracking Web
* `delivery:{delivery_id}`: Canal privado con autorización JWT para el negocio emisor y el conductor asignado.
* `driver:{driver_id}:offers`: Canal privado para emisión atómica de ofertas.
* **Tracking Web Transport Strategy:** El token de la URL de tracking **NUNCA autoriza directamente un canal Supabase**. El cliente llama a `POST /api/v1/tracking/{token}/realtime-session`, donde el backend valida el token hash y le otorga un canal temporal con scope restringido a esa entrega. Se cuenta con fallback de **Short Polling** en caso de desconexión.

---

## 3. Separación Estricta de API Keys de Mapas

1. **Client Maps SDK Key:** Restringida por Application ID / Bundle ID / HTTP Referrer. Renderizado de mapas gráficos.
2. **Server Routes API Key:** Restringida por IP de servidor. Utilizada exclusivamente desde Supabase Edge Functions para `Compute Route Matrix`. NUNCA expuesta a clientes.
