# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE

# FASE 4 — GESTIÓN DE COTIZACIÓN DE ENVÍOS (QUOTE ENGINE) v1.0

**Repositorio:** `https://github.com/PhreakerNi/gueguenseapp`  
**Base:** `main`  
**SHA base auditado:** `ae90e5582339afe8ff53b9a402d1ee24b04ae862`  
**Rama a crear:** `phase/4-quote-engine`

## 0. Dictamen

```text
✅ FASE 0 — CERRADA
✅ FASE 1 — CERRADA
✅ FASE 2 — CERRADA
✅ FASE 3 — CERRADA EN MAIN
🟢 FASE 4 — AUTORIZADA
⛔ FASE 5 — NO AUTORIZADA
```

F4 debe implementar la cotización oficial del flujo **Solo Delivery**. Debe producir una tarifa versionada, auditable y expirable usando distancia/tiempo vial de Google Routes API. F4 NO crea todavía una entrega.

---

## 1. Arranque obligatorio

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git rev-parse HEAD
```

Debe devolver exactamente:

```text
ae90e5582339afe8ff53b9a402d1ee24b04ae862
```

Si `main` cambió: **DETENERSE**, no crear F4 y reportar el nuevo HEAD al Cerebro.

Si coincide:

```bash
git checkout -b phase/4-quote-engine
git push -u origin phase/4-quote-engine
```

Trabajar únicamente en `phase/4-quote-engine`. No merge a `main`.

---

## 2. Fuentes canónicas

Mantener consistencia con:

```text
Gueguense_Documento_Maestro_Proyecto.md
docs/01_PRODUCT_SPEC.md
docs/03_USER_FLOWS.md
docs/06_DATABASE_ARCHITECTURE.md
docs/07_API_CONTRACTS.md
docs/10_PRICING_ENGINE.md
docs/12_SECURITY_ARCHITECTURE.md
docs/15_ERROR_AND_EDGE_CASES.md
docs/20_DEVELOPMENT_ROADMAP.md
docs/21_CANONICAL_ENUMS.md
```

Ciclo canónico:

```text
DRAFT → QUOTED → CONSUMED
          ├──→ EXPIRED
          └──→ CANCELED
```

En F4 implementar solamente:

```text
DRAFT → QUOTED
QUOTED → EXPIRED
QUOTED → CANCELED
```

`CONSUMED` debe existir como estado permitido, pero F4 NO debe exponer ninguna operación que lo produzca. La transición atómica `QUOTED → CONSUMED + create delivery` pertenece a F5.

---

## 3. Fuera de alcance

NO implementar en F4:

```text
public.deliveries
POST /api/v1/deliveries
SEARCHING_DRIVER
dispatch
delivery_offers
driver assignment
GPS/tracking
pickup code
DELIVERY_OTP
returns
handoff
incidents
ledger
cash settlements
payouts
payments
push notifications
pricing zones
surge/demand pricing
pricing adjustments
final_price
```

No crear placeholders que simulen F5.

---

## 4. Inmutabilidad de migraciones

Todas las migraciones existentes hasta F3 quedan congeladas. No modificar:

```text
20260811000001_foundation_extensions_schema.sql
20260811000002_foundation_identity_business.sql
20260811000003_foundation_driver.sql
20260819000001_phase3_onboarding_and_verification.sql
20260819000002_phase3_closure_v1_2.sql
20260820000001_phase3_security_closure_v1_3.sql
20260820000002_phase3_security_microclosure_v1_4.sql
```

Nueva migración inicial recomendada:

```text
supabase/migrations/20260821000001_phase4_quote_engine.sql
```

Correcciones posteriores: nuevas migraciones aditivas. Nunca reescribir una migración ya ejecutada.

Agregar gate CI que verifique que migraciones pre-F4 son idénticas al SHA base `ae90e558...`.

---

## 5. Modelo de datos F4

Implementar como mínimo:

```text
public.pricing_versions
public.pricing_rules
public.delivery_requests
public.delivery_quotes
private.route_quote_cache
```

### 5.1 `public.pricing_versions`

Campos mínimos:

```text
id UUID PK
name TEXT NOT NULL
currency TEXT NOT NULL DEFAULT 'NIO'
effective_from TIMESTAMPTZ NOT NULL
effective_to TIMESTAMPTZ NULL
is_active BOOLEAN NOT NULL DEFAULT false
quote_ttl_seconds INTEGER NOT NULL DEFAULT 300
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

