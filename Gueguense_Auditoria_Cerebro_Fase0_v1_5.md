# GÜEGÜENSE — AUDITORÍA DEL CEREBRO FASE 0 v1.5

**Estado:** FASE 0 — EN REVISIÓN / CORRECCIÓN FINAL  
**Base revisada:** `gueguenseapp-main(3).zip`  
**Objetivo:** Corregir únicamente defectos verificables que todavía existen en `/docs`.  
**Regla:** No rediseñar el producto ni añadir módulos nuevos. Esta ronda debe cerrar Fase 0.

---

# 1. Veredicto

La arquitectura general de Güegüense ya es suficientemente estable.

Se consideran **CONGELADAS** estas decisiones:

- 4 interfaces: `business-mobile`, `driver-mobile`, `admin-web`, `tracking-web`.
- React Native + Expo para mobile.
- Next.js para web.
- Supabase/PostgreSQL/PostGIS.
- Quote y Delivery separados.
- Incidents separados de Delivery.
- Return: `RETURN_REQUIRED → RETURNING → RETURNED`.
- `PICKUP_CODE` distinto de `DELIVERY_OTP`.
- OTP de 6 dígitos.
- Tracking Web MVP mediante backend + polling adaptativo.
- Realtime privado para Business/Driver/Admin.
- Google Routes API.
- Ledger `ledger_transactions + ledger_postings`.
- Cash separado de earnings.
- Catálogo fuera del MVP.

No volver a discutir estas decisiones salvo un defecto de seguridad comprobado.

---

# 2. BLOQUEO A — State Machine: corregir inconsistencias finales

`04_DELIVERY_STATE_MACHINE.md` está cerca de estar completo, pero tiene errores concretos.

## A.1 No cancelar una quote consumida

Actualmente:

```text
SEARCHING_DRIVER → CANCELED
Side effect: quote canceled
```

Esto es incorrecto.

Cuando existe Delivery, la quote correspondiente ya está:

```text
CONSUMED
```

y debe permanecer inmutable como evidencia histórica.

Al cancelar Delivery:

```text
delivery.status → CANCELED
quote.status permanece CONSUMED
pricing/cancel adjustment se registra por separado
```

## A.2 Admin/Operator cancellation

`14_ADMIN_OPERATIONS.md` permite cancelación forzada, pero State Machine solo define `Business Member`.

Agregar actor autorizado de emergencia:

```text
Operator/Admin
```

con:

- reason obligatorio;
- audit log;
- reglas de custodia;
- no permitir cancelación simple post-`PICKED_UP`.

## A.3 Waiting/Business Closed

Edge Cases usa:

```text
ARRIVED_PICKUP → CANCELED
```

por negocio cerrado/timeout.

La State Machine debe documentar explícitamente la variante administrativamente autorizada.

## A.4 Return

En Edge Cases todavía aparece:

```text
* → RETURN_REQUIRED
```

Eliminar wildcard.

Solo estados post-custodia canónicos:

```text
PICKED_UP
TO_DROPOFF
ARRIVED_DROPOFF
```

pueden pasar directamente a `RETURN_REQUIRED`.

## A.5 Configuración

No tratar como invariantes:

- 5 min quote;
- 15 s offer;
- 2 h search;
- OTP lock 2 min.

Escribir:

```text
initial default / configurable policy
```

---

# 3. BLOQUEO B — `private.delivery_secrets` tiene una contradicción de lifecycle

Actualmente DB define:

```text
otp_digest NOT NULL
otp_ciphertext NOT NULL
otp_expires_at NOT NULL
```

pero el `PICKUP_CODE` se genera en `ARRIVED_PICKUP` y el OTP se genera solo después de confirmar `PICKED_UP`.

Por tanto la fila puede necesitar existir antes de que exista OTP.

## Solución

Opción recomendada:

Mantener una sola tabla `private.delivery_secrets`, pero:

```text
otp_digest NULL hasta PICKED_UP
otp_ciphertext NULL hasta PICKED_UP
otp_expires_at NULL hasta PICKED_UP
```

y documentar invariantes server-side:

```text
si delivery.status ∈ {PICKED_UP, TO_DROPOFF, ARRIVED_DROPOFF}
→ OTP material debe existir

si otp_verified_at != NULL
→ otp_digest/otp_ciphertext ya no vuelven a exponerse
```

No almacenar OTP plaintext.

---

# 4. BLOQUEO C — Invariantes DB faltantes entre Request, Quote y Delivery

La relación `delivery_requests 1:N delivery_quotes` ya está correcta conceptualmente.

Falta impedir que una request produzca varias deliveries por accidente.

Documentar:

