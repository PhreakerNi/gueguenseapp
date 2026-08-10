# GÜEGÜENSE — AUDITORÍA DEL CEREBRO Y DIRECTIVA DE CIERRE DEFINITIVO DE FASE 0

**Versión:** 1.4  
**Estado:** FASE 0 — EN REVISIÓN / NO APROBADA TODAVÍA  
**Base revisada:** ZIP posterior al commit `8da741f`  
**Objetivo:** Resolver únicamente los bloqueos reales restantes. Después de esta ronda no deben introducirse rediseños nuevos salvo un defecto crítico comprobado.

---

# 1. Veredicto del Cerebro

La versión 1.3 corrigió la mayoría de las decisiones estructurales importantes y está cerca de poder aprobarse.

Quedan bloqueos concretos de consistencia, seguridad, datos, API y operación.

**No comenzar Fase 1 todavía.**

Esta v1.4 es una directiva de **cierre**, no una nueva expansión del proyecto.

---

# 2. Jerarquía

Si existe contradicción:

1. Decisión explícita posterior del usuario.
2. Este documento v1.4.
3. `Gueguense_Auditoria_Cerebro_Fase0_v1_3.md`.
4. `Gueguense_Directiva_Cerebro_Fase0_v1_2.md`.
5. `Gueguense_Documento_Maestro_Proyecto.md`.
6. `/docs`.
7. Preferencias del agente.

---

# 3. Arquitectura que queda CONGELADA

No rediseñar estos puntos salvo defecto crítico:

- TypeScript.
- React Native + Expo para Business y Driver.
- Next.js para Admin y Tracking Web.
- PostgreSQL/Supabase.
- PostGIS.
- Supabase Realtime privado para usuarios autenticados cuando aplique.
- Google Routes API para rutas/matrices.
- `auth.users` como identidad.
- Quote y Delivery separados.
- Incidents separados de Delivery.
- Return como `RETURN_REQUIRED → RETURNING → RETURNED`.
- Ledger con `ledger_transactions + ledger_postings`.
- `PICKUP_CODE` separado de `DELIVERY_OTP`.
- OTP de 6 dígitos.
- Fase 9 Catálogo fuera del MVP inicial.

---

# 4. Bloqueo 1 — State Machine formal todavía incompleta

`04_DELIVERY_STATE_MACHINE.md` tiene una buena tabla, pero no cubre toda la máquina canónica y le falta la columna explícita de notificaciones.

Debe quedar una matriz completa con:

```text
FROM
TO
ACTOR
TRIGGER
PRECONDITIONS
SERVER_VALIDATIONS
EVENTS
SIDE_EFFECTS
NOTIFICATIONS
IDEMPOTENCY
DOMAIN_ERRORS
```

## Quote

Documentar:

```text
DRAFT → QUOTED
QUOTED → CONSUMED
QUOTED → EXPIRED
QUOTED → CANCELED
```

## Delivery normal

```text
CREATE → SEARCHING_DRIVER
SEARCHING_DRIVER → DRIVER_ASSIGNED
DRIVER_ASSIGNED → TO_PICKUP
TO_PICKUP → ARRIVED_PICKUP
ARRIVED_PICKUP → PICKED_UP
PICKED_UP → TO_DROPOFF
TO_DROPOFF → ARRIVED_DROPOFF
ARRIVED_DROPOFF → DELIVERED
```

## Reasignación pre-custodia

Permitir de forma controlada:

```text
DRIVER_ASSIGNED → SEARCHING_DRIVER
TO_PICKUP → SEARCHING_DRIVER
ARRIVED_PICKUP → SEARCHING_DRIVER
```

solo si NO existe custodia transferida.

## Return

```text
PICKED_UP → RETURN_REQUIRED
TO_DROPOFF → RETURN_REQUIRED
ARRIVED_DROPOFF → RETURN_REQUIRED
RETURN_REQUIRED → RETURNING
RETURNING → RETURNED
```

## Cancellation

