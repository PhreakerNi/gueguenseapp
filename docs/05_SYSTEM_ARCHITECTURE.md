# 05 — ARQUITECTURA TÉCNICA DE SISTEMAS (SYSTEM ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Arquitectura de Software, Estructura Supabase CLI, Google Routes API y Realtime  

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

## 2. Ingesta de Ubicación GPS y Canales Privados de Realtime

### 2.1 Pipeline de Ingesta GPS Autenticada
Para evitar que clientes maliciosos emitan posiciones GPS falsas directamente vía Realtime, el sistema implementa un pipeline de ingesta autenticado y validado:

```text
 ┌───────────────────────────┐
 │ App Driver (Sensor GPS)   │ Captura lat/lng, accuracy, heading, speed y timestamp.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Ingesta Autenticada API   │ Endpoint REST/RPC `POST /api/v1/driver/location`.
 └─────────────┬─────────────┘ Validaciones: (1) JWT válido, (2) Velocidad físicamente
               │              posible (<120 km/h), (3) Accuracy < 50m.
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

### 2.2 Canales Privados de Realtime (`private_channels`)
* `delivery:{delivery_id}`: Canal privado con autorización por JWT para el negocio emisor y el conductor asignado.
* `driver:{driver_id}:offers`: Canal privado para emisión de ofertas de viaje entrantes.
* **Tracking Web Token:** El token de la URL de tracking no autoriza directamente un canal Supabase sin pasar por una sesión realtime mediada por el servidor backend con scope restringido.

---

## 3. Separación Estricta de API Keys de Mapas

1. **Client Maps SDK Key:** Restringida por Application ID (Android) / Bundle Identifier (iOS) / HTTP Referrer (Web). Utilizada exclusivamente para renderizado gráfico de mapas en las aplicaciones clientes.
2. **Server Routes API Key:** Restringida por dirección IP / Servicio de Servidor. Utilizada **EXCLUSIVAMENTE** desde Supabase Edge Functions para calcular matrices de rutas y ETAs reales (`Compute Route Matrix`). NUNCA se expone en las apps móviles ni web públicas.