Invariantes:

```text
currency='NIO' en MVP
quote_ttl_seconds > 0
quote_ttl_seconds <= 3600
máximo una pricing_version global activa en F4
```

300 segundos es el default inicial configurable; no convertirlo en un invariante rígido.

### 5.2 `public.pricing_rules`

```text
id UUID PK
pricing_version_id UUID NOT NULL FK
base_fee NUMERIC(10,2) NOT NULL
per_km_rate NUMERIC(10,2) NOT NULL
per_minute_rate NUMERIC(10,2) NOT NULL
min_fare NUMERIC(10,2) NOT NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

F4: una regla base por versión (`UNIQUE(pricing_version_id)`). Todos los importes/rates >= 0.

NO agregar todavía zone pricing, surge, demand, discounts, waiting/return/manual adjustments.

### 5.3 `public.delivery_requests`

```text
id UUID PK
business_id UUID NOT NULL FK businesses
location_id UUID NOT NULL FK business_locations
pickup_address_snapshot JSONB NOT NULL
dropoff_address_snapshot JSONB NOT NULL
recipient_name TEXT NOT NULL
recipient_phone TEXT NOT NULL
dropoff_location GEOGRAPHY(Point,4326) NOT NULL
package_type TEXT NOT NULL
cash_to_collect NUMERIC(10,2) NOT NULL DEFAULT 0
created_by UUID NOT NULL FK auth.users
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

Reglas:

```text
location pertenece al business
location activa
business ACTIVE
business member ACTIVE
actor tiene scope sobre location
pickup snapshot sale de DB, nunca de datos confiados al cliente
lat [-90,90]
lng [-180,180]
cash_to_collect >= 0
```

`recipient_phone` es PII: no logs, no analytics, no errores crudos.

### 5.4 `public.delivery_quotes`

```text
id UUID PK
delivery_request_id UUID NOT NULL FK
pricing_version_id UUID NOT NULL FK
status TEXT NOT NULL
currency TEXT NOT NULL
base_amount NUMERIC(10,2) NOT NULL
distance_amount NUMERIC(10,2) NOT NULL
time_amount NUMERIC(10,2) NOT NULL
zone_amount NUMERIC(10,2) NOT NULL DEFAULT 0
demand_amount NUMERIC(10,2) NOT NULL DEFAULT 0
discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0
quoted_total NUMERIC(10,2) NOT NULL
driver_earning_estimate NUMERIC(10,2) NULL
platform_revenue_estimate NUMERIC(10,2) NULL
route_distance_meters BIGINT NOT NULL
route_duration_seconds BIGINT NOT NULL
route_provider TEXT NOT NULL
route_calculated_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
consumed_at TIMESTAMPTZ NULL
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
```

`status` exacto:

```text
DRAFT
QUOTED
CONSUMED
EXPIRED
CANCELED
```

Checks:

```text
route_distance_meters > 0
route_duration_seconds >= 0
quoted_total >= 0
expires_at > created_at para QUOTED
consumed_at NULL salvo CONSUMED
currency='NIO' en MVP
```

Mantener partial unique index: máximo 1 `CONSUMED` por `delivery_request_id`.

No inventar reparto conductor/plataforma. En F4:

```text
driver_earning_estimate = NULL
platform_revenue_estimate = NULL
```

### 5.5 `private.route_quote_cache`

Cache interna para resiliencia de Google Routes:

```text
cache_key TEXT PK
provider TEXT NOT NULL
origin_lat DOUBLE PRECISION NOT NULL
origin_lng DOUBLE PRECISION NOT NULL
destination_lat DOUBLE PRECISION NOT NULL
destination_lng DOUBLE PRECISION NOT NULL
distance_meters BIGINT NOT NULL
duration_seconds BIGINT NOT NULL
calculated_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
```

No guardar PII, address text, JWT o API key. Sin grants a `anon`/`authenticated`.

---

## 6. Fórmula base F4

El cálculo financiero debe ocurrir con PostgreSQL `NUMERIC`, no con float JS como fuente de verdad.

```text
km = route_distance_meters / 1000
minutes = route_duration_seconds / 60

base_amount = base_fee
distance_amount = km * per_km_rate
time_amount = minutes * per_minute_rate

subtotal = base_amount + distance_amount + time_amount
quoted_total = MAX(min_fare, subtotal)
```

Redondear componentes monetarios a 2 decimales explícitamente.

En F4:

```text
zone_amount = 0.00
demand_amount = 0.00
discount_amount = 0.00
```

Una quote emitida conserva su snapshot aunque cambie después la pricing version activa. Nunca recalcular una quote histórica.

---

## 7. Google Routes API

Proveedor oficial: **Google Maps Routes API / Compute Routes**.

Variable SERVER-ONLY:

```text
GOOGLE_MAPS_ROUTES_API_KEY
```

Prohibido:

```text
EXPO_PUBLIC_GOOGLE_MAPS_ROUTES_API_KEY
NEXT_PUBLIC_GOOGLE_MAPS_ROUTES_API_KEY
key en DB
key en cliente
key en logs
```

Origen: siempre `business_locations.location` leído de DB. El cliente no decide pickup lat/lng.

Destino: lat/lng validadas del dropoff.

Guardar solo snapshot necesario:

```text
distanceMeters
duration seconds
provider='GOOGLE_ROUTES'
route_calculated_at
```

No guardar respuesta completa ni headers del proveedor.

---

## 8. Resiliencia de routing

Nunca emitir una cotización oficial con Haversine/PostGIS como fallback silencioso.

Flujo obligatorio:

```text
1. buscar cache vigente origin/destination
2. intentar Google Routes con timeout estricto
3. si falla transitoriamente, 1 retry controlado
4. si Google responde válido: usar resultado y refrescar cache
5. si Google falla definitivamente:
   - cache válida -> usar cache
   - sin cache válida -> 503 PRICING_UNAVAILABLE
```

Haversine puede servir en fases futuras para filtrado grueso, nunca para precio oficial F4.

Variable server-side para test/mock:

```text
GOOGLE_ROUTES_API_URL
```

Default productivo:

```text
https://routes.googleapis.com/directions/v2:computeRoutes
```

El cliente nunca puede controlar esa URL.

---

## 9. API F4

### 9.1 `POST /api/v1/quotes`

Actor: Business Member autenticado.  
`Idempotency-Key: UUID-v4` obligatorio.

Payload mínimo:

```json
{
  "location_id": "<UUID>",
  "dropoff_address": {
    "address_text": "Dirección del destinatario",
    "latitude": 12.123,
    "longitude": -86.123
  },
  "recipient_name": "Cliente",
  "recipient_phone": "+505...",
  "package_type": "PARCEL",
  "cash_to_collect": 0
}
```

No aceptar `business_id`, `pricing_version_id`, price, route metrics, expiry o status como autoridad del cliente.

Respuesta 201:

```json
{
  "quote_id": "<UUID>",
  "delivery_request_id": "<UUID>",
  "status": "QUOTED",
  "currency": "NIO",
  "quoted_total": "100.00",
  "route_distance_meters": 4500,
  "route_duration_seconds": 780,
  "expires_at": "..."
}
```

Dinero serializado de manera estable a 2 decimales.

### 9.2 `GET /api/v1/quotes/{quote_id}`

Solo tenant/scope autorizado.

Antes de responder:

```text
si status=QUOTED y now() >= expires_at:
  backend cambia QUOTED -> EXPIRED
```

No fuga cross-tenant.

### 9.3 `POST /api/v1/quotes/{quote_id}/cancel`