No usar comodines como `* → CANCELED`.

Documentar estados permitidos explícitamente.

Como mínimo:

```text
SEARCHING_DRIVER → CANCELED
DRIVER_ASSIGNED → CANCELED
TO_PICKUP → CANCELED
ARRIVED_PICKUP → CANCELED
```

cuando las reglas de custodia permitan cancelar.

Post-custodia no existe cancelación simple: se usa Return/Handoff.

## Failed

Definir exactamente desde qué estados puede llegarse a `FAILED`.

`FAILED` solo es válido cuando no queda custodia física pendiente.

---

# 5. Bloqueo 2 — Edge Cases usa estados inexistentes

Corregir en `15_ERROR_AND_EDGE_CASES.md`:

```text
SEARCHING
```

por:

```text
SEARCHING_DRIVER
```

Eliminar pseudoestado:

```text
RETURN
```

y utilizar:

```text
RETURN_REQUIRED
```

No usar:

```text
status < PICKED_UP
```

como regla lógica. Los enums no deben depender de una comparación ordinal para seguridad.

Usar listas explícitas de estados permitidos.

`LOCATION_STALE` no cambia `DRIVER_OPERATIONAL_STATE` a `UNAVAILABLE` porque ese valor no existe.

Separar:

```text
tracking freshness = UNAVAILABLE
```

de:

```text
driver operational state
```

---

# 6. Bloqueo 3 — Eventos usados pero no definidos

El consistency pass falló.

Los siguientes eventos aparecen en otros documentos pero no están todos en `EVENT_TYPE`:

```text
SEARCH_EXPANDED
MAPS_FALLBACK_USED
WAITING_STARTED
OTP_ATTEMPT_FAILED
OTP_LOCKED
PAYMENT_FAILED
DRIVER_SUSPENDED
BUSINESS_SUSPENDED
```

Decidir para cada uno:

A. agregarlo al registro canónico de eventos; o  
B. moverlo a un subsistema específico si no es `delivery_event`.

No dejar strings huérfanos.

Agregar también cuando corresponda:

```text
OFFER_CANCELED
RETURN_AUTHORIZED
CUSTODY_RETURNED
HANDOFF_ABORTED
```

si realmente se utilizan.

Todo evento usado debe existir en el diccionario canónico.

---

# 7. Bloqueo 4 — Dispatch: driver_presence y lock real

La versión actual mejoró el orden:

```text
DRIVER/PRESENCE → DELIVERY → OFFER
```

pero el pseudocódigo solo hace `FOR UPDATE OF dp`, no bloquea de forma inequívoca la fila `drivers`.

La documentación debe definir exactamente qué recurso serializa al conductor.

## Decisión

Usar `driver_presence` como **mutex operacional del driver**, ya que existe 1:1 por driver.

Orden:

```text
1. driver_presence
2. delivery
3. delivery_offer
```

Después de bloquear `driver_presence`, leer/verificar el perfil `drivers`.

Validaciones atómicas:

```text
auth.uid() válido
drivers.verification_status = VERIFIED
drivers.account_status = ACTIVE
driver_presence.operational_state IN (AVAILABLE, OFFERED)
driver_presence.location_updated_at cumple freshness de Dispatch
delivery.status = SEARCHING_DRIVER
delivery.driver_id IS NULL
offer.driver_id = auth.uid()
offer.delivery_id = delivery.id
offer.status = OPEN
offer.expires_at > now()
no otra delivery comprometida para ese driver
```

Mantener partial unique index como defensa adicional.

Capturar `unique_violation` y devolver error de dominio.

---

# 8. Bloqueo 5 — Política para cuentas suspendidas DURANTE una entrega

No bloquear ciegamente toda operación de una cuenta suspendida si ya existe custodia.

## Regla

`SUSPENDED` o `BLOCKED`:

- impide nuevas ofertas;
- impide aceptar nuevas deliveries;
- impide crear nuevas operaciones de negocio;
- NO debe dejar un paquete sin ruta de resolución.

