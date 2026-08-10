# GÜEGÜENSE — AUDITORÍA DEL CEREBRO Y DIRECTIVA FINAL DE CIERRE DE FASE 0

**Versión:** 1.3  
**Estado del proyecto:** FASE 0 — EN REVISIÓN / NO APROBADA  
**Repositorio revisado:** `gueguenseapp-main(1)(1).zip`  
**Rol de este documento:** Directiva arquitectónica del Cerebro para corregir la tercera versión documental antes de autorizar Fase 1.

---

# 1. Veredicto

La documentación mejoró claramente respecto a la versión anterior:

- Quote y Delivery ya están separados.
- Incidents ya están desacoplados.
- Return existe.
- PICKUP_CODE y DELIVERY_OTP están diferenciados.
- DELIVERY_OTP está estandarizado a 6 dígitos.
- `auth.users` se utiliza como identidad.
- Dispatch incluye ambas invariantes.
- El partial unique index incluye `RETURN_REQUIRED` y `RETURNING`.
- `SECURITY DEFINER` usa `SET search_path = ''`.
- Tracking token ya contempla hash.
- Pricing distingue quoted/final.
- Ledger utiliza transactions + postings.
- Push se considera best-effort.
- README usa enlaces relativos.
- El Roadmap mantiene Fase 0 en revisión.
- Se añadió `21_CANONICAL_ENUMS.md`.

Sin embargo, **FASE 0 todavía NO puede aprobarse**.

El problema principal ya no es la idea general. El problema actual es que varios documentos críticos quedaron demasiado resumidos y todavía existen contradicciones concretas entre API, DB, Security, State Machine y enums.

---

# 2. Jerarquía de autoridad desde esta versión

Cuando exista contradicción:

1. Decisión explícita nueva del usuario.
2. `Gueguense_Auditoria_Cerebro_Fase0_v1_3.md`.
3. `Gueguense_Directiva_Cerebro_Fase0_v1_2.md`.
4. `Gueguense_Documento_Maestro_Proyecto.md`.
5. `/docs/*.md`.
6. Preferencias del agente.

Este archivo es una **directiva de corrección**, no una invitación a rediseñar el producto.

---

# 3. Hallazgo crítico A — DELIVERY_OTP es internamente inconsistente

Actualmente existen tres afirmaciones incompatibles:

1. API Contracts indica que la API "NUNCA retorna DELIVERY_OTP".
2. El endpoint de Tracking sí retorna `delivery_otp`.
3. Base de Datos solo almacena `otp_digest`.

Si únicamente existe un digest irreversible, el backend no puede recuperar el OTP original para volver a mostrarlo en Tracking Web.

## Decisión canónica v1.3

El destinatario sí debe poder visualizar su OTP desde una **sesión de tracking válida**, pero:

- Driver nunca puede recuperarlo.
- Business nunca puede recuperarlo.
- Admin/Operator nunca puede recuperarlo.
- El valor no debe almacenarse en plaintext.

Diseñar `private.delivery_secrets` con dos representaciones separadas:

```text
delivery_id
otp_digest
otp_ciphertext
otp_expires_at
otp_attempt_count
otp_locked_until
otp_verified_at
otp_key_version
```

### `otp_digest`

Utilizado exclusivamente para verificar los intentos enviados por Driver.

### `otp_ciphertext`

OTP cifrado a nivel de aplicación/servidor con una clave que NO viva en la base de datos.

Solo un backend autorizado puede descifrarlo después de validar una credencial de cliente/tracking válida.

La elección concreta del proveedor de key management puede cerrarse en Fase 1, pero la arquitectura debe exigir:

- clave server-only;
- rotación/versionado;
- nunca plaintext DB;
- nunca logging;
- nunca retornar a Driver/Business/Admin;
- acceso únicamente por una operación customer-scoped;
- expiración y revocación.

## API correcta

La regla global debe decir:

```text
El DELIVERY_OTP nunca se retorna a Driver, Business ni Admin.
Solo puede retornar a un holder de una credencial de cliente/tracking válida,
mediante un endpoint customer-scoped y con controles de seguridad.
```

No decir simplemente "la API nunca retorna OTP", porque contradice Tracking Web.

---

# 4. Hallazgo crítico B — PICKUP_CODE está almacenado en plaintext público

`public.deliveries.pickup_code` no es aceptable.

Si Business o cualquier policy futura puede leer la fila, el propósito de custodia se debilita.

## Decisión canónica v1.3

Eliminar `pickup_code` plaintext de `public.deliveries`.

Usar en `private.delivery_secrets`:

```text
pickup_code_digest
pickup_code_expires_at
pickup_code_used_at
```

Flujo:

```text
ARRIVED_PICKUP
→ backend genera PICKUP_CODE
→ muestra valor únicamente al Driver asignado
→ Business Employee introduce/escanea el código
→ backend compara digest
→ registra CUSTODY_TRANSFERRED
→ invalida código
→ PICKED_UP
```

El Driver no debe poder llamar al endpoint Business de confirmación de custodia.

Business no debe poder consultar el valor correcto desde DB/API.

---

# 5. Hallazgo crítico C — State Machine todavía no está especificada a nivel implementable

`04_DELIVERY_STATE_MACHINE.md` tiene el diagrama general, pero le falta la tabla formal de transiciones solicitada.

Debe existir una matriz para cada transición con:

```text
FROM
TO
ACTOR
TRIGGER
PRECONDITIONS
SERVER VALIDATIONS
EVENTS
SIDE EFFECTS
NOTIFICATIONS
IDEMPOTENCY
ERRORS
```

## Transiciones mínimas

```text
QUOTE:
DRAFT → QUOTED
QUOTED → CONSUMED
QUOTED → EXPIRED
QUOTED → CANCELED

DELIVERY:
CREATE → SEARCHING_DRIVER
SEARCHING_DRIVER → DRIVER_ASSIGNED
DRIVER_ASSIGNED → TO_PICKUP
TO_PICKUP → ARRIVED_PICKUP
ARRIVED_PICKUP → PICKED_UP
PICKED_UP → TO_DROPOFF
TO_DROPOFF → ARRIVED_DROPOFF
ARRIVED_DROPOFF → DELIVERED

DRIVER_ASSIGNED → SEARCHING_DRIVER
TO_PICKUP → SEARCHING_DRIVER
ARRIVED_PICKUP → SEARCHING_DRIVER
  únicamente si custodia NO fue transferida y reglas lo permiten

PICKED_UP → RETURN_REQUIRED
TO_DROPOFF → RETURN_REQUIRED
ARRIVED_DROPOFF → RETURN_REQUIRED
RETURN_REQUIRED → RETURNING
RETURNING → RETURNED

SEARCHING_DRIVER → CANCELED
DRIVER_ASSIGNED → CANCELED cuando permitido
TO_PICKUP → CANCELED cuando permitido
ARRIVED_PICKUP → CANCELED únicamente si no existe custodia

SEARCHING_DRIVER → FAILED en fallos terminales definidos
```

`FAILED` no debe utilizarse si todavía existe custodia física pendiente.

---

# 6. Hallazgo D — El diagrama de User Flows omite PICKED_UP

El flujo visual de `03_USER_FLOWS.md` salta:

```text
ARRIVED_PICKUP → TO_DROPOFF
```

aunque el texto dice que debe pasar por `PICKED_UP`.

Debe mostrar exactamente:

```text
ARRIVED_PICKUP
→ PICKED_UP
→ TO_DROPOFF
```

No declarar "alineación 100%" si el diagrama omite estados.

---

# 7. Hallazgo E — User Flows sigue demasiado resumido

Debe ampliar flujos completos.

## Business