Idempotency obligatoria.

Solo:

```text
QUOTED -> CANCELED
```

`CANCELED` replay seguro. `EXPIRED`/`CONSUMED` no cancelables.

### 9.4 `POST /api/v1/quotes/{quote_id}/requote`

Idempotency obligatoria.

Permitido desde:

```text
EXPIRED
CANCELED
```

Reusar el mismo `delivery_request`, consultar ruta/precio actual y crear una NUEVA quote. No modificar ni borrar la anterior. No permitir requote directo de una `QUOTED` vigente ni de `CONSUMED`.

Esto preserva `1 delivery_request : N delivery_quotes`.

---

## 10. DRAFT → QUOTED sin huérfanos

Diseño recomendado:

```text
Edge:
  autentica
  valida input
  autoriza scope
  obtiene route metrics
  llama RPC transaccional

RPC:
  crea delivery_request
  INSERT quote status='DRAFT'
  calcula NUMERIC
  UPDATE quote -> 'QUOTED'
  retorna snapshot
```

`DRAFT → QUOTED` ocurre dentro de la misma transacción. Si falla, ROLLBACK. No dejar requests o DRAFT huérfanos.

Requote: reutiliza request existente y crea nueva DRAFT→QUOTED en una sola transacción.

---

## 11. Seguridad RPC

Funciones mutativas F4:

```text
SECURITY DEFINER
SET search_path = ''
objetos schema-qualified
validación actor/scope explícita
```

Nombres pueden variar, pero se espera semántica equivalente a:

```text
create_delivery_quote(...)
get_quote_for_actor(...)
expire_quote_if_needed(...)
cancel_quote(...)
create_requote(...)
```

Para RPC sensibles:

```sql
REVOKE EXECUTE ... FROM PUBLIC;
REVOKE EXECUTE ... FROM anon;
REVOKE EXECUTE ... FROM authenticated;
GRANT EXECUTE ... TO service_role;
```

Edge valida JWT y pasa internamente actor id. Cliente nunca decide negocio, pricing version, total, distancia, duración, expiración o status.

---

## 12. RLS

`delivery_requests` y `delivery_quotes`: RLS habilitado.

Authenticated solo puede SELECT si:

```text
member ACTIVE
business ACTIVE
scope válido sobre location
```

No permitir direct `INSERT/UPDATE/DELETE` desde authenticated.

`pricing_versions`/`pricing_rules`: lectura autenticada según arquitectura congelada, sin escritura cliente.

`private.route_quote_cache`: sin acceso cliente.

Probar aislamiento real con JWT de dos negocios diferentes.

---

## 13. Idempotencia

No romper infraestructura F3.

Mutaciones F4:

```text
POST /quotes
POST /quotes/{id}/cancel
POST /quotes/{id}/requote
```

Reglas:

```text
same key + same semantic payload -> replay
same key + different payload -> 422 IDEMPOTENCY_FINGERPRINT_MISMATCH
reordered JSON keys -> same fingerprint
scope de key a actor + operación
```

CRÍTICO para `POST /quotes`:

```text
replay NO vuelve a llamar Google
replay NO crea segundo delivery_request
replay NO crea segunda quote
```

Si la infraestructura F3 necesita extenderse para reservar/replay antes de efectos externos, hacerlo genéricamente sin romper F3.

---

## 14. Business Mobile

Integrar una experiencia funcional de cotización:

```text
seleccionar sucursal autorizada
capturar dirección destino
capturar coordenadas destino válidas
recipient_name
recipient_phone
package_type
cash_to_collect opcional
solicitar quote
ver monto/moneda
distancia/duración
expiración
cancelar
recotizar tras EXPIRED/CANCELED
crear nueva cotización
```

No agregar un proveedor de geocoding/mapas no autorizado solo por F4. Si aún no existe selector geográfico definitivo, implementar contrato address + coordinates limpiamente, sin coordenadas fake/hardcoded.

No mostrar ni ejecutar creación de delivery.