Si un Driver es suspendido con delivery activa:

```text
pre-pickup
→ unassign/re-dispatch según estado

post-pickup
→ incidente obligatorio
→ RETURN o CONTROLLED_HANDOFF
→ operaciones mínimas de custodia permitidas bajo autorización del backend/operator
```

Si Business es suspendido con deliveries activas:

- bloquea nuevas quotes/deliveries;
- las entregas activas deben poder concluir o resolver custodia.

Actualizar Security, Edge Cases, API y State Machine.

---

# 9. Bloqueo 6 — Session revocation

Eliminar de Security la frase:

```text
Revocación instantánea de sesión
```

como garantía absoluta.

Documentar:

- revocar sesiones/refresh tokens cuando corresponda;
- access tokens existentes pueden seguir válidos hasta expiración;
- por eso operaciones críticas verifican estado actual de cuenta/membresía en backend/DB.

---

# 10. Bloqueo 7 — Google Routes key y Supabase Edge Functions

Eliminar afirmaciones como:

```text
Server Routes API Key restringida por IP fija de Supabase Edge Functions
```

Supabase Edge Functions no deben asumirse con egress IP estática.

## Regla

- key server-only;
- API restriction exclusivamente a Routes API y APIs necesarias;
- almacenada en secrets del runtime;
- nunca en Expo;
- nunca en frontend;
- si en el futuro se necesita allowlist por IP, usar infraestructura/proxy con egress estático o un runtime que lo garantice.

Actualizar `05_SYSTEM_ARCHITECTURE.md` y `12_SECURITY_ARCHITECTURE.md`.

---

# 11. Bloqueo 8 — Tracking Web: cerrar decisión MVP

No dejar dos arquitecturas abiertas en la especificación principal.

## Decisión MVP

Para `tracking-web`:

```text
Tracking Web
→ bearer tracking token
→ backend valida hash + expiry/revocation
→ GET snapshot
→ adaptive short polling mientras delivery está activa
→ polling se detiene en terminal state
```

Intervalo inicial configurable; no hardcodear como contrato inmutable.

**No usar conexión directa del cliente sin cuenta a Supabase Realtime en el MVP.**

Business, Driver y Admin sí pueden usar canales privados Realtime autenticados.

La Fase 6 podrá evaluar SSE o una credencial realtime efímera como optimización, pero no es dependencia del MVP.

Por lo tanto:

- retirar `scoped_token` como contrato obligatorio actual;
- `POST /tracking/{token}/realtime-session` pasa a FUTURE/OPTIONAL SPIKE, no requisito MVP;
- mantener polling como fallback y arquitectura primaria del customer tracking.

---

# 12. Bloqueo 9 — Tracking token y OTP

Mantener:

```text
otp_digest
otp_ciphertext
otp_key_version
```

Reglas:

- OTP se genera al transferir custodia (`PICKED_UP`) o inmediatamente después.
- No existe antes de ser necesario.
- Tracking token holder puede obtener OTP solo durante estados autorizados:
  - `PICKED_UP`
  - `TO_DROPOFF`
  - `ARRIVED_DROPOFF`
- Después de `DELIVERED`, `RETURN_REQUIRED`, `RETURNING`, `RETURNED`, `CANCELED`, `FAILED`, el endpoint OTP no retorna el valor.
- Driver, Business y Admin nunca obtienen raw OTP.
- Token raw no se almacena en DB.
- Token no aparece en analytics/logs/referrers.

El tracking token puede seguir permitiendo un resumen post-entrega hasta su expiración configurable, pero sin ubicación del driver ni OTP.

---

# 13. Bloqueo 10 — Base de Datos todavía agrupa tablas sin especificarlas

`06_DATABASE_ARCHITECTURE.md` afirma "especificación individualizada", pero agrupa múltiples tablas en una sola sección.

Esto debe corregirse para las tablas relevantes de MVP.

Documentar individualmente, al menos:

```text
pricing_versions
pricing_rules
pricing_zones
pricing_adjustments

ledger_accounts
ledger_transactions
ledger_postings
payments
payouts
cash_settlements

device_tokens
notification_outbox
notification_deliveries

support_tickets
audit_logs
idempotency_keys
delivery_tracking_points
delivery_proofs
custody_handoffs
```

Para cada una:

```text
Purpose
MVP/Post-MVP
PK
Columns
FK
ON DELETE
UNIQUE
CHECK
Indexes
RLS
Writer
Reader
Sensitivity
Lifecycle
Retention
```

No hace falta escribir SQL final.

---

# 14. Bloqueo 11 — Relación Delivery Request → Quotes

Una solicitud puede recalcularse o expirar y recibir una nueva quote.

Cambiar conceptualmente:

```text
delivery_request 1:1 delivery_quote
```

por:

```text
delivery_request 1:N delivery_quotes
```

Solo una quote `CONSUMED` crea una delivery.

Una `delivery` referencia exactamente la quote consumida.

---

# 15. Bloqueo 12 — Business Member location_scope

Actualmente `business_members.location_scope` es una sola FK, mientras UX describe gerentes con sucursales asignadas en plural.

## Decisión MVP

Modelar alcance N:M:

```text
business_members
business_member_locations
```

`business_member_locations`:

```text
business_member_id
business_location_id
```

Reglas:

- owner puede tener scope global;
- manager/employee puede tener una o varias sucursales;
- RLS usa esta relación.

Eliminar ambigüedad de `location_scope` singular.

---

# 16. Bloqueo 13 — Información financiera sensible

No guardar:

```text
payouts.bank_account
```

en plaintext como diseño canónico.

Agregar una abstracción:

```text
driver_payout_methods
```

con:

- provider/type;
- masked display value;
- token/reference del proveedor o ciphertext protegido;
- verification status;
- created_at;
- disabled_at.

`payouts` referencia `payout_method_id`.

Los detalles bancarios reales deben tener tratamiento sensible y acceso restringido.

---

# 17. Bloqueo 14 — Ledger: convención de signos inconsistente

Los ejemplos actuales mezclan "Débito/Crédito" y signos `+/-` de forma contradictoria.

## Decisión canónica

Usar postings firmados:

```text
amount > 0  = DEBIT
amount < 0  = CREDIT
```

Invariante:

```text
SUM(amount) = 0
```

Ejemplo entrega C$100:

```text
ASSET_BUSINESS_RECEIVABLE  +100
LIABILITY_DRIVER            -80
REVENUE_PLATFORM            -20
TOTAL                         0
```

Ejemplo payout C$1,000:

```text
LIABILITY_DRIVER           +1000
ASSET_PLATFORM_BANK        -1000
TOTAL                          0
```

Corregir todos los ejemplos conforme a una sola convención.

No duplicar "entrega normal" y luego "driver earning/platform revenue" como si fueran transacciones separadas si en realidad son postings de la misma operación.

Definir `transaction_type` y cuándo se crea cada journal transaction.

---

# 18. Bloqueo 15 — Cash model

Definir claramente la cuenta:

```text
ASSET_DRIVER_CASH_RECEIVABLE
```

o nombre equivalente.

Representa efectivo perteneciente a otra parte pero físicamente en poder del driver.

No usar un nombre ambiguo que parezca que el efectivo "es del driver".

`cash_settlements` debe documentar:

```text
expected_amount
reported_amount
settled_amount
difference
currency
status
driver_id
verified_by
created_at
settled_at
```

---

# 19. Bloqueo 16 — API Contracts sigue incompleto

`07_API_CONTRACTS.md` solo documenta unos pocos endpoints.

Debe cubrir como mínimo los endpoints/acciones declarados en v1.3 y, para cada mutación crítica:

```text
Auth
Authorization
Request
Response
Allowed Current State
Resulting State
Idempotency
Domain Errors
Events
Notifications
Financial Side Effects
```