- onboarding;
- crear negocio;
- verification/account state;
- crear sucursal;
- invitar miembro;
- scope de miembro;
- quote;
- consumir quote;
- buscar driver;
- driver asignado;
- tracking;
- pickup custody;
- cancelación;
- delivery detail;
- historial;
- support;
- cash/payment when applicable.

## Driver

- signup;
- profile;
- document upload;
- verification;
- vehicle;
- availability;
- active offer sync;
- accept;
- reject;
- navigate;
- arrived pickup;
- custody;
- dropoff;
- OTP;
- incident;
- return;
- controlled handoff;
- earnings;
- payout;
- support.

## Admin

- verification;
- live operations;
- suspend/reactivate;
- incident;
- return;
- handoff;
- pricing;
- payout;
- cash settlement;
- audit.

## Customer

- open secure tracking;
- display OTP;
- tracking;
- completed;
- return/failure UX.

---

# 8. Hallazgo crítico F — DATABASE_ARCHITECTURE todavía incumple su propio requisito

Las tablas 21-28 están agrupadas en una sola línea:

```text
public.payouts, public.cash_settlements, pricing_zones, pricing_rules,
device_tokens, notification_outbox, support_tickets, audit_logs
```

y después dice "Todas documentadas", pero **no están documentadas**.

Esto es un bloqueo de Fase 0.

## Cada tabla debe documentar

- purpose;
- MVP / POST-MVP;
- PK;
- columns;
- FK;
- ON DELETE;
- UNIQUE;
- CHECK;
- enum;
- indexes;
- RLS;
- writer;
- reader;
- sensitivity;
- lifecycle;
- retention;
- idempotency relation when applicable.

## Tablas que faltan o necesitan detalle real

```text
delivery_tracking_points
delivery_proofs
custody_handoffs
pricing_versions
pricing_adjustments
pricing_zones
pricing_rules

ledger_accounts
ledger_transactions
ledger_postings
payments
payouts
cash_settlements

device_tokens
notification_outbox
notifications / notification_receipts

support_tickets
audit_logs
idempotency_keys

private.delivery_secrets
private.tracking_tokens
```

`idempotency_keys` debe incorporarse porque la arquitectura exige idempotencia persistente.

---

# 9. Hallazgo G — delivery_quotes está incompleta

Debe incluir como mínimo:

```text
currency
time_amount
zone_amount
demand_amount
discount_amount
quoted_total
driver_earning_estimate
platform_revenue_estimate
expires_at
consumed_at
pricing_version_id
```

No basta con base + distance.

La DB debe poder explicar exactamente cómo se construyó una quote histórica.

---

# 10. Hallazgo H — deliveries utiliza columnas monetarias demasiado simplificadas

Actualmente:

```text
quoted_price
final_price
driver_earning
platform_fee
```

pueden conservarse como snapshots de resumen, pero no deben convertirse en la contabilidad oficial.

Debe documentarse:

- `quoted_price` = snapshot comercial.
- `final_price` = precio consolidado después de adjustments.
- `driver_earning` = valor consolidado derivado.
- `platform_revenue` = valor consolidado derivado.
- ledger = fuente financiera auditable.

Agregar `currency`.

---

# 11. Hallazgo I — API Contracts está muy incompleta

Solo contiene una fracción de los contratos.

Debe documentar al menos las familias siguientes.

## Driver

```text
POST /driver/onboarding
POST /driver/documents/upload-authorization
POST /driver/documents
POST /driver/vehicles
POST /driver/availability
GET  /driver/state
GET  /driver/offers/active
POST /driver/offers/{id}/accept
POST /driver/offers/{id}/reject
GET  /driver/deliveries/active
POST /driver/deliveries/{id}/arrived-pickup
POST /driver/deliveries/{id}/arrived-dropoff
POST /driver/deliveries/{id}/verify-otp
POST /driver/deliveries/{id}/incidents
POST /driver/deliveries/{id}/return/start
POST /driver/location
GET  /driver/earnings
POST /driver/payouts
```

