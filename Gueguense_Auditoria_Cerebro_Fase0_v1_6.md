# GÜEGÜENSE — AUDITORÍA DEL CEREBRO FASE 0 v1.6

**Estado:** FASE 0 — EN REVISIÓN / CORRECCIÓN DE INCUMPLIMIENTOS v1.5  
**Base revisada:** `gueguenseapp-main(4).zip`  
**Objetivo:** Cerrar únicamente los requisitos v1.5 que todavía NO están cumplidos.  
**Regla:** No introducir nuevas funciones, no rediseñar la arquitectura y no comenzar Fase 1.

---

# 1. Veredicto

La arquitectura central ya está suficientemente madura y permanece CONGELADA.

La versión revisada **NO pasa todavía el Definition of Done v1.5** por incumplimientos verificables en:

1. API Contracts.
2. Especificación individual de Base de Datos.
3. Consistencia API ↔ EVENT_TYPE.
4. Consistencia Tracking ↔ RLS/ingesta GPS.
5. Idempotencia de webhooks/system actors.
6. Estados financieros de payout.
7. Edge Cases con pseudoestados.
8. Policies configurables que todavía aparecen como valores absolutos en varios documentos.

No abrir nuevos debates de arquitectura después de corregir estos puntos.

---

# 2. BLOQUEO CRÍTICO A — `07_API_CONTRACTS.md` sigue incompleto

El documento actual tiene tablas bien formadas, pero solo documenta una pequeña fracción de las operaciones requeridas.

No basta con que un endpoint exista en User Flows o se mencione en otro documento.

## Deben documentarse como contratos al menos:

### Driver

```text
POST /api/v1/driver/onboarding
POST /api/v1/driver/documents/upload-authorization
POST /api/v1/driver/documents
POST /api/v1/driver/vehicles
POST /api/v1/driver/availability
GET  /api/v1/driver/state
GET  /api/v1/driver/offers/active
POST /api/v1/driver/offers/{id}/accept
POST /api/v1/driver/offers/{id}/reject
GET  /api/v1/driver/deliveries/active
POST /api/v1/driver/deliveries/{id}/start-pickup
POST /api/v1/driver/deliveries/{id}/arrived-pickup
POST /api/v1/driver/deliveries/{id}/start-dropoff
POST /api/v1/driver/deliveries/{id}/arrived-dropoff
POST /api/v1/driver/deliveries/{id}/verify-otp
POST /api/v1/driver/deliveries/{id}/incidents
POST /api/v1/driver/deliveries/{id}/return/start
POST /api/v1/driver/location
GET  /api/v1/driver/earnings
GET/POST/PATCH /api/v1/driver/payout-methods...
POST /api/v1/driver/payouts
```

### Business

Normalizar bajo `/api/v1/businesses/...` o una convención consistente.

```text
POST  /api/v1/businesses
PATCH /api/v1/businesses/{id}
POST  /api/v1/businesses/{id}/locations
PATCH /api/v1/businesses/{id}/locations/{location_id}
POST  /api/v1/businesses/{id}/members
PATCH /api/v1/businesses/{id}/members/{member_id}
DELETE/REVOKE miembro mediante acción explícita segura
POST  /api/v1/quotes
POST  /api/v1/deliveries
GET   /api/v1/deliveries/{id}
GET   /api/v1/businesses/{id}/deliveries
POST  /api/v1/deliveries/{id}/confirm-pickup-custody
POST  /api/v1/deliveries/{id}/cancel
POST  /api/v1/support/tickets
```

### Return / Handoff

```text
POST /api/v1/deliveries/{id}/return/authorize
POST /api/v1/deliveries/{id}/return/start
POST /api/v1/deliveries/{id}/return/confirm

POST /api/v1/admin/handoffs
POST /api/v1/admin/handoffs/{id}/authorize
POST /api/v1/handoffs/{id}/confirm-from
POST /api/v1/handoffs/{id}/confirm-to
POST /api/v1/admin/handoffs/{id}/complete
POST /api/v1/admin/handoffs/{id}/abort
```

### Tracking

```text
GET /api/v1/tracking/{token}
GET /api/v1/tracking/{token}/otp
```

MVP = backend + polling. No endpoint realtime obligatorio para cliente anónimo.

### Admin

```text
GET/POST verification queue/actions
POST approve/reject driver
POST suspend/reactivate driver
POST suspend/reactivate business
GET active operations
POST incident resolution
POST force cancel pre-custody
POST return/handoff authorization
POST pricing version activation
POST payout approve/reject
POST cash settlement
GET audit logs
```