No hace falta llenar páginas con JSON repetitivo: puede usarse una tabla consistente por endpoint.

Debe incluir:

## Driver
- onboarding
- document upload authorization
- document registration
- vehicle
- availability
- state
- active offers
- accept
- reject
- active delivery
- arrived pickup
- arrived dropoff
- verify OTP
- incident
- return start
- location ingest
- earnings
- payout request

## Business
- business
- locations
- members
- quote
- consume quote/create delivery
- detail
- cancel
- history
- confirm pickup custody
- support

## Tracking
- snapshot
- OTP customer-only

## Admin
- verification
- suspension/reactivation
- incident resolution
- return/handoff
- pricing
- payouts
- cash settlement
- audit

## Finance
- payment
- payout
- ledger views
- cash settlement

---

# 20. Bloqueo 17 — App terminated

Eliminar la afirmación:

```text
Tareas background persisten estado local
```

como si garantizara tracking cuando el usuario mata la app.

Documentar:

- background location depende del SO;
- si el usuario termina la app, las actualizaciones pueden detenerse;
- al reabrir, resincronizar estado;
- tracking freshness mostrará `STALE/UNAVAILABLE`;
- Admin recibe alerta si una entrega activa pierde ubicación.

---

# 21. Bloqueo 18 — Maps provider failure

No utilizar Haversine como sustituto silencioso del precio vial oficial.

## Regla

PostGIS/Haversine puede servir para:

- coarse candidate discovery;
- estimación de proximidad.

Pero si Routes API falla durante una quote oficial:

- usar cache válido si existe; o
- retry controlado; o
- informar temporalmente que no se puede cotizar.

No facturar automáticamente una ruta oficial basándose solo en línea recta salvo una política explícita aprobada.

---

# 22. Bloqueo 19 — Umbrales configurables

Los siguientes valores pueden ser defaults iniciales, pero no invariantes hardcoded:

```text
offer timeout 15s
quote expiry 5 min
waiting grace 5 min
waiting timeout 15 min
GPS delayed/stale thresholds
tracking polling interval
OTP lock duration
signed URL lifetime
four-eyes payout threshold
dispatch radius expansion
```

Documentar:

```text
configurable policy / initial default
```

No convertir un valor de ejemplo en una regla comercial irreversible.

El threshold de cuatro ojos no debe quedar fijado permanentemente en C$5,000 sin configuración.

---

# 23. Bloqueo 20 — Security Threat Model

Corregir:

- `FAKE_DELIVERY_COMP.` → `FAKE_DELIVERY_COMPLETION`.
- No prometer `revocación instantánea`.
- No prometer "bloqueo automático de IP/JWT" por un único 403.
- No asumir static IP en Edge Functions.
- "background checks" debe describirse como opción sujeta a política/legalidad, no requisito técnico universal.
- Riesgo residual no debe marcarse automáticamente "Bajo" para todas las amenazas; usar evaluación razonada o `TBD` hasta risk assessment.

---

# 24. Bloqueo 21 — Canonical Enums y Consistency Pass

`21_CANONICAL_ENUMS.md` mejoró, pero el resto de `/docs` todavía usa valores fuera del diccionario.

Al finalizar, ejecutar búsqueda global.

No deben quedar:

```text
`SEARCHING`
`RETURN`
`UNAVAILABLE` como DRIVER_OPERATIONAL_STATE
MANUAL_ADJUST
otp_hash
FAKE_DELIVERY_COMP.
```

Todo evento/state/type debe estar definido o claramente marcado como no-enum.

---

# 25. Bloqueo 22 — Product Spec

Corregir:

```text
App Güegüense Negocios (Mobile & Web)
```

si no existe `business-web` en arquitectura.

MVP actual:

```text
business-mobile
driver-mobile
admin-web
tracking-web
```

Tracking Web no es "público" en sentido de acceso libre: es **sin cuenta pero protegido por bearer token**.

---

