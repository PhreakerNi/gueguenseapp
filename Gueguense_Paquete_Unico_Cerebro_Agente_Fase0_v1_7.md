# GÜEGÜENSE — PAQUETE ÚNICO DEL CEREBRO + PROMPT DEL AGENTE

**Versión:** Fase 0 v1.7  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Uso:** Este es el ÚNICO archivo que debes entregar al agente para esta ronda.  
**Objetivo:** Evitar tener que pasar una directiva y un prompt por separado.

---

# INSTRUCCIÓN DE USO PARA EL AGENTE

Lee este archivo completo de principio a fin antes de modificar nada.

Este documento contiene dos partes:

1. **PARTE A — DIRECTIVA DEL CEREBRO**  
   Define qué está mal, qué debe quedar corregido y qué decisiones arquitectónicas son obligatorias.

2. **PARTE B — PROMPT DE EJECUCIÓN DEL AGENTE**  
   Define exactamente cómo debes trabajar, qué puedes modificar, qué debes verificar y cómo debes entregar el resultado.

La PARTE A define **qué** debe corregirse.  
La PARTE B define **cómo** debes ejecutarlo.

En caso de conflicto entre ambas:

```text
PARTE A — DIRECTIVA DEL CEREBRO
tiene prioridad
sobre
PARTE B — PROMPT DE EJECUCIÓN
```

No comenzar Fase 1.

---

# ============================================================
# PARTE A — DIRECTIVA DEL CEREBRO
# ============================================================

# GÜEGÜENSE — AUDITORÍA DEL CEREBRO FASE 0 v1.7

**Estado:** FASE 0 — EN REVISIÓN / PARCHE FINAL DE CUMPLIMIENTO  
**Base revisada:** `gueguenseapp-main(5).zip`  
**Objetivo:** Corregir exclusivamente los incumplimientos restantes del Definition of Done v1.6.  
**Regla:** La arquitectura está congelada. No añadir nuevas funciones de producto, no rediseñar dominios y no comenzar Fase 1.

---

# 1. Veredicto

La versión 1.6 corrigió correctamente la mayoría de los bloqueos anteriores.

Se consideran **CUMPLIDOS** y no deben rediseñarse:

- Las 37 entidades están ahora separadas en subsecciones individuales.
- `driver_presence` ya bloquea escritura GPS directa desde cliente.
- `delivery_tracking_points` ya niega lectura directa al Tracking Web.
- `idempotency_keys` ya contempla `USER`, `SYSTEM`, `WEBHOOK`, `BACKGROUND_JOB`.
- Payout approval ya termina en `APPROVED`, no en `PAID`.
- `driver_documents` usa correctamente `verification_status`.
- Tracking Web MVP usa backend + polling adaptativo.
- Dispatch recuperó PostGIS → Top-N → Compute Route Matrix → scoring → fairness → rounds.
- Accept Delivery valida `location_updated_at`.
- `SECURITY DEFINER` documenta `search_path = ''`, `REVOKE` y `GRANT`.
- OTP/Pickup secrets lifecycle está separado.
- Notification Outbox + `notification_deliveries` existe.
- Fase 0 sigue marcada como candidata y no se creó código ejecutable.

Quedan pocos defectos verificables. Esta v1.7 es un **parche final de cumplimiento**, no otra ronda arquitectónica.

---

# 2. BLOQUEO A — API Contracts aún no cubre todas las operaciones v1.6

`07_API_CONTRACTS.md` mejoró mucho, pero todavía faltan contratos explícitos que la v1.6 exigió.

Agregar como contratos formales, utilizando la misma tabla de 12 columnas:

## Driver / Payout methods

```text
GET   /api/v1/driver/payout-methods
PATCH /api/v1/driver/payout-methods/{id}
```

Si la eliminación/desactivación se modela como PATCH, documentarlo.

## Admin — Drivers

```text
GET  /api/v1/admin/verifications/drivers
POST /api/v1/admin/drivers/{id}/reject
POST /api/v1/admin/drivers/{id}/reactivate
```