## Business

```text
POST /businesses
PATCH /businesses/{id}
POST /businesses/{id}/locations
POST /businesses/{id}/members
POST /quotes
POST /deliveries
GET /deliveries/{id}
POST /business/deliveries/{id}/confirm-pickup-custody
POST /deliveries/{id}/cancel
GET /businesses/{id}/deliveries
POST /support/tickets
```

## Tracking / Customer

```text
GET /tracking/{token}
POST /tracking/{token}/realtime-session
GET /tracking/{token}/otp
```

`GET /tracking/{token}/otp` es el único contrato que puede obtener el OTP plano y solo después de validar la credencial tracking/customer.

## Admin

- verification queue;
- approve/reject driver;
- suspend/reactivate driver;
- suspend/reactivate business;
- live delivery detail;
- incident resolution;
- return authorization;
- controlled handoff;
- pricing;
- payouts;
- cash settlements;
- audit.

## Requisitos por endpoint

Para cada mutación crítica:

- Auth;
- authorization;
- RLS/server policy;
- request;
- response;
- required current state;
- resulting state;
- Idempotency-Key;
- domain errors;
- events;
- notifications;
- financial side effects.

---

# 12. Hallazgo J — Contradicción explícita dentro de API Contracts

En el mismo archivo:

```text
"La API NUNCA retorna DELIVERY_OTP en JSON"
```

y después:

```json
"delivery_otp": "482910"
```

Corregir conforme a la decisión canónica de la sección 3.

---

# 13. Hallazgo K — Dispatch tiene un lock order documentado diferente al SQL de ejemplo

El documento declara:

```text
1. driver
2. delivery
3. offer
```

pero el SQL ejecuta:

```text
1. driver
2. offer
3. delivery
```

Esto debe unificarse.

## Decisión canónica v1.3

Usar un orden único:

```text
1. DRIVER / DRIVER_PRESENCE
2. DELIVERY
3. OFFER
```

Para llegar al delivery desde `offer_id` sin bloquear primero la offer, puede hacerse una lectura no bloqueante inicial del `delivery_id`, seguida de locks y una revalidación posterior de la offer.

Alternativamente puede elegirse otro orden único si está justificado, pero TODAS las operaciones concurrentes deben compartirlo.

No puede existir contradicción entre texto y pseudocódigo.

---

# 14. Hallazgo L — Driver Presence no se valida atómicamente

`accept_delivery_offer` valida:

- verification_status;
- account_status;

pero no valida de forma suficiente:

```text
driver_presence.operational_state
location_updated_at
```

Debe bloquear y validar `driver_presence`.

Aceptación permitida únicamente desde un estado operacional compatible:

```text
AVAILABLE
OFFERED
```

No aceptar si:

```text
OFFLINE
BUSY
PAUSED
```

La frescura GPS puede admitir tolerancia configurable, pero debe verificarse conforme a política Dispatch.

---

# 15. Hallazgo M — SQL completo durante Fase 0

La Fase 0 debía diseñar, no crear implementación real.

`08_DISPATCH_ENGINE.md` contiene una función PL/pgSQL completa.

Esto no es un bloqueo si se trata únicamente como ejemplo documental, pero debe etiquetarse explícitamente:

```text
PSEUDOCÓDIGO / BORRADOR NO EJECUTABLE
```

y no asumirse como migration final.

La implementación definitiva se escribirá y probará en Fase 4.

---

# 16. Hallazgo N — Eventos incompletos al aceptar una oferta

Una aceptación exitosa debe poder auditar:

```text
OFFER_ACCEPTED
DRIVER_ASSIGNED
```

No registrar únicamente `DRIVER_ASSIGNED`.

También las ofertas perdedoras deben quedar en `CANCELED`.

No borrar historial.

---

# 17. Hallazgo O — CANONICAL_ENUMS usa abreviaciones que parecen valores reales