Estados UI mínimos: `loading`, `quoted`, `expired`, `canceled`, `pricing unavailable`, `network error`, `authorization error`.

No mostrar errores crudos de Google/Postgres. No loggear teléfono.

---

## 15. Shared packages

Actualizar coherentemente:

```text
packages/types
packages/schemas
packages/domain
```

Definir como mínimo:

```text
QuoteStatus
CreateQuoteRequest
QuoteResponse
RequoteResponse
CancelQuoteResponse
DeliveryRequest snapshot
Pricing snapshot mínimo
```

`QuoteStatus` exacto: `DRAFT | QUOTED | CONSUMED | EXPIRED | CANCELED`.

---

## 16. Errores normalizados

Como mínimo:

```text
AUTH_REQUIRED
AUTH_INVALID_TOKEN
AUTH_FORBIDDEN
BUSINESS_INACTIVE
INVALID_LOCATION_SCOPE
INVALID_LOCATIONS
VALIDATION_ERROR
PRICING_UNAVAILABLE
QUOTE_NOT_FOUND
QUOTE_EXPIRED
QUOTE_INVALID_STATE
IDEMPOTENCY_KEY_REQUIRED
IDEMPOTENCY_FINGERPRINT_MISMATCH
INTERNAL_SERVER_ERROR
```

Nunca devolver Google raw error, Postgres raw error, stack trace, SQL, JWT, API key o `err.message` general. 5xx genéricos.

---

## 17. Tests DB F4

Crear:

```text
supabase/tests/database/03_phase4_quotes.test.sql
```

Cobertura obligatoria:

```text
- tablas/FKs/checks/indexes
- una pricing version activa
- una rule por version
- TTL y currency
- route metrics checks
- partial unique CONSUMED
- negocio A lee su quote/request
- negocio B no lee A
- sin membership no lee
- member suspended no accede
- business suspended/bloqueado no crea
- employee fuera de scope denied
- owner active con location allowed
- direct authenticated INSERT/UPDATE quote denied
- anon denied
- DRAFT→QUOTED
- QUOTED→EXPIRED
- QUOTED→CANCELED
- EXPIRED/CANCELED no mutan a QUOTED misma fila
- CONSUMED no cancelable
- consumed_at coherente
- quote histórica no muta al cambiar pricing
- fórmula exacta/min fare/redondeo
- zone/demand/discount = 0
- no driver/platform split inventado
- PUBLIC RPC denied
- anon RPC denied
- authenticated direct RPC denied
- service_role permitido
```

Todo PASS / fail 0.

---

## 18. Tests HTTP/Integración F4

Crear, por ejemplo:

```text
tests/quote-integration.test.ts
```

CI usa mock local de Google Routes; nunca llamadas facturables reales.

Cobertura mínima obligatoria:

```text
Q01 create quote -> 201 QUOTED
Q02 pickup viene de DB
Q03 cross-tenant/location denied
Q04 inactive location denied
Q05 suspended business denied
Q06 invalid coordinates validation
Q07 no active pricing -> PRICING_UNAVAILABLE
Q08 no pricing rule -> PRICING_UNAVAILABLE
Q09 Google success metrics accepted
Q10 first failure + retry success
Q11 Google failure + valid cache -> success
Q12 Google failure + no cache -> 503
Q13 no Haversine official fallback
Q14 price formula exact
Q15 expiry from pricing policy
Q16 GET own quote
Q17 GET cross-tenant no leak
Q18 lazy expiry
Q19 cancel QUOTED
Q20 cancel replay
Q21 cancel EXPIRED invalid
Q22 requote EXPIRED -> new quote
Q23 requote CANCELED -> new quote
Q24 requote same request id
Q25 old quote unchanged
Q26 active QUOTED cannot direct requote
Q27 no client CONSUMED path
Q28 same idempotency key -> same quote
Q29 replay no duplicate request/quote
Q30 replay no duplicate Google call
Q31 same key different payload -> 422
Q32 reordered semantic JSON -> replay
Q33 raw provider error hidden
Q34 raw DB error hidden
Q35 generic 500
Q36 no JWT/API key/recipient phone in app logs
```