### Finance

```text
payment create/confirm/status
payout request/status
ledger read views
cash settlement
```

## Cada mutación crítica debe contener

```text
Endpoint
Actor
Auth / Authorization
Allowed Current State
Request
Response
Resulting State
Idempotency
Domain Errors
Events
Notifications
Financial Effects
```

No dejar endpoints críticos como simple nombre.

---

# 3. BLOQUEO CRÍTICO B — `06_DATABASE_ARCHITECTURE.md` todavía NO individualiza realmente las 37 entidades

Las entidades 1–21 están razonablemente especificadas.

Las entidades 22–37 siguen mayormente en una sola línea y NO cumplen el formato prometido.

Para cada entidad MVP, especialmente 22–37, agregar:

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

Debe aplicarse individualmente a:

```text
pricing_versions
pricing_rules
pricing_zones
pricing_adjustments

ledger_accounts
ledger_transactions
ledger_postings
payments
driver_payout_methods
payouts
cash_settlements

device_tokens
notification_outbox
notification_deliveries
support_tickets
audit_logs
```

No escribir “todas documentadas” ni comprimir varias entidades en una sola frase.

---

# 4. BLOQUEO C — Inconsistencia de RLS con la ingesta GPS validada por backend

La arquitectura del sistema establece:

```text
Driver App
→ authenticated location ingestion endpoint
→ validación server-side
→ driver_presence
→ delivery_tracking_points
```

Pero `06_DATABASE_ARCHITECTURE.md` dice que `driver_presence` puede ser actualizado por el propio Driver.

Eso permite conceptualmente saltarse la capa de validación.

## Decisión

Para ubicación operacional:

```text
Driver App NO escribe directamente driver_presence/current_location.
```

El cliente envía ubicación al endpoint autenticado.

Backend/Stored Procedure validada escribe:

```text
driver_presence
delivery_tracking_points
```

RLS debe impedir escritura directa no validada de coordenadas desde REST/client.

El Driver puede leer su propio estado operacional según policy, pero la escritura de ubicación debe pasar por la capa autorizada.

Actualizar:

```text
05_SYSTEM_ARCHITECTURE.md
06_DATABASE_ARCHITECTURE.md
07_API_CONTRACTS.md
09_TRACKING_ARCHITECTURE.md
12_SECURITY_ARCHITECTURE.md
17_TESTING_STRATEGY.md
```

---

# 5. BLOQUEO D — Tracking Web no debe leer `delivery_tracking_points` directamente

`06_DATABASE_ARCHITECTURE.md` describe al Tracking como reader de `delivery_tracking_points`.

El MVP ya decidió:

```text
Tracking Web
→ backend
→ snapshot/polling
```

Por tanto el holder del tracking token NO obtiene acceso RLS directo a tablas GPS.

## Regla

```text
delivery_tracking_points:
Writer = validated location ingestion backend
Reader = backend/system/admin + usuarios autenticados autorizados según necesidad
Customer Tracking = únicamente por DTO filtrado desde backend
```

No exponer tabla GPS directamente al navegador anónimo/token holder.

---

# 6. BLOQUEO E — `idempotency_keys` no soporta correctamente webhooks/system actors

Actualmente:

```text
actor_id UUID NOT NULL REFERENCES auth.users(id)
```

pero Edge Cases dice que `DUPLICATE_WEBHOOK` utiliza `idempotency_keys`.

Un webhook no es necesariamente un `auth.users`.

## Decisión

Rediseñar conceptualmente para soportar actor no humano.

Ejemplo:

```text
actor_type:
USER
SYSTEM
WEBHOOK
BACKGROUND_JOB

actor_user_id UUID NULL
external_actor_key / provider_key NULL
scope
key
request_fingerprint
...
```

Constraint lógica:

- USER requiere `actor_user_id`.
- WEBHOOK puede utilizar provider/source + event id.
- reutilización del mismo key con fingerprint diferente debe fallar.

No es necesario escribir SQL final en Fase 0.

Actualizar DB, API, Edge Cases y Security/Testing.

---

# 7. BLOQUEO F — EVENT_TYPE no contiene eventos usados por API Contracts

`07_API_CONTRACTS.md` utiliza, entre otros:

```text
PAYOUT_METHOD_ADDED
PAYOUT_REQUESTED
PAYOUT_APPROVED
CASH_SETTLED
```

pero no están definidos en `21_CANONICAL_ENUMS.md`.