En `21_CANONICAL_ENUMS.md` aparecen dentro de backticks:

```text
SEARCHING_DR.
RETURN_REQ.
UNDER_INVEST.
RESOLVED_CONT.
```

Eso es peligroso.

Nunca abreviar un enum dentro de backticks.

Debe mostrar los valores reales completos:

```text
SEARCHING_DRIVER
RETURN_REQUIRED
UNDER_INVESTIGATION
RESOLVED_CONTINUE
RESOLVED_RETURN
RESOLVED_HANDOFF
```

---

# 18. Hallazgo P — Mismatch de PRICING_ADJUSTMENT_TYPE

`10_PRICING_ENGINE.md` usa:

```text
MANUAL_ADJUST
```

mientras Canonical Enums usa:

```text
MANUAL_ADJUSTMENT
```

Valor canónico:

```text
MANUAL_ADJUSTMENT
```

Debe utilizarse exactamente en todos los documentos.

---

# 19. Hallazgo Q — Testing usa `otp_hash` en lugar de `otp_digest`

Unificar nomenclatura:

```text
otp_digest
```

No usar `otp_hash` si el esquema canónico dice `otp_digest`.

---

# 20. Hallazgo R — Tracking Architecture está incompleta

Debe documentar explícitamente:

```text
tracking token creation
token entropy
token_hash
expires_at
revoked_at
rotation if needed
terminal state behavior
realtime authorization
fallback
```

## Transporte customer tracking

La arquitectura debe seleccionar una estrategia primaria para MVP.

### Decisión recomendada

```text
Tracking Web
→ backend valida token
→ backend crea sesión realtime temporal scoped a delivery
→ cliente se conecta al canal privado autorizado
→ snapshot siempre se recupera del backend
→ realtime solo transporta cambios
```

Debe existir fallback:

```text
short polling / refetch
```

si la sesión realtime no está disponible.

El token URL nunca autoriza directamente `realtime.messages`.

---

# 21. Hallazgo S — Driver tracking validation usa números hardcodeados prematuramente

`accuracy < 50m` y `speed <120km/h` pueden existir como valores iniciales, pero deben describirse como **configurables**, no invariantes permanentes.

Además, una velocidad "imposible" debe producir señal/risk flag, no necesariamente rechazo automático de todo punto sin contexto.

Diseñar:

```text
location_quality
anomaly_flag
server_received_at
device_timestamp
```

---

# 22. Hallazgo T — Threat Model está incompleto

Actualmente contiene muy pocas amenazas.

Debe incorporar al menos:

```text
ACCOUNT_TAKEOVER
FAKE_DRIVER
FORGED_GPS
IDOR
TRACKING_TOKEN_LEAK
OTP_BRUTE_FORCE
PICKUP_CODE_ABUSE
DOCUMENT_EXPOSURE
PRICE_MANIPULATION
FAKE_PICKUP
FAKE_DELIVERY_COMPLETION
DISPATCH_RACE
PAYOUT_FRAUD
CASH_FRAUD
MALICIOUS_BUSINESS_MEMBER
ADMIN_COMPROMISE
REPLAY_ATTACK
LEAKED_API_KEY
ABUSIVE_ENUMERATION
WEBHOOK_REPLAY
```

Para cada una:

```text
Asset
Threat
Attack path
Preventive controls
Detective controls
Response
Residual risk
```

---

# 23. Hallazgo U — Admin Operations está demasiado resumido

Debe desarrollar módulos de:

- Dashboard KPIs.
- Live Operations Map.
- Deliveries.
- Drivers.
- Businesses.
- Verification Queue.
- Incident Queue.
- Returns.
- Controlled Handoffs.
- Support.
- Pricing/Zones.
- Payments.
- Ledger Views.
- Payouts.
- Cash Settlements.
- Suspensions.
- Audit Logs.
- Admin role permissions.

Para acciones destructivas/sensibles:

- reason required;
- audit;
- step-up/MFA where appropriate;
- four-eyes approval para payouts o ajustes financieros de alto riesgo si se decide.

---

# 24. Hallazgo V — Edge Cases está demasiado resumido

Actualmente solo documenta pocos casos.

Debe cubrir al menos:

```text
NO_DRIVERS_AVAILABLE
ALL_OFFERS_EXPIRED
DRIVER_REJECTS
DRIVER_CANCELS_PRE_PICKUP
BUSINESS_CANCELS
CUSTOMER_CANCELS_IF_ALLOWED
GPS_LOST
LOCATION_STALE
NETWORK_LOST
APP_TERMINATED
PUSH_LOST
REALTIME_LOST
MAPS_PROVIDER_FAILURE
BUSINESS_CLOSED
PACKAGE_NOT_READY
WAITING_TIMEOUT
CUSTOMER_UNREACHABLE
WRONG_ADDRESS
RECIPIENT_REFUSED
PACKAGE_DAMAGED
OTP_WRONG
OTP_LOCKED
CASH_MISMATCH
PAYMENT_FAILED
DUPLICATE_REQUEST
DUPLICATE_WEBHOOK
DRIVER_SUSPENDED_MID_DELIVERY
BUSINESS_SUSPENDED_MID_DELIVERY
RETURN_REQUIRED
CONTROLLED_HANDOFF
DATABASE_TEMPORARY_FAILURE
```

Para cada caso:

- Detection.
- Backend behavior.
- User UX.
- State transition.
- Event.
- Financial impact.
- Recovery.
- Operator escalation.

No inventar penalizaciones automáticas a drivers por no responder push.

---

# 25. Hallazgo W — Testing Strategy está demasiado resumida

Debe ampliar tests para:

## State Machine

- valid transitions;
- forbidden transitions;
- cancellation;
- return;
- terminal states.

## Dispatch

- two drivers same delivery;
- same driver two deliveries;
- offer expiry;
- driver unavailable;
- suspended driver;
- stale GPS.

## RLS

- cross-business;
- business_member role;
- location scope;
- driver own records;
- private schemas inaccessible;
- admin permissions.

## OTP / Tracking

- brute force;
- lockout;
- customer-only raw OTP;
- Driver/Business/Admin cannot retrieve;
- expired token;
- revoked token.

## Custody

- pickup code;
- Business confirmation;
- Driver cannot self-confirm;
- return;
- handoff.

## Ledger

- zero-sum;
- payout;
- cash collection;
- return fee;
- refund;
- duplicate idempotency key.

## Resilience

- duplicate webhook;
- retry;
- push missing;
- realtime reconnect.

---

# 26. Hallazgo X — Design System está demasiado resumido

Debe documentar:

```text
colors
semantic colors
typography scale
font weights
spacing
radii
elevation
touch target
button variants
input variants
cards
bottom sheets
dialogs
status badges
map overlays
navigation
loading
skeleton
empty
error
offline
disabled
focus
accessibility
```

No hace falta crear pantallas.

Debe definir cómo cambia la interfaz Driver durante delivery activo.

---

# 27. Hallazgo Y — Observability está incompleta

El sanitizador actual es ilustrativo y no suficiente.

Debe especificar:

- recursive redaction;
- allowlist preferred for critical payloads;
- URL sanitization;
- query string sanitization;
- headers;
- nested objects;
- GPS precision reduction/redaction;
- log levels;
- production console policy;
- retention;
- access controls;
- audit of log access where appropriate;
- alerting;
- correlation;
- metrics.

No incluir coordenadas exactas en logs generales.

---

# 28. Hallazgo Z — Deployment está incompleto

Debe añadir:

- environment ownership;
- Supabase Dev/Staging/Prod separation;
- secrets per environment;
- EAS profiles;
- Vercel projects/environment separation;
- migration promotion;
- migration drift checks;
- required approvals;
- backup policy;
- restore drills;
- forward-fix/rollback;
- monitoring;
- incident response;
- mobile rollback strategy;
- minimum supported app version / forced upgrade strategy when API changes critically.