```text
UNIQUE(deliveries.quote_id)
```

y una de estas dos protecciones:

### Recomendación

Partial Unique Index:

```text
una sola delivery_quote CONSUMED por delivery_request
```

Conceptualmente:

```sql
UNIQUE delivery_request_id
WHERE status = 'CONSUMED'
```

El SQL final se escribirá en Fase correspondiente.

También agregar `updated_at` a `deliveries` porque el pseudocódigo Dispatch lo utiliza.

---

# 5. BLOQUEO D — Database Architecture todavía no está realmente individualizada

El README dice:

```text
34 entidades individualizadas
```

pero el documento enumera 36 y todavía agrupa/abrevia múltiples entidades.

Corregir el número real y documentar **cada entidad MVP por separado**.

Especialmente:

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
notification_deliveries / notification_receipts

support_tickets
audit_logs
idempotency_keys
delivery_tracking_points
delivery_proofs
custody_handoffs
```

Para cada una incluir:

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

## D.1 Notification receipts

`13_NOTIFICATIONS.md` habla de receipts/dedup, pero DB solo tiene `notification_outbox`.

Agregar una entidad explícita, por ejemplo:

```text
notification_deliveries
```

para registrar:

```text
notification_id
device_token_id
provider_message_id
status
attempt_count
last_error_code
sent_at
receipt_checked_at
delivered/failed state when available
```

El nombre puede variar, pero debe existir el concepto.

---

# 6. BLOQUEO E — Estados auxiliares de DB no están centralizados

`21_CANONICAL_ENUMS.md` afirma ser el diccionario completo, pero DB contiene estados no definidos allí:

```text
business_members.status
driver_documents.verification_status
custody_handoffs.status
driver_payout_methods.verification_status
payouts.status
payments.status
cash_settlements.status
notification_outbox.status
```

No es obligatorio convertir todo a PostgreSQL ENUM.

Sí es obligatorio que los valores de dominio estén documentados de forma canónica.

Agregar en `21_CANONICAL_ENUMS.md` o marcar explícitamente como `CHECK-backed status`:

```text
BUSINESS_MEMBER_STATUS
DOCUMENT_VERIFICATION_STATUS
HANDOFF_STATUS
PAYOUT_METHOD_VERIFICATION_STATUS
PAYOUT_STATUS
PAYMENT_STATUS
CASH_SETTLEMENT_STATUS
NOTIFICATION_STATUS
TRACKING_FRESHNESS
PROOF_TYPE
```

No dejar valores libres ambiguos.

---

# 7. BLOQUEO F — API Contracts sigue siendo un índice, no un contrato

`07_API_CONTRACTS.md` lista endpoints pero no documenta sus contratos.

Debe incluir una tabla por acción crítica con:

```text
Endpoint
Actor
Auth/Authorization
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

## F.1 Endpoints que faltan o necesitan acción explícita

Agregar, como mínimo:

```text
Driver:
start pickup route
arrived pickup
start dropoff route
arrived dropoff
verify OTP
complete/confirm return flow as applicable
payout-method management

Business:
confirm pickup custody
member update/revoke
location update/deactivate

Handoff:
create/authorize
from-driver confirm
to-driver confirm
complete/abort

Return:
authorize/request
start
business confirm returned

Admin:
force cancel pre-custody
resolve suspended-driver custody
reactivate/suspend
pricing version activation

Finance:
payment operation
payout request/approve
cash settlement
ledger read views
```

Normalizar naming REST; no mezclar sin explicación:

```text
/business/...
/businesses/...
```

---

# 8. BLOQUEO G — Dispatch Engine perdió su algoritmo de selección

`08_DISPATCH_ENGINE.md` actualmente documenta casi exclusivamente concurrencia.

Debe recuperar el motor de búsqueda y scoring.

Agregar:

```text
1. Eligibility Filter
2. PostGIS Candidate Discovery
3. Freshness Filter
4. Coarse Ranking
5. Top-N Candidates
6. Google Compute Route Matrix
7. Final Scoring
8. Fairness
9. Dispatch Round
10. Offer Expiration
11. Radius Expansion
12. No-driver fallback
13. Operator escalation
```

## G.1 Elegibilidad

Driver candidato:

```text
verification_status = VERIFIED
account_status = ACTIVE
operational_state = AVAILABLE
GPS fresco según policy
vehículo compatible
sin delivery comprometida
zona habilitada
```

## G.2 Scoring

Documentar factores, sin fijar pesos todavía:

```text
ETA pickup
distance pickup
GPS freshness/quality
completion rate
cancellation rate
rating
fairness/recent workload
zone rules
```

Los pesos quedan configurables/TBD.

