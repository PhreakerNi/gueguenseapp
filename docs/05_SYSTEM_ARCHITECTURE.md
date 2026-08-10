# 05 — ARQUITECTURA TÉCNICA DE SISTEMAS (SYSTEM ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Arquitectura de Software, Diagramas de Componentes y Supabase Integration  

---

## 1. Visión General de Arquitectura (Monorepo & Supabase CLI)

Güegüense adopta una arquitectura modular limpia orientada al dominio. El sistema separa estrictamente las aplicaciones cliente de la lógica de negocio, centralizando las configuraciones y migraciones en la carpeta oficial `/supabase`.

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
│   ├── migrations/         # Migraciones SQL versionadas
│   ├── functions/          # Edge Functions Serverless (TypeScript/Deno)
│   ├── tests/              # Pruebas pgTAP y RLS Policies
│   ├── seed.sql            # Datos semilla de desarrollo
│   └── config.toml         # Configuración local Supabase
│
└── docs/                   # Especificación técnica (Fase 0)
```

---

## 2. Definición del Stack Tecnológico y Seguridad de Claves

| Capa / Módulo | Tecnología | Función y Seguridad |
| :--- | :--- | :--- |
| **Lenguaje Base** | **TypeScript 5.x** | Tipado estático de extremo a extremo. |
| **Apps Móviles** | **React Native + Expo** | Despliegue iOS/Android con Maps SDK Key restringida por Application ID / Bundle ID. |
| **Web Apps** | **Next.js (App Router)** | Renderizado SSR con Supabase SSR Cookie Auth. |
| **Database & Auth** | **PostgreSQL (Supabase)** | Base de datos relacional con `auth.users` y RLS nativo. |
| **Geoespacial** | **PostGIS Extension** | Descubrimiento espacial (`ST_DWithin`) y polígonos de zonas. |
| **Rutas & ETA** | **Google Maps Routes API** | `Compute Routes` y `Compute Route Matrix` para ETA vial real (vía backend serverless). |
| **Realtime** | **Supabase Realtime (Private)** | Canales privados con autorización por JWT y token de rastreo. |

### Separación Estricta de API Keys:
1. **Client Maps SDK Key:** Restringida por Bundle ID (iOS) / Package Name (Android) / HTTP Referrer (Web). Incluida en la app cliente exclusivamente para renderizado gráfico de mapas.
2. **Server Routes API Key:** Restringida por dirección IP / Servicio de Servidor. Utilizada **EXCLUSIVAMENTE** desde Supabase Edge Functions para calcular matrices de rutas y ETAs reales. NUNCA se expone en las apps móviles.

---

## 3. Arquitectura del Pipeline de Ingesta de Ubicación GPS

Para evitar que clientes maliciosos emitan posiciones GPS falsas directamente vía Realtime, el sistema implementa un pipeline de ingesta autenticado y validado:

```text
 ┌───────────────────────────┐
 │ App Driver (GPS Sensor)   │ Transmite payload con timestamp, accuracy, speed y lat/lng.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Ingesta Autenticada API   │ Endpoint seguro (Valida JWT, velocidad máxima y timestamp).
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Actualización DB & Filter │ Actualiza `driver_presence` (PostgreSQL).
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Broadcast Autorizado      │ Emisión en Canales Privados (`delivery:{id}`).
 └───────────────────────────┘
```

---

## 4. Estrategia de Canales Privados en Realtime

Todo canal de WebSocket sensible utiliza **Canales Privados de Supabase Realtime** con verificación de tokens de autorización:

* `delivery:{delivery_id}`: Autorizado para el negocio emisor, el motorizado asignado y el token de tracking web.
* `driver:{driver_id}:offers`: Canal privado de alta seguridad para recibir ofertas de despacho del motorizado.
* `business:{business_id}`: Canal privado para alertas corporativas de sucursal.
* `admin:operations`: Canal privado para la mesa de control de operadores en Admin.