---

# 29. Ledger todavía necesita completar ejemplos

Actualmente tiene solo entrega normal y cash collection.

Debe documentar asientos zero-sum para:

- normal delivery;
- driver earning;
- platform revenue;
- waiting fee;
- return fee;
- cash collected by driver;
- cash settlement;
- payout;
- refund;
- manual adjustment.

Cada ejemplo debe indicar currency.

No tratar `cached_balance` como fuente financiera oficial.

---

# 30. Notification Architecture necesita completar retries

Mantener:

```text
DeviceNotRegistered → desactivar ese token
InvalidCredentials → alerta infraestructura, no invalidar tokens
MessageRateExceeded → retry
```

Agregar explícitamente:

```text
HTTP 429 → exponential backoff + jitter
HTTP 5xx → retry
permanent 4xx payload error → no retry infinito
deduplication by notification/event id
receipt reconciliation
token last_seen_at
```

---

# 31. Product Spec necesita criterios de éxito reales

Agregar secciones:

```text
MVP IN SCOPE
MVP OUT OF SCOPE
KPIs
SUCCESS CRITERIA
INITIAL OPERATING ASSUMPTIONS
POST-MVP
```

No inventar objetivos comerciales numéricos sin aprobación.

KPIs sí pueden definirse como métricas, por ejemplo:

- assignment time;
- acceptance rate;
- successful delivery rate;
- cancellation rate;
- average pickup wait;
- stale tracking rate;
- incident rate.

Los targets numéricos pueden quedar `TBD`.

---

# 32. BUSINESS_VERIFICATION_STATUS está inconsistente

Directiva v1.2 permitía:

```text
NOT_REQUIRED
PENDING
UNDER_REVIEW
VERIFIED
REJECTED
```

pero `06_DATABASE_ARCHITECTURE.md` omite `NOT_REQUIRED`.

Definir el mismo enum en todos los archivos.

Si `NOT_REQUIRED` no se utilizará en MVP, eliminarlo de TODOS; no mantener dos definiciones.

Recomendación: conservar `NOT_REQUIRED` para tipos de negocio donde la verificación adicional no se requiera, pero el agente debe documentar cuándo se usa.

---

# 33. business_manager falta en matriz de permisos

`02_USER_ROLES.md` define `business_manager`, pero la matriz de permisos no tiene columna de `business_manager`.

Agregarla.

También debe establecer cómo opera `location_scope`.

---

# 34. Controlled Handoff necesita entidad real

La documentación menciona handoff supervisado, pero DB Architecture no define claramente su estructura.

Agregar:

```text
custody_handoffs
```

Campos conceptuales:

```text
id
delivery_id
from_driver_id
to_driver_id
authorized_by
reason
status
handoff_location
initiated_at
confirmed_by_from_driver_at
confirmed_by_to_driver_at
completed_at
proof_id
```

Un handoff no cambia silenciosamente `driver_id`.

Debe existir una operación atómica de cierre/apertura de custodia y eventos.

Puede marcarse como MVP fallback administrativo o como Phase 5/8, pero debe estar modelado.

---

# 35. delivery_proofs necesita tipología

Documentar tipos:

```text
PICKUP_CUSTODY
DELIVERY_PHOTO
DELIVERY_SIGNATURE
RETURN_PROOF
HANDOFF_PROOF
```

No todos son obligatorios en el MVP.

Definir:

- storage private;
- metadata;
- actor;
- timestamp;
- retention;
- access policy.

---

# 36. Idempotency necesita entidad/documento real

Agregar arquitectura para:

```text
idempotency_keys
```

Campos conceptuales:

```text
scope
key
actor_id
request_fingerprint
response_status
response_body_ref/hash
created_at
expires_at
```