## G.3 Routes

```text
PostGIS → Top-N → Compute Route Matrix
```

No llamar Google por toda la flota.

---

# 9. BLOQUEO H — Accept Delivery no valida GPS freshness

El pseudocódigo bloquea `driver_presence`, pero solo lee `operational_state`.

Debe leer también:

```text
location_updated_at
```

y validar freshness dentro de la misma transacción/policy.

Si GPS está stale:

```text
STALE_DRIVER_LOCATION
```

y no acepta la oferta salvo política de excepción.

## H.1 SECURITY DEFINER

Documentar junto al pseudocódigo:

```text
REVOKE EXECUTE FROM PUBLIC
REVOKE EXECUTE FROM anon
GRANT EXECUTE únicamente al rol autenticado/autorizado necesario
```

Además:

- `auth.uid()`;
- `SET search_path = ''`;
- referencias schema-qualified.

---

# 10. BLOQUEO I — Suspensión y custodia se contradicen con Security

`12_SECURITY_ARCHITECTURE.md` dice que una cuenta Driver no `ACTIVE` hace rebotar operaciones críticas.

Eso es correcto para **nuevas operaciones**, pero no puede bloquear la resolución de un paquete ya bajo custodia.

Documentar:

```text
SUSPENDED/BLOCKED:
- no nuevas ofertas;
- no aceptar nuevas deliveries;
- no nuevas operaciones normales.

Si ya posee custodia:
- puede ejecutar únicamente acciones limitadas de resolución
  autorizadas por backend/operator:
  RETURN / HANDOFF / evidencia necesaria.
```

Esto debe coincidir en:

```text
04
07
12
15
```

---

# 11. BLOQUEO J — Tracking Architecture tiene terminología incorrecta e información faltante

`09_TRACKING_ARCHITECTURE.md` llama "estados terminales" a:

```text
RETURN_REQUIRED
RETURNING
```

No son terminales.

Llamarlos:

```text
OTP_DISALLOWED_STATES
```

Terminales reales:

```text
DELIVERED
RETURNED
CANCELED
FAILED
```

## J.1 Completar tracking MVP en el propio documento 09

Documentar explícitamente:

```text
Tracking Web
→ validate token hash
→ snapshot
→ adaptive polling
→ no direct Supabase Realtime anonymous
→ stop/slow polling at terminal state
```

## J.2 Headers/privacidad

Agregar:

```text
Cache-Control: no-store
Referrer-Policy: no-referrer
```

y token raw fuera de analytics/access logs.

---

# 12. BLOQUEO K — Ingesta GPS tiene una contradicción entre docs

`05_SYSTEM_ARCHITECTURE.md` dice:

```text
Accuracy < 50m
```

como validación.

`09_TRACKING_ARCHITECTURE.md` dice que >50m se guarda con:

```text
location_quality = LOW
```

Decisión:

No rechazar automáticamente solo por accuracy > threshold.

Usar:

```text
quality/anomaly classification
```

y decidir si el punto sirve para:

- tracking;
- dispatch eligibility;
- history.

Threshold configurable.

---

# 13. BLOQUEO L — Edge Cases no está alineado 100% con State Machine

Corregir:

## L.1 BUSINESS_CLOSED

Actualmente:

```text
ARRIVED_PICKUP → CANCELED
```

pero actor/authorization debe coincidir con State Machine.

## L.2 WAITING_TIMEOUT

No permitir que el Driver cambie directamente a `CANCELED`.

Debe:

```text
Driver reports/request
→ backend/operator/business policy
→ authorized cancellation
```

## L.3 CUSTOMER_CANCELS_IF_ALLOWED

Definir actor y autorización.

## L.4 RETURN_REQUIRED

Eliminar:

```text
* → RETURN_REQUIRED
```

usar la lista explícita post-custodia.

## L.5 WRONG_ADDRESS

No crear una nueva Quote dentro de una Delivery activa.

Usar:

```text
incident
→ recalculated route
→ pricing_adjustment if authorized
```

o Return.

---

# 14. BLOQUEO M — Umbrales comerciales/operativos siguen hardcodeados

Convertir a:

```text
configurable policy + initial default
```

en todos los docs para:

```text
quote expiry
offer timeout
dispatch rounds
radius expansion
search max time
waiting grace
waiting timeout
customer unreachable timeout
GPS delayed/stale
OTP max attempts
OTP lock duration
signed URL lifetime
tracking polling
four-eyes amount
```

Los defaults pueden conservarse como ejemplos.

---

# 15. BLOQUEO N — Ledger todavía está incompleto

La convención:

```text
positive = DEBIT
negative = CREDIT
SUM = 0
```