# 26. Bloqueo 23 — Admin Operations

El catálogo de módulos es correcto, pero debe indicar para cada módulo:

- rol mínimo;
- acciones principales;
- acciones destructivas;
- audit requirements;
- step-up/MFA cuando aplique.

Four-eyes threshold debe ser configurable.

---

# 27. Bloqueo 24 — Testing Strategy

Eliminar porcentajes arbitrarios como condición absoluta si no han sido aprobados.

Puede mantener:

```text
alta cobertura de lógica crítica
100% de escenarios/invariantes críticas
```

pero no fijar 95/90/100% de coverage como garantía contractual sin decisión.

Agregar tests explícitos:

- Business cannot retrieve OTP.
- Admin cannot retrieve OTP.
- Driver cannot retrieve OTP.
- Tracking token expired/revoked.
- Pickup Business confirmation.
- Driver cannot self-confirm pickup.
- Same driver two deliveries.
- Two drivers same delivery.
- RETURNING blocks new offer.
- Suspended driver in custody can only follow resolution flow.
- Quote request can have multiple quotes.
- ledger sign convention and zero sum.
- payout method privacy.
- app killed/location stale behavior.

---

# 28. Bloqueo 25 — Observability

El ejemplo recursivo puede quedarse como pseudocódigo, pero agregar:

- URL path/query sanitization antes de logs;
- tracking bearer token nunca en access logs/analytics;
- header sanitization;
- nested payload allowlist;
- GPS precision policy;
- retention;
- access roles;
- production log level;
- security alert routing;
- no guardar `response_body` sensible en idempotency.

---

# 29. Bloqueo 26 — Deployment

Agregar:

- secrets por entorno;
- quién puede modificar Prod;
- Supabase Dev/Staging/Prod separados;
- EAS profiles;
- Vercel projects/envs;
- backups;
- restore drill;
- migration drift;
- migration promotion;
- rollback/forward-fix;
- monitoring;
- incident response;
- mobile rollback/forced upgrade.

No depender únicamente del diagrama CI.

---

# 30. Definition of Done FINAL de Fase 0

Solo aprobar cuando:

- [ ] State Machine completa y formal.
- [ ] No estados inexistentes en Edge Cases.
- [ ] No eventos huérfanos.
- [ ] Dispatch mutex usa driver_presence y orden único.
- [ ] Suspensión mid-delivery preserva custodia.
- [ ] Security no promete JWT revocation instantánea.
- [ ] Google key no depende de static IP inexistente.
- [ ] Customer Tracking MVP queda cerrado en backend + polling.
- [ ] OTP generation/visibility lifecycle definido.
- [ ] DB documenta tablas MVP individualmente.
- [ ] delivery_request 1:N quotes.
- [ ] business member scope N:M.
- [ ] payout methods sensibles modelados.
- [ ] ledger signs coherentes y zero-sum.
- [ ] cash model coherente.
- [ ] API Contracts cubre flujos críticos.
- [ ] App terminated correctamente modelado.
- [ ] Maps failure no factura silenciosamente Haversine.
- [ ] Umbrales operativos son configurables.
- [ ] Threat Model corregido.
- [ ] Canonical consistency pass limpio.
- [ ] Product Spec coincide con 4 apps/interfaces reales.
- [ ] Admin operations incluye permisos/auditoría.
- [ ] Testing cubre invariantes críticas.
- [ ] Observability define retención/acceso/redacción.
- [ ] Deployment cubre secretos/backups/promoción.
- [ ] README/Roadmap siguen en Fase 0 candidata.
- [ ] Agente entrega reporte final.
- [ ] Cerebro revisa ZIP y aprueba explícitamente.

---

# 31. Regla final

Esta es una ronda de cierre.

No añadir nuevos módulos de producto.

No empezar código.

Modificar únicamente:

```text
README.md
/docs/*.md
```

y este documento si se guarda como referencia.

Estado final obligatorio:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

---

# FIN — DIRECTIVA v1.4