Constraint:

```text
UNIQUE(scope, actor_id, key)
```

No devolver una respuesta anterior si el mismo key se reutiliza con payload diferente.

Ese caso debe producir:

```text
IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD
```

---

# 37. Delivery Events y nombres canónicos

`21_CANONICAL_ENUMS.md` debe contener valores completos.

Revisar todos los eventos y agregar cuando corresponda:

```text
QUOTE_CONSUMED
OFFER_EXPIRED
OFFER_REJECTED
DRIVER_UNASSIGNED
CUSTODY_TRANSFERRED
RETURN_REQUIRED
RETURN_STARTED
RETURN_COMPLETED
HANDOFF_STARTED
HANDOFF_COMPLETED
DELIVERY_CANCELED
DELIVERY_FAILED
```

No necesariamente cada evento debe ser un enum PostgreSQL; pero el diccionario canónico debe estar definido.

---

# 38. Definition of Done v1.3

FASE 0 será candidata a aprobación cuando:

- [ ] No exista contradicción OTP entre Security/API/DB/Tracking.
- [ ] OTP raw sea customer-only y recuperable de forma segura sin plaintext DB.
- [ ] PICKUP_CODE no esté en plaintext en public.deliveries.
- [ ] State Machine incluya matriz formal de transiciones.
- [ ] User Flow muestre PICKED_UP.
- [ ] User Flows cubran Business/Driver/Admin/Customer.
- [ ] DB documente cada entidad obligatoria individualmente.
- [ ] DB incluya delivery_tracking_points y delivery_proofs.
- [ ] DB incluya custody_handoffs.
- [ ] DB incluya idempotency_keys.
- [ ] API Contracts cubra todos los flujos críticos.
- [ ] API no tenga reglas contradictorias sobre OTP.
- [ ] Dispatch tenga un único lock order real.
- [ ] Dispatch bloquee/valide driver_presence.
- [ ] Dispatch conserve ambas invariantes.
- [ ] Partial index incluya Return.
- [ ] Canonical Enums no use abreviaciones.
- [ ] MANUAL_ADJUSTMENT sea consistente.
- [ ] `otp_digest` sea la nomenclatura única.
- [ ] Tracking defina autorización realtime + fallback.
- [ ] Threat Model esté completo.
- [ ] Admin Operations esté completo.
- [ ] Edge Cases esté completo.
- [ ] Testing Strategy esté completo.
- [ ] Design System esté completo.
- [ ] Observability incluya redacción/retención/acceso.
- [ ] Deployment incluya secrets/backups/rollback/monitoring.
- [ ] Ledger tenga ejemplos zero-sum completos.
- [ ] Notifications tenga retry/dedup/receipts.
- [ ] Product Spec tenga MVP scope/KPIs/success criteria.
- [ ] business_manager aparezca en permisos.
- [ ] BUSINESS_VERIFICATION_STATUS sea único.
- [ ] 21_CANONICAL_ENUMS coincida con todos los documentos.
- [ ] README y Roadmap mantengan FASE 0 en revisión.
- [ ] Se ejecute un consistency pass final.
- [ ] El agente reporte decisiones pendientes reales.
- [ ] El Cerebro haga revisión final y apruebe explícitamente.

---

# 39. Regla de ejecución

Durante esta corrección:

SOLO modificar:

```text
README.md
/docs/*.md
```

y, si se desea conservar en repo:

```text
Gueguense_Auditoria_Cerebro_Fase0_v1_3.md
```

NO:

- crear apps;
- crear packages;
- crear supabase;
- instalar dependencias;
- crear migrations;
- desplegar;
- comenzar Fase 1.

---

# 40. Estado requerido al finalizar

El agente debe terminar con:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Nunca con:

```text
FASE 0 — APROBADA
```

La aprobación solo la emite el Cerebro/usuario después de revisar el siguiente ZIP.

---

# FIN DE DIRECTIVA v1.3