Todo fail 0.

---

## 19. Unit tests routing/pricing

Separar helpers testeables para:

```text
route response parser
duration parser
coordinate validation
semantic cache key
pricing math contract
quote expiry
provider error normalization
```

Casos: missing routes, missing distance, malformed duration, zero/negative values, timeout, 429, 5xx, network error, cache expired, cache valid.

No aceptar respuestas parciales como quote oficial.

---

## 20. CI F4

Preservar los 5 jobs actuales y agregar:

```text
Phase 4 Quote Engine Integration Gates
```

Objetivo final:

```text
Quality                  PASS
Mobile                   PASS
Foundation DB + pgTAP    PASS
Phase 2 Auth             PASS
Phase 3 Onboarding       PASS
Phase 4 Quote Engine     PASS
```

DB job ejecuta Foundation + F3 + F4 pgTAP. No reducir suites previas.

Mantener:

```text
F2 Auth: 14/14 fail 0
F3 HTTP: 42/42 fail 0
F4 HTTP: fail 0
DB Types Drift: 0
```

Generar tipos y gate:

```bash
supabase gen types typescript --local --schema public > packages/types/src/database.generated.ts
git diff --exit-code -- packages/types/src/database.generated.ts
```

Toda pipeline con `tee` debe usar `set -eo pipefail`. No false-green.

---

## 21. Mock Routes en CI

Mock HTTP local determinista que simule:

```text
200 válido
429
500
timeout
malformed payload
missing route
retry success
cache fallback
```

CI:

```text
GOOGLE_MAPS_ROUTES_API_KEY=test-only-dummy
GOOGLE_ROUTES_API_URL=http://127.0.0.1:<port>/...
```

No imprimir la key.

---

## 22. Secret/PII hygiene

Auditar antes del cierre:

```text
GOOGLE_MAPS_ROUTES_API_KEY
Authorization
Bearer
recipient_phone
SUPABASE_SERVICE_ROLE_KEY
console.log
console.error
err.message
```

Exigir:

```text
no client secret
no Google key Expo
no service role cliente
no raw JWT logs
no phone logs
no raw provider errors
no raw 500
```

---

## 23. Seed y configuración

No insertar tarifa productiva arbitraria en migración.

Fail closed:

```text
sin active pricing version -> PRICING_UNAVAILABLE
sin pricing rule -> PRICING_UNAVAILABLE
```

Fixtures/seed locales pueden usar valores test claramente marcados.

---

## 24. Documentación

Actualizar solo lo necesario para reflejar F4 real. No renumerar roadmap. No agregar Phase 20.

Mantener:

```text
Phase 4 = Gestión de Cotización de Envíos (Quote Engine)
Phase 5 = Creación y Ciclo de Vida del Envío (Delivery Engine)
```

No declarar F4 aprobada. Hasta auditoría: `FASE 4 — EN IMPLEMENTACIÓN / EN REVISIÓN`.

---

## 25. Criterios de cierre

```text
[ ] branch phase/4-quote-engine desde ae90e558...
[ ] migraciones <=F3 intactas
[ ] pricing_versions/rules
[ ] delivery_requests/quotes
[ ] private route cache
[ ] DRAFT→QUOTED
[ ] expiry/cancel/requote
[ ] no client CONSUMED
[ ] no deliveries/F5
[ ] Google Routes server-only
[ ] retry/cache/fail-closed
[ ] no Haversine official fallback
[ ] money NUMERIC
[ ] quote snapshot inmutable
[ ] tenant/RLS/RPC boundary probado
[ ] replay no duplica Google/request/quote
[ ] Business Mobile integrado
[ ] secret/PII hygiene
[ ] Foundation intacta
[ ] F2 Auth 14/14
[ ] F3 HTTP 42/42
[ ] F4 tests fail 0
[ ] DB Types Drift 0
[ ] 6 jobs green
[ ] no merge main
```

---

## 26. Reporte final obligatorio