## Admin — Businesses

```text
POST /api/v1/admin/businesses/{id}/reactivate
```

## Admin — Operations

```text
GET  /api/v1/admin/operations/active
POST /api/v1/admin/incidents/{id}/resolve
POST /api/v1/admin/deliveries/{id}/force-cancel
```

`force-cancel` solo puede operar pre-custodia y exige `reason` + audit.

## Handoff

La API actual crea el handoff y permite `confirm-from`, `confirm-to` y `abort`, pero la v1.6 exigió documentar autorización/completado cuando sean acciones separadas.

Elegir UNA semántica coherente y documentarla:

### Opción recomendada para MVP

`POST /api/v1/admin/handoffs` **crea y autoriza** el handoff en una sola operación administrativa auditable.

Entonces declarar expresamente:

```text
No existe /authorize separado en MVP porque la creación por Operator/Admin equivale a autorización.
```

`confirm-to` puede completar atómicamente el handoff si esa es la decisión, pero entonces declarar:

```text
No existe /complete separado en MVP; confirm-to es la acción que produce COMPLETED.
```

No dejar los endpoints exigidos por v1.6 simplemente ausentes sin explicar la consolidación.

## Admin — Payout

Agregar:

```text
POST /api/v1/admin/payouts/{id}/reject
GET  /api/v1/admin/payouts/{id}
```

y documentar cómo una payout pasa:

```text
APPROVED → PROCESSING → PAID
```

mediante worker/proveedor/webhook validado, nunca por el endpoint `/approve`.

## Audit / Finance

Agregar al menos contratos de lectura:

```text
GET /api/v1/admin/audit
GET /api/v1/admin/ledger/transactions
GET /api/v1/admin/ledger/accounts/{id}
GET /api/v1/payments/{id}
GET /api/v1/driver/payouts/{id}
```

No es necesario inventar endpoints adicionales fuera de estos flujos.

---

# 3. BLOQUEO B — Dos filas del API Contract tienen columnas desplazadas

La tabla global tiene 12 columnas:

```text
Endpoint
Actor
Auth
Allowed State
Request
Response
Resulting State
Idempotency
Domain Errors
Events
Notifications
Financial Effects
```

Sin embargo estas filas tienen solo 11 celdas y desplazan el significado:

```text
POST /api/v1/driver/documents/upload-authorization
POST /api/v1/driver/location
```

Corregirlas para que tengan las 12 columnas completas.

Ejemplo conceptual:

```text
upload-authorization:
Resulting State = N/A
Idempotency = Opcional/según diseño
Domain Errors = INVALID_DOCUMENT_TYPE, ...
Events = N/A
Notifications = N/A
Financial Effects = N/A

driver/location:
Resulting State = N/A
Idempotency = No / sequence-based según diseño
Domain Errors = STALE_LOCATION, INVALID_COORDINATES, ...
Events = N/A
Notifications = N/A
Financial Effects = N/A
```

No permitir tablas cuyo contenido cambie de columna por faltar una celda.

---

# 4. BLOQUEO C — Onboarding usa `PENDING` de forma ambigua

En `POST /api/v1/driver/onboarding` aparece:

```text
Resulting State = PENDING (en drivers)
```

pero `PENDING` pertenece a:

```text
DRIVER_VERIFICATION_STATUS
```

no a `DRIVER_ACCOUNT_STATUS`.

La respuesta debe distinguir:

```text
verification_status = PENDING
account_status = REGISTERED
```

o `UNDER_REVIEW` si esa es la transición decidida.

No usar un único campo `status`.

De la misma forma, en:

```text
POST /api/v1/businesses
```

`PENDING` debe quedar explícitamente identificado como:

```text
verification_status = PENDING
```

y debe indicarse cuál es el `account_status` inicial.

No mezclar verification status con account status.

---

# 5. BLOQUEO D — Evento `DRIVER_VERIFIED` usado por API pero ausente del registro canónico