ya está correcta.

Faltan ejemplos solicitados:

```text
WAITING_FEE
REFUND
MANUAL_ADJUSTMENT
```

Además documentar:

```text
transaction_type
```

para cada journal transaction.

No crear una transacción separada "driver earning" si ya forma parte del mismo asiento comercial.

## N.1 Zero-sum enforcement

Explicar que `SUM(postings.amount)=0` debe verificarse dentro de una operación transaccional controlada antes de confirmar el journal.

No confiar en que el frontend envíe postings balanceados.

---

# 16. BLOQUEO O — Testing Strategy sigue demasiado corta

Agregar explícitamente:

```text
State Machine:
- all valid transitions
- forbidden transitions
- cancellation actors
- return transitions

Dispatch:
- stale GPS
- suspended driver
- offer expiry
- Top-N fallback
- same driver / two deliveries
- two drivers / same delivery

RLS:
- cross-business
- business member locations N:M
- driver owns records
- private schemas inaccessible
- admin roles

OTP/Tracking:
- expired tracking token
- revoked tracking token
- OTP state visibility
- lockout
- no Business/Driver/Admin raw OTP

Custody:
- pickup code expiry
- business confirms
- driver cannot self-confirm
- return
- handoff

Finance:
- zero-sum
- refund
- waiting fee
- return fee
- cash settlement
- payout idempotency

Resilience:
- app killed
- push lost
- realtime lost
- maps unavailable
- duplicate webhook
```

---

# 17. BLOQUEO P — Deployment todavía omite partes del DoD

Agregar explícitamente:

```text
secret ownership per environment
who may modify production secrets
migration promotion Dev → Staging → Prod
migration drift handling
restore drill owner/process
monitoring/alerting
incident response
mobile rollback strategy
forced/min-supported version governance
forward-fix criteria
```

PITR/retention debe describirse como configuración del plan/proveedor, no una garantía universal hardcoded.

---

# 18. Correcciones menores obligatorias

1. README dice `34 entidades`; DB enumera más. Corregir número o eliminar el número.
2. `private.secrets` en State Machine debe ser `private.delivery_secrets`.
3. `delivery_proofs`, `custody_handoffs`, payout/payment statuses deben coincidir con Canonical Enums.
4. No llamar `RETURN_REQUIRED`/`RETURNING` estados terminales.
5. `Cancellation Rate` del Product Spec no debe describir "cancelaciones post-pickup" como cancelación simple; post-custodia es Return/Handoff.
6. `Stale Tracking Rate >60s` debe usar threshold configurable.
7. Admin y Business normal pickup confirmation deben estar separados de cualquier override administrativo extraordinario.

---

# 19. Definition of Done v1.5

Fase 0 queda lista para aprobación cuando:

- [ ] Quote consumida no se modifica al cancelar Delivery.
- [ ] State Machine y Edge Cases usan los mismos actores/transiciones.
- [ ] No wildcard `* → RETURN_REQUIRED`.
- [ ] delivery_secrets respeta que OTP nace después del pickup.
- [ ] quote→delivery tiene constraints conceptuales de unicidad.
- [ ] Database Architecture documenta cada tabla MVP necesaria.
- [ ] Notification receipt/delivery model está documentado.
- [ ] Status auxiliares están centralizados/documentados.
- [ ] API Contracts son contratos, no solo listado.
- [ ] Endpoints de start-route/return/handoff/custody están cubiertos.
- [ ] Dispatch contiene discovery/scoring/Top-N/Routes/rounds/fairness.
- [ ] accept valida GPS freshness.
- [ ] SECURITY DEFINER documenta REVOKE/GRANT.
- [ ] Suspensión conserva ruta de resolución de custodia.
- [ ] Tracking Web polling está documentado en 09.
- [ ] Tracking usa Cache-Control/Referrer-Policy adecuados.
- [ ] GPS accuracy policy es consistente.
- [ ] Edge Cases coincide con State Machine.
- [ ] Todos los thresholds relevantes son configurables.
- [ ] Ledger agrega waiting/refund/manual adjustment.
- [ ] Testing cubre invariantes y resiliencia.
- [ ] Deployment cubre secrets/promotion/monitoring/incident response.
- [ ] README no realiza afirmaciones falsas sobre número/completitud.
- [ ] Canonical consistency pass limpio.
- [ ] Estado sigue `FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN`.
- [ ] Cerebro revisa y emite aprobación explícita.

---

# 20. Regla final

Esta es la **ronda final de corrección documental**.

No crear nuevas funcionalidades.

No comenzar Fase 1.

Modificar únicamente:

```text
README.md
/docs/*.md
```

Estado de salida:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```