```text
Repository:
Branch:
Base SHA:
Final SHA:
GitHub Actions Run ID:
GitHub Actions Run URL:

Branch HEAD == tested SHA:

Existing migration immutability:
Foundation/F3 migrations changed:
New F4 migrations:

Jobs:
  Quality:
  Mobile:
  Foundation DB:
  F2 Auth:
  F3 Onboarding:
  F4 Quote Engine:

Foundation pgTAP:
F3 pgTAP:
F4 pgTAP:
Total pgTAP:

F2 Auth:
F3 HTTP:
F4 HTTP:
F4 Unit:
DB Types Drift:

Quote tables:
Pricing tables:
Private route cache:

Quote lifecycle:
  DRAFT -> QUOTED:
  QUOTED -> EXPIRED:
  QUOTED -> CANCELED:
  Client can CONSUME quote:
  Deliveries implemented:

Google Routes:
  Server-only key:
  Real Google called in CI:
  Retry:
  Valid cache fallback:
  Haversine official quote fallback:
  No cache/provider unavailable response:

Idempotency:
  Replay same payload:
  Different payload mismatch:
  Replay duplicates Google call:
  Replay duplicates request/quote:

Tenant isolation:
RPC PUBLIC:
RPC anon:
RPC authenticated:
RPC service_role:

500 raw errors exposed:
Provider raw errors exposed:
JWT/API key/recipient phone logs:

Business Mobile quote flow:

F5 branch created:
F5 implementation started:
Merged main:
```

Última línea EXACTA:

```text
FASE 4 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENERSE.

---

# PROMPT OPERATIVO PARA EL AGENTE

Lee COMPLETAMENTE y ejecuta este archivo.

Repositorio:
`https://github.com/PhreakerNi/gueguenseapp`

Fase:
`4 — Gestión de Cotización de Envíos (Quote Engine)`

Base obligatoria:
`main`

SHA base exacto:
`ae90e5582339afe8ff53b9a402d1ee24b04ae862`

Rama a crear:
`phase/4-quote-engine`

La Fase 3 YA está cerrada en main.

NO reabras F0/F1/F2/F3.
NO modifiques migraciones existentes.
NO inicies F5.
NO implementes deliveries.
NO hagas merge a main.

Implementa únicamente F4:

1. `pricing_versions` + `pricing_rules` base.
2. `delivery_requests` + `delivery_quotes`.
3. `private.route_quote_cache`.
4. Quote status exacto: DRAFT / QUOTED / CONSUMED / EXPIRED / CANCELED.
5. F4 implementa DRAFT→QUOTED, expiry, cancel y requote.
6. CONSUMED existe pero NO tiene endpoint cliente; F5 lo hará atómicamente con delivery.
7. Google Routes API server-only.
8. Pickup coordinates siempre desde `business_locations` DB.
9. Google timeout + 1 retry + valid cache fallback.
10. Sin Google/cache -> 503 PRICING_UNAVAILABLE.
11. JAMÁS Haversine como cotización oficial silenciosa.
12. Cálculo monetario en PostgreSQL NUMERIC y snapshot inmutable.
13. No inventar split driver/platform.
14. Implementar POST /api/v1/quotes.
15. Implementar GET /api/v1/quotes/{id}.
16. Implementar cancel.
17. Implementar requote.
18. Idempotency UUID-v4 en mutaciones.
19. Replay no duplica Google, request ni quote.
20. Tenant isolation/RLS/RPC service-role-only.
21. Business Mobile quote flow funcional.
22. Mock Google Routes local en CI; nunca Google real.
23. Preservar Foundation, F2 Auth y F3 tests.
24. Agregar gate F4 y dejar 6 jobs green.
25. DB Types Drift 0.
26. Push solo a `phase/4-quote-engine`.
27. Esperar CI.
28. Reportar Final SHA + exact Run ID/URL y matriz completa.

Última línea EXACTA:

FASE 4 — EN REVISIÓN / CANDIDATA A APROBACIÓN

Después DETENTE.