`07_API_CONTRACTS.md` emite:

```text
DRIVER_VERIFIED
```

en:

```text
POST /api/v1/admin/drivers/{id}/approve
```

pero `21_CANONICAL_ENUMS.md` no contiene ese evento.

Agregar:

```text
DRIVER_VERIFIED
```

al `EVENT_TYPE`.

Si los nuevos endpoints de esta v1.7 introducen eventos adicionales como:

```text
DRIVER_REJECTED
DRIVER_REACTIVATED
BUSINESS_REACTIVATED
PAYOUT_REJECTED
```

deben agregarse al registro canónico en el mismo cambio.

**Regla:** todo evento que aparezca en la columna `Events` de API Contracts debe existir exactamente en el diccionario canónico.

---

# 6. BLOQUEO E — Idempotency actor model necesita invariantes explícitas

La tabla ya permite:

```text
USER
SYSTEM
WEBHOOK
BACKGROUND_JOB
```

pero debe documentar los invariantes de identidad.

Agregar en `06_DATABASE_ARCHITECTURE.md`:

```text
actor_type = USER
→ actor_user_id NOT NULL

actor_type IN (SYSTEM, BACKGROUND_JOB)
→ actor_user_id puede ser NULL
→ external_actor_key identifica el subsistema cuando aplique

actor_type = WEBHOOK
→ external_actor_key/provider identity obligatorio
→ actor_user_id normalmente NULL
```

La unicidad debe impedir repetición dentro del scope/actor correspondiente.

No es necesario escribir SQL final, pero documentar la semántica.

También documentar explícitamente:

```text
mismo key + mismo fingerprint
→ replay seguro / respuesta previa

mismo key + fingerprint distinto
→ IDEMPOTENCY_FINGERPRINT_MISMATCH
```

Esto ya está en Testing y debe existir también en el contrato de arquitectura.

---

# 7. BLOQUEO F — Secure document upload sigue pasando `file_path` desde cliente en registro

La autorización de upload devuelve un path decidido por backend, lo cual es correcto.

Pero después:

```text
POST /api/v1/driver/documents
```

acepta nuevamente:

```text
file_path
```

como dato enviado por cliente.

Esto puede mantenerse solo si el backend comprueba que ese path fue emitido por una autorización previa válida y pertenece al mismo Driver.

Para hacer el contrato más fuerte, preferir:

```text
upload_id / upload_reference
```

en lugar de confiar en un path literal.

Flujo:

```text
POST upload-authorization
→ backend crea upload_id + storage path server-owned
→ signed upload
→ cliente sube
→ POST /driver/documents { upload_id, document_type }
→ backend resuelve storage path y verifica ownership/mime/size
```

No es obligatorio crear una tabla nueva si la implementación futura usa una referencia firmada verificable, pero el contrato debe impedir un `file_path` arbitrario.

---

# 8. BLOQUEO G — Policies configurables todavía aparecen como valores absolutos

La arquitectura ya decidió que los valores son defaults configurables, pero `15_ERROR_AND_EDGE_CASES.md` todavía presenta varios como reglas absolutas:

```text
+2km, 3 rondas
15s
>60s
>3 min
15s polling
>5 min
>15 min
10 min
3 intentos
2 min
```

Cambiar el texto a:

```text
initial default / configurable policy
```

Ejemplos pueden permanecer.

También corregir en Security:

```text
Signed URLs 15m
OTP lock 2 min / 3 fallos
```

para indicar que son defaults configurables.

En API/Admin/Finance cualquier threshold monetario como:

```text
C$5,000
```

debe continuar marcado explícitamente como policy configurable.

En `21_CANONICAL_ENUMS.md`, un estado `EXPIRED` nunca debe depender semánticamente de un número fijo; depende de `expires_at`.

---

# 9. BLOQUEO H — Edge Cases: eliminar la apariencia de pseudoestado restante

La regla introductoria usa `PICKED_UP / DROPOFF` y `* -> RETURN_REQUIRED` como **ejemplos de sintaxis prohibida**. Eso es válido, pero debe etiquetarse claramente como:

```text
EJEMPLO INVÁLIDO — NO USAR
```

para evitar que búsquedas automatizadas lo interpreten como un estado real.

En el caso `CONTROLLED_HANDOFF`, la columna de transición dice:

```text
Permanece TO_DROPOFF / ARRIVED_DROPOFF
```

Reescribir como:

```text
El DELIVERY_STATUS no cambia por el handoff.
El estado previo se conserva; los estados desde los que puede autorizarse
este flujo se enumeran explícitamente según la State Machine/Incident policy.
```

`CONTROLLED_HANDOFF` es una operación de `custody_handoffs`, nunca un `DELIVERY_STATUS`.

En `DRIVER_SUSPENDED_MID`, escribir:

```text
Operator orders RETURN or starts a custody_handoff
```

en lugar de la forma abreviada `RETURN / HANDOFF`.

---

# 10. BLOQUEO I — Consistency Pass de API Events

Después de agregar/fijar endpoints, realizar una comprobación mecánica:

```text
EVENTS usados en 07_API_CONTRACTS.md
⊆
EVENT_TYPE definido en 21_CANONICAL_ENUMS.md
```

Debe ser 100%.

El agente debe reportar expresamente:

```text
Eventos API huérfanos encontrados: 0
```

No basta con afirmar que los documentos están alineados.

---

# 11. BLOQUEO J — Consistency Pass del API Contract

Validar mecánicamente que **todas las filas de las tablas API tengan exactamente 12 columnas**.

El agente debe reportar:

```text
Filas API con columnas inválidas: 0
```

Esto evita el error actual de `upload-authorization` y `driver/location`.

---

# 12. Estado de los demás requisitos v1.6

No modificar innecesariamente:

```text
GPS backend ingestion
Tracking polling
DB entities 22–37
Payout approve→APPROVED
driver_documents CHECK
notification_deliveries
Dispatch scoring
mutex driver_presence
OTP lifecycle
Security Definer
Deployment base
```

Solo cambiar si es necesario para mantener consistencia con los parches anteriores.

---

# 13. Definition of Done v1.7

Fase 0 queda lista para aprobación si:

- [ ] API Contracts incluye los contratos faltantes de esta directiva.
- [ ] Consolidación de Handoff `/authorize` y `/complete` está documentada explícitamente si no existen endpoints separados.
- [ ] Las 2 filas API mal formadas tienen 12 columnas.
- [ ] Todas las filas API tienen exactamente 12 columnas.
- [ ] Driver onboarding separa verification/account status.
- [ ] Business creation separa verification/account status.
- [ ] `DRIVER_VERIFIED` está en el registro canónico.
- [ ] Cualquier evento nuevo de v1.7 también está registrado.
- [ ] Eventos API huérfanos = 0.
- [ ] Idempotency define reglas para USER/SYSTEM/WEBHOOK/BACKGROUND_JOB.
- [ ] Fingerprint mismatch está documentado fuera de Testing.
- [ ] Upload de documentos no confía en un path arbitrario.
- [ ] Thresholds restantes están marcados como defaults configurables.
- [ ] Edge Cases no parece utilizar pseudoestados reales.
- [ ] `CONTROLLED_HANDOFF` permanece desacoplado de DELIVERY_STATUS.
- [ ] API ↔ DB ↔ State Machine ↔ Canonical Enums pasan consistency pass.
- [ ] No se creó código ejecutable.
- [ ] Estado sigue `FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN`.
- [ ] Cerebro realiza la revisión binaria final.

---

# 14. Regla final

Esta v1.7 **no abre una nueva ronda arquitectónica**.

Solo corregir estos incumplimientos.

Modificar únicamente:

```text
README.md
/docs/*.md
```

Estado final:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después detenerse.


---

# ============================================================
# PARTE B — PROMPT DE EJECUCIÓN DEL AGENTE
# ============================================================

