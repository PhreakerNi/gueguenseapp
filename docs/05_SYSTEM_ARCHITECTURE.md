# 05 — ARQUITECTURA TÉCNICA DE SISTEMAS (SYSTEM ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Arquitectura de Software, Supabase CLI, Google Routes API y Tracking Web MVP  

---

## 1. Estructura Canónica del Monorepo

```text
gueguenseapp/
├── apps/
│   ├── business-mobile/    # App móvil React Native (Expo) para comercios
│   ├── driver-mobile/      # App móvil React Native (Expo) para motorizados
│   ├── admin-web/          # Panel administrativo Web Next.js (Supabase SSR)
│   └── tracking-web/       # Portal web de seguimiento (Protegido por Bearer Token)
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

## 2. Ingesta GPS, Comportamiento App Terminated y Tracking Web MVP

### 2.1 Pipeline de Ingesta GPS Autenticada y Manejo App Terminated
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
 └───────────────────────────┘
```
* **Comportamiento App Terminated:** La captura de localización en segundo plano depende de las políticas del SO del dispositivo. Si el usuario fuerza el cierre de la app (*kill app*), las transmisiones GPS se detendrán. El servidor marcará la frescura de señal como `STALE` o `UNAVAILABLE` y emitirá una alerta preventiva en Admin. Al reabrir la app, el motorizado resincroniza su estado vía REST (`GET /api/v1/driver/deliveries/active`).

### 2.2 Arquitectura del Tracking Web MVP (`tracking-web`)
* **Transporte Primario MVP:**
```text
Tracking Web (Sin Cuenta)
├── Utiliza Bearer Tracking Token de la URL
├── Backend valida hash SHA-256 en private.tracking_tokens + expiry/revocation
├── GET /api/v1/tracking/{token} (Obtiene snapshot inicial)
├── Adaptive Short Polling (Intervalo configurable mientras delivery está activa)
└── Polling se detiene automáticamente en estado terminal (DELIVERED/RETURNED/CANCELED/FAILED)
```
*(Nota: No se utiliza conexión directa a Supabase Realtime para usuarios anónimos en el MVP; las apps autenticadas Business, Driver y Admin sí utilizan canales privados Realtime).*

---

## 3. Configuración de API Keys de Mapas

1. **Client Maps SDK Key:** Restringida por Application ID / Bundle ID / HTTP Referrer. Utilizada en apps cliente para renderizar mapas gráficos.
2. **Server Routes API Key:** Key server-only restringida a Google Routes API. Almacenada en secrets del runtime serverless (Edge Functions). NUNCA se expone a aplicaciones cliente ni en código Expo.
