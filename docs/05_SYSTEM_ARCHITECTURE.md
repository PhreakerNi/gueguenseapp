# 05 — ARQUITECTURA TÉCNICA DE SISTEMAS (SYSTEM ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.6.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Arquitectura de Software, Supabase CLI, Google Routes API e Ingesta Validada por Backend

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

## 2. Ingesta GPS Validada por Backend y RLS Restricted Writes

### 2.1 Pipeline de Ingesta GPS Autenticada

```text
 ┌───────────────────────────┐
 │ App Driver (Sensor GPS)   │ Captura lat/lng, accuracy, heading, speed y timestamp.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Ingesta Autenticada API   │ Endpoint REST/RPC `POST /api/v1/driver/location`.
 └─────────────┬─────────────┘ (1) JWT válido, (2) RPC/Serverless validation logic,
               │               (3) Clasificación de calidad (accuracy > 50m initial default).
               ▼
 ┌───────────────────────────┐
 │ DB Writes (Server-Side)   │ El servidor escribe en `driver_presence` y
 └───────────────────────────┘ `delivery_tracking_points`. RLS bloquea escrituras directas.
```

- **Restricción de Escritura Directa (RLS Protection):** La App Driver **NO escribe directamente** sobre `driver_presence.current_location` ni sobre `delivery_tracking_points` mediante clientes REST/Supabase directos. La actualización requiere atravesar el endpoint o procedimiento almacenado validado.
- **Política de Calidad y Anomalías GPS:** Puntos con baja precisión (`accuracy > 50m initial default / configurable policy`) o velocidad anómala (> 120 km/h initial default) no se descartan de la BD; se clasifican como `location_quality = 'LOW'` o `anomaly_flag = true`.
- **Comportamiento App Terminated:** Si el usuario liquida la app (_kill app_), las transmisiones GPS cesan. El servidor marca la frescura como `STALE` o `UNAVAILABLE` y emite una alerta en Admin.

### 2.2 Arquitectura del Tracking Web MVP (`tracking-web`)

- **Transporte Primario MVP:**

```text
Tracking Web (Sin Cuenta)
├── Utiliza Bearer Tracking Token de la URL
├── Backend valida hash SHA-256 en private.tracking_tokens + expiry/revocation
├── GET /api/v1/tracking/{token} (Obtiene snapshot inicial filtrado por backend DTO)
├── Adaptive Short Polling (Intervalo configurable mientras delivery está activa)
└── Polling se detiene automáticamente en estado terminal (DELIVERED/RETURNED/CANCELED/FAILED)
```

_(Nota: El navegador anónimo/cliente tracking NO tiene acceso RLS directo a tablas GPS ni a `delivery_tracking_points`; consulta únicamente DTOs filtrados desde el backend)._

---

## 3. Configuración de API Keys de Mapas

1. **Client Maps SDK Key:** Restringida por Application ID / Bundle ID / HTTP Referrer. Utilizada en apps cliente para renderizar mapas gráficos.
2. **Server Routes API Key:** Key server-only restringida a Google Routes API. Almacenada en secrets del runtime serverless (Edge Functions). NUNCA se expone a aplicaciones cliente ni en código Expo.