# PROMPT DEL AGENTE — PARCHE FINAL DE CUMPLIMIENTO FASE 0 v1.7

Eres el Agente de Ejecución de Güegüense.

El Cerebro revisó directamente `gueguenseapp-main(5).zip`.

La arquitectura está CONGELADA.

No rediseñes el producto y no agregues funciones nuevas.

## LEE

1. Documento Maestro.
2. Directivas/Auditorías anteriores.
3. `/docs`.
4. `Gueguense_Auditoria_Cerebro_Fase0_v1_7.md`.
5. `README.md`.

v1.7 prevalece únicamente para los incumplimientos que corrige.

## SOLO DOCUMENTACIÓN

Puedes modificar:

```text
README.md
/docs/*.md
```

NO:

- crear apps/
- crear packages/
- crear supabase/
- instalar dependencias
- crear migrations
- hacer deploy
- comenzar Fase 1

## TAREA

Aplicar TODO el Definition of Done v1.7.

### PRIORIDAD 1 — API CONTRACTS

Agregar los contratos faltantes indicados por v1.7.

Para cada mutación crítica mantener exactamente estas 12 columnas:

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

Corregir especialmente las filas:

```text
POST /driver/documents/upload-authorization
POST /driver/location
```

que actualmente tienen una celda menos.

### PRIORIDAD 2 — STATUS AMBIGUOS

No escribir:

```text
status = PENDING en drivers/businesses
```

sin identificar el dominio.

Escribir expresamente:

```text
verification_status
account_status
```

### PRIORIDAD 3 — EVENT REGISTRY

Agregar `DRIVER_VERIFIED`.

Si los nuevos endpoints introducen eventos, registrarlos también.

Al final comprobar mecánicamente:

```text
API event tokens - canonical EVENT_TYPE = ∅
```

### PRIORIDAD 4 — IDEMPOTENCY

Documentar invariantes por:

```text
USER
SYSTEM
WEBHOOK
BACKGROUND_JOB
```

y comportamiento de fingerprint mismatch.

### PRIORIDAD 5 — UPLOAD

No confiar en `file_path` arbitrario.

Preferir `upload_id/upload_reference` emitido por backend o documentar verificación criptográfica/ownership equivalente.

### PRIORIDAD 6 — CONFIG

Marcar como:

```text
initial default / configurable policy
```

los valores temporales/radios/thresholds que todavía aparezcan como absolutos.

### PRIORIDAD 7 — EDGE CASES

`CONTROLLED_HANDOFF` nunca es DELIVERY_STATUS.

Evitar formas que parezcan pseudoestados.

## VALIDACIONES MECÁNICAS OBLIGATORIAS

Antes de entregar:

### Check 1 — Columnas API

Todas las filas de contratos API:

```text
exactamente 12 columnas
```

Reportar:

```text
Filas API inválidas: 0
```

### Check 2 — Eventos

Todos los eventos usados por API existen en EVENT_TYPE.

Reportar:

```text
Eventos API huérfanos: 0
```

### Check 3 — Estados

No mezclar:

```text
verification_status
account_status
operational_state
delivery status
handoff status
```

### Check 4 — Fase

Debe seguir:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

## REPORTE FINAL

Entregar:

1. Archivos modificados.
2. Correcciones v1.7.
3. `Filas API inválidas: 0`.
4. `Eventos API huérfanos: 0`.
5. Consistency pass.
6. Decisiones pendientes reales.
7. Checklist v1.7.
8. Estado exacto:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENTE.

No comiences Fase 1.


---

# ============================================================
# REGLA FINAL DEL PAQUETE ÚNICO
# ============================================================

Cuando termines de aplicar este documento:

1. Realiza todos los consistency checks.
2. Corrige cualquier incumplimiento encontrado.
3. No comiences Fase 1.
4. No escribas código ejecutable.
5. Entrega el reporte solicitado.
6. Termina exactamente con:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENTE y espera la revisión del Cerebro/usuario.

---

# FIN DEL PAQUETE ÚNICO