## Regla

Todo evento usado en API/State Machine/Edge Cases debe:

A. estar en `EVENT_TYPE`, o  
B. declararse explícitamente como evento de otro dominio con diccionario propio.

Para simplificar Fase 0, agregar los eventos financieros/operativos realmente utilizados al registro canónico o crear una subsección canónica `FINANCIAL_EVENT_TYPE`.

No dejar strings huérfanos.

Ejecutar búsqueda cruzada global.

---

# 8. BLOQUEO G — Payout Approval mezcla estados distintos

En API Contracts aparece:

```text
POST /admin/payouts/{id}/approve
→ Resulting State = APPROVED / PAID
```

Una acción de aprobación no debe producir ambiguamente dos estados.

## Decisión

Separar:

```text
REQUESTED
→ UNDER_REVIEW
→ APPROVED
→ PROCESSING
→ PAID
```

`approve` termina en `APPROVED`.

El paso a `PROCESSING`/`PAID` ocurre mediante:

- worker/provider integration;
- callback/webhook verificado;
- o acción administrativa separada autorizada.

Documentar errores e idempotencia.

---

# 9. BLOQUEO H — `driver_documents` tiene un CHECK con nombre de columna incorrecto

Documento actual:

```text
Columns: verification_status
CHECK status IN (...)
```

Debe ser:

```text
CHECK verification_status IN (...)
```

Aplicar consistency pass similar a todos los statuses de DB.

---

# 10. BLOQUEO I — Edge Cases todavía contiene pseudoestados

No usar expresiones como:

```text
PICKED_UP / DROPOFF
RETURN / HANDOFF
```

como si fueran `DELIVERY_STATUS`.

Usar estados canónicos completos.

Ejemplo para suspensión post-custodia:

```text
PICKED_UP
TO_DROPOFF
ARRIVED_DROPOFF
→ incidente
→ RETURN_REQUIRED
```

o Controlled Handoff como operación desacoplada.

`CONTROLLED_HANDOFF` NO es un `DELIVERY_STATUS`.

Durante handoff, el Delivery conserva el estado logístico apropiado y la custodia se representa mediante `custody_handoffs`.

Actualizar Edge Cases y cualquier otro documento que trate HANDOFF como estado del Delivery.

---

# 11. BLOQUEO J — Tracking Architecture usa incorrectamente `OTP_DISALLOWED_STATES`

El texto dice:

```text
el endpoint `OTP_DISALLOWED_STATES` no retorna OTP
```

`OTP_DISALLOWED_STATES` no es un endpoint.

Corregir a:

```text
GET /api/v1/tracking/{token}/otp
retorna OTP solo si delivery.status ∈ OTP_ALLOWED_STATES
```

Definir conceptualmente:

```text
OTP_ALLOWED_STATES =
PICKED_UP
TO_DROPOFF
ARRIVED_DROPOFF
```

Todos los demás estados quedan denegados.

No hace falta convertir `OTP_ALLOWED_STATES` a enum DB.

---

# 12. BLOQUEO K — Policies configurables todavía aparecen como reglas absolutas

La intención ya está documentada en Pricing, pero varios archivos siguen diciendo de forma absoluta:

```text
Quote EXPIRED tras 5 minutos
Offer EXPIRED tras 15 segundos
15s exp.
+2km
10 minutos
3 minutos
Signed URL 15m
3 intentos / 2 minutos
C$5,000
```

## Regla

Donde aparezcan como comportamiento operativo, escribir:

```text
initial default / configurable policy
```

No es necesario eliminar los ejemplos.

Corregir especialmente:

```text
04_DELIVERY_STATE_MACHINE.md
06_DATABASE_ARCHITECTURE.md
08_DISPATCH_ENGINE.md
12_SECURITY_ARCHITECTURE.md
14_ADMIN_OPERATIONS.md
15_ERROR_AND_EDGE_CASES.md
17_TESTING_STRATEGY.md
21_CANONICAL_ENUMS.md
```

`21_CANONICAL_ENUMS.md` no debe definir semánticamente `EXPIRED` como “exactamente 5 min/15 s”; debe decir “al superar expires_at/policy configurada”.

---

# 13. BLOQUEO L — Delivery Secrets: documentar el lifecycle completo

La nulabilidad OTP ya fue corregida.

Agregar explícitamente:

```text
ARRIVED_PICKUP:
pickup secret activo
OTP todavía NULL

CUSTODY_TRANSFERRED / PICKED_UP:
pickup secret se marca used/invalida
OTP digest + ciphertext + expires_at se generan

DELIVERED:
otp_verified_at registrado
OTP raw deja de ser retornable

RETURN_REQUIRED / RETURNING / RETURNED:
OTP deja de ser retornable
```

No eliminar automáticamente evidencia necesaria para auditoría antes de la política de retención.

---

# 14. BLOQUEO M — API de Upload de documentos debe cerrar el flujo seguro

Al agregar los endpoints faltantes, documentar:

```text
POST /driver/documents/upload-authorization
→ backend decide storage path
→ signed upload / policy temporal
→ Driver sube
→ POST /driver/documents registra metadata
```

El cliente no selecciona un `file_path` arbitrario.

Validar:

- ownership;
- mime;
- size;
- document type;
- private bucket;
- expiration.

---

# 15. BLOQUEO N — Base de datos / API de notifications

La entidad `notification_deliveries` ya existe, lo cual es correcto.

Alinear `13_NOTIFICATIONS.md` con columnas/estados reales:

```text
notification_outbox
notification_deliveries
device_tokens
```

Definir:

- dedup key/event id;
- provider message id;
- attempts;
- last error;
- receipt checked;
- token invalidation;
- retention.

No usar un status en Notifications que no esté en Canonical Statuses.

---

# 16. BLOQUEO O — Testing debe probar los bypasses de GPS e idempotencia no humana

Agregar pruebas explícitas:

```text
Driver cannot directly update driver_presence.current_location bypassing ingestion.
Tracking token cannot query delivery_tracking_points directly.
Webhook idempotency works without auth.users actor.
Same idempotency key + different fingerprint returns domain error.
Payout approve does not jump directly to PAID.
All API event names exist in canonical registry.
```

Mantener las pruebas existentes.

---

# 17. CONSISTENCY PASS FINAL

Antes de terminar ejecutar búsqueda global sobre `/docs`.

Validar:

## API ↔ DB

Cada tabla usada por API está documentada.

## API ↔ EVENT_TYPE

Cada evento usado está definido.

## State Machine ↔ Edge Cases

No pseudoestados ni wildcards.

## Tracking ↔ DB/RLS

Customer no accede directamente a tablas GPS.

## GPS ingestion ↔ RLS

Driver no puede saltarse validación backend.

## Finance

Payout states no se saltan etapas.

## Config

Timeouts y thresholds son policies configurables.

Buscar específicamente:

```text
PAYOUT_METHOD_ADDED
PAYOUT_REQUESTED
PAYOUT_APPROVED
CASH_SETTLED
CHECK status
PICKED_UP/DROPOFF
RETURN/HANDOFF
OTP_DISALLOWED_STATES
15s
5 min
3 min
C$5,000
Signed URL
```

Los matches pueden permanecer solamente si están marcados claramente como defaults configurables o si el contexto es correcto.

---

# 18. Definition of Done v1.6

FASE 0 queda lista para auditoría de aprobación cuando:

- [ ] API Contracts cubre todas las familias críticas.
- [ ] Cada mutación crítica tiene contrato completo.
- [ ] Entidades 22–37 están individualmente especificadas.
- [ ] Driver no escribe GPS directamente en `driver_presence`.
- [ ] Tracking holder no lee tablas GPS directamente.
- [ ] Idempotency soporta USER/SYSTEM/WEBHOOK.
- [ ] Eventos API están definidos canónicamente.
- [ ] Payout approval termina solo en APPROVED.
- [ ] `driver_documents` CHECK usa `verification_status`.
- [ ] Edge Cases no usa pseudoestados.
- [ ] Controlled Handoff no se modela como DELIVERY_STATUS.
- [ ] OTP allowed/disallowed wording es correcto.
- [ ] Thresholds están identificados como configurables.
- [ ] Secret lifecycle pickup/OTP está completo.
- [ ] Document upload flow es seguro.
- [ ] Notification docs y DB están alineados.
- [ ] Tests cubren bypass GPS/idempotency/webhook/payout.
- [ ] Consistency pass final queda limpio.
- [ ] Roadmap sigue `FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN`.
- [ ] No se ha creado código ejecutable.
- [ ] Cerebro realiza revisión final.

---

# 19. Regla final

Esta corrección NO cambia la arquitectura del producto.

Solo cierra incumplimientos verificables de v1.5.

Modificar únicamente:

```text
README.md
/docs/*.md
```

Estado final obligatorio:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después detenerse.
