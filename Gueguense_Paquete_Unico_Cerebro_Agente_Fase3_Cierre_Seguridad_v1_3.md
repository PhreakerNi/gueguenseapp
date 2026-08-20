# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE

# FASE 3 — CIERRE DE SEGURIDAD Y EVIDENCIA REAL v1.3

**Repositorio:** `https://github.com/PhreakerNi/gueguenseapp`  
**Rama obligatoria:** `phase/3-onboarding-b2b-drivers`  
**SHA base auditado:** `530ee3068af7504284fe6a20c6fe02d6edb6489d`  
**Run auditado:** `32388286908`  
**F2/main aprobada:** `6ec08356b70e665bbe277c9a43a7607e47346d58`  
**Estado:** 🟡 FASE 3 — CIERRE DE SEGURIDAD v1.3 REQUERIDO  
**Fase 4:** ⛔ NO AUTORIZADA

---

## 0. DICTAMEN DEL CEREBRO

La auditoría directa confirma:

```text
✅ 5/5 jobs SUCCESS
✅ Unit: 57/57
✅ Foundation pgTAP: 60/60
✅ F3 pgTAP: 42/42
✅ DB total: 102/102
✅ F2 Auth: 14/14, fail 0
✅ F3 HTTP: 24/24, fail 0
✅ DB Types Drift: 0
✅ fresh supabase db reset PASS
✅ tested SHA == branch HEAD
```

El reporte del agente indicó `Foundation 56/56`; el valor real es `60/60`.
F3 todavía NO se aprueba porque existen fallos de seguridad y fallbacks
sintéticos no cubiertos por CI.

---

## 1. BASE Y GIT

Antes de modificar:

```bash
git fetch origin
git checkout phase/3-onboarding-b2b-drivers
git pull --ff-only origin phase/3-onboarding-b2b-drivers
git rev-parse HEAD
```

Debe ser exactamente:

```text
530ee3068af7504284fe6a20c6fe02d6edb6489d
```

Si cambió: DETENERSE y reportar.

No rebase, no force push, no merge F3 a main, no F4.

Crear nueva migración correctiva; NO editar Foundation:

```text
supabase/migrations/20260820000001_phase3_security_closure_v1_3.sql
```

---

## 2. BLOQUEADOR CRÍTICO — MFA AAL2

En `api-v1` el check actual usa una condición equivalente a:

```ts
if (jwtAal !== "aal2" && !allowedRoles.includes(role)) { ... }
```

Como el rol ya fue validado antes, un rol permitido puede saltarse el AAL2.

Corregir TODOS:

```text
GET  /admin/verifications/drivers
GET  /admin/verifications/drivers/{id}
GET  /admin/driver-documents/{id}/read-url
POST /admin/drivers/{id}/approve
POST /admin/drivers/{id}/reject
```

Regla exacta:

```ts
if (jwtAal !== "aal2") {
  return AUTH_MFA_REQUIRED 403;
}
```

---

## 3. AAL SOLO DE LA SESIÓN ACTUAL

Eliminar cualquier elevación basada en:

```text
user.factors
factor TOTP enrolado
factor verified
```

Un factor existente NO convierte una sesión AAL1 en AAL2.

Fuente permitida:

```text
JWT ya validado con auth.getUser(token)
claim aal === "aal2"
```

Claim ausente/inválido => AAL1.

Test obligatorio: mismo verification_agent, TOTP enrolado, token antiguo AAL1
=> 403. Token nuevo AAL2 => permitido.

---

## 4. PLATFORM ROLE SOLO `public.profiles`

Eliminar de `api-v1`:

```text
user_metadata.platform_role
app_metadata.platform_role como fallback de autoridad
email.includes("admin")
email.includes("agent")
email.includes("oper")
email.includes("superadmin")
```

Autoridad F3:

```text
public.profiles.platform_role
```

Profile/role ausente => DENY.

Aplicar la misma regla a `admin_verify_driver`.
Eliminar fallback a `auth.users.raw_user_meta_data`, app metadata y email.

---

## 5. NO CREAR DATOS FALSOS

Eliminar de backend:

```text
crear Driver automático si target no existe
national_id fake
license fake
Yamaha/FZ fake
placa fake
documentos fake
storage_path fake
mock_signed_token
full-table scan fallback para inventar un resultado
```

Semántica:

```text
driver missing -> 404
vehicle missing -> []
documents missing -> []
document missing -> 404
signed URL failure -> 500 genérico
```

Nunca fabricar entidades para hacer pasar tests.

---

## 6. ADMIN QUEUE / DETAIL

Queue debe filtrar:

```text
verification_status IN ('PENDING','UNDER_REVIEW')
```

DTO mínimo; evitar PII innecesaria en listado.

Detail:

```text
GET /admin/verifications/drivers/{id}
```

retorna datos REALES de driver/vehicle/documents.

Admin Web debe consumir Detail y permitir revisar el dossier antes de aprobar.

Implementar UI mínima, por ejemplo:

```text
/verifications/[driverId]
```

Debe consumir Edge para:

```text
detail
signed read
approve
reject
```

No direct table reads del dossier.

---

## 7. SIGNED READ ADMIN

Endpoint real:

```text
GET /admin/driver-documents/{document_id}/read-url
```

Solo:

```text
verification_agent/admin/super_admin
AAL2 real
```

Usar:

```text
createSignedUrl(path, 900)
```

TTL real: 900 s.

No fallback/mock URL.
No persistir signed URL.
No loguearla.

---

## 8. COMMIT DE DOCUMENTO DEBE VERIFICAR STORAGE REAL

Eliminar confianza en:

```text
file_size enviado por cliente
mime_type enviado por cliente
defaults 2048/application/pdf
```

Firma preferida:

```text
commit_driver_document(actor_id, upload_id, document_type)
```

Dentro del RPC consultar:

```text
private.driver_document_upload_authorizations
storage.objects
```

Validar:

```text
authorization existe
driver_id == actor
document_type coincide
not expired
committed_at IS NULL
object exists
bucket == driver-documents
name == authorized storage_path
actual MIME == authorized MIME
actual MIME allowed
actual size >= 1
actual size <= authorized max_size
actual size <= 10 MiB
```

Metadata ausente/no parseable => `UPLOAD_UNVERIFIED`.

Códigos canónicos:

```text
UPLOAD_UNVERIFIED
EXPIRED_UPLOAD_REF
AUTH_FORBIDDEN
DOCUMENT_ALREADY_SUBMITTED
```

---

## 9. NUNCA BORRAR DOCUMENTOS EN COMMIT

Eliminar el `DELETE` actual de documentos activos.

Si existe un documento activo del mismo tipo:

```text
PENDING / UNDER_REVIEW / VERIFIED
-> DOCUMENT_ALREADY_SUBMITTED
```

Si anteriores son:

```text
REJECTED / EXPIRED
```

crear NUEVA fila PENDING.

Histórico inmutable.

---

## 10. APPROVE / REJECT EXACTOS

Approve permitido solo si:

```text
driver exists
verification IN (PENDING, UNDER_REVIEW)
account = REGISTERED
vehicle exists
current NATIONAL_ID exists
current DRIVER_LICENSE exists
current VEHICLE_REGISTRATION exists
```

Los documentos actuales para approve son:

```text
PENDING / UNDER_REVIEW
```

`REJECTED` y `EXPIRED` NO cuentan.

Eliminar cualquier código que cambie un REJECTED histórico a VERIFIED.

Approve atómico:

```text
3 current docs -> VERIFIED
driver -> VERIFIED
account -> ACTIVE
driver_presence -> OFFLINE
audit -> DRIVER_VERIFIED
```

Reject:

```text
current docs -> REJECTED + reason
driver -> REJECTED
account -> REGISTERED
audit -> DRIVER_REJECTED
```

No tocar histórico.

---

## 11. DOCUMENT TYPES

Backend debe soportar los 5 tipos ya definidos:

```text
NATIONAL_ID
DRIVER_LICENSE
VEHICLE_REGISTRATION
CRIMINAL_RECORD
INSURANCE
```

Required para approve: los primeros 3.
Los otros 2 son opcionales.

---

## 12. DOCUMENTPICKER FAIL-CLOSED

Driver Mobile ya usa DocumentPicker, pero eliminar:

```text
asset.size ?? 1024
mimeType || application/pdf
docInfo.size || 1024
```

Si falta size o MIME válido:

```text
mostrar error
NO pedir upload authorization
```

Normalización segura permitida:

```text
image/jpg -> image/jpeg
```

No asumir PDF.

---

## 13. BUSINESS — QUITAR COORDENADAS DEFAULT

Eliminar valores reales iniciales:

```text
12.136389
-86.251389
```

`latitude` y `longitude` deben iniciar vacíos.

Esos números pueden aparecer solo como placeholders de ejemplo.

Usuario introduce coordenadas reales o se implementa "Usar mi ubicación".

---

## 14. MOBILE / EDGE ENV FAIL-CLOSED

Eliminar runtime fallback:

```ts
EXPO_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
```

Business/Driver usan config obligatoria.

Edge, después de `/health`, exige:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Falta => `SERVER_CONFIGURATION_ERROR`, sin imprimir secretos.

---

## 15. IDEMPOTENCY TTL REAL

`expires_at` no puede ser decorativo.

Dentro del mismo advisory lock:

```text
cached + expires_at > now() -> replay/mismatch
cached + expires_at <= now() -> expirar registro y tratar como nueva operación
```

TTL = 24h.

F3 debe usar:

```text
actor_type = USER
```

`response_body_ref` puede apuntar al response privado.

---

## 16. RETRY DEBE REUSAR KEY

UUID-v4 por ACCIÓN, no por intento HTTP.

```text
acción A -> key A
retry red misma acción -> key A
operación termina -> limpiar
nueva acción -> key B
```

Aplicar a Business, Driver docs/vehicle/onboarding y Admin approve/reject.

---

## 17. ACLARACIÓN SUPABASE SIGNED UPLOAD

No inventar TTL configurable de 15m en `createSignedUploadUrl`.

Supabase actualmente define la URL/token de signed upload con validez del
proveedor de 2 horas.

Contrato Güegüense:

```text
Provider signed upload lifetime: 2h
Application upload authorization/commit window: 15m
```

Después de 15m:

```text
commit -> EXPIRED_UPLOAD_REF
document row NO se crea
```

Objeto tardío/orphan nunca se acepta como documento válido.

Signed READ Admin sí usa 900s reales.

---

## 18. TESTS OBLIGATORIOS NUEVOS

### MFA / role

```text
AAL1 queue -> 403
AAL1 detail -> 403
AAL1 signed read -> 403
AAL1 approve -> 403
AAL1 reject -> 403
factor enrolled + token AAL1 -> 403
AAL2 token -> success
profile role none + metadata admin -> 403
profile role none + email contiene admin/agent -> 403
```

### Fake-data defense

```text
nonexistent driver detail -> 404
driver no vehicle -> []
driver no docs -> []
nonexistent document signed read -> 404
no payload contains fake LIC/NID/Yamaha/mock token
```

### Storage

```text
authorization sin object -> UPLOAD_UNVERIFIED
wrong actual MIME -> denied
actual size > authorization -> denied
expired auth + object -> EXPIRED_UPLOAD_REF
other driver upload_id -> 403
active duplicate -> DOCUMENT_ALREADY_SUBMITTED
historical rejected row ID remains rejected
```

### Verification state

```text
approve missing driver -> 404
historical rejected docs alone do not satisfy dossier
approve complete -> VERIFIED + ACTIVE + OFFLINE
reject -> REJECTED + REGISTERED
reject VERIFIED driver -> denied
```

### Business / idempotency

```text
owner 0 locations -> onboarding
no default coordinates
expired idempotency key reusable after 24h semantics
same action retry uses same UUID
same-body concurrency
different-body -> 422
```

---

## 19. FROZEN EXPO CORE PATCHES

Restaurar overrides aprobados F2:

```text
expo              ~57.0.14
expo-asset        ~57.0.12
expo-constants    ~57.0.12
expo-linking      ~57.0.6
expo-router       ~57.0.14
expo-secure-store ~57.0.1
expo-status-bar   ~57.0.1
```

Mantener `expo-document-picker` y `expo-crypto` compatibles con SDK 57.

No actualizar core Expo por F3.
Regenerar lockfile con pnpm, nunca editarlo manualmente.

---

## 20. CI / DB

Preservar 5 jobs.

Fresh reset obligatorio:

```text
3 Foundation migrations
F3 original
F3 v1.2
F3 v1.3
```

Desde cero.

Debe quedar:

```text
Foundation: 60/60
F2 Auth: 14/14
F3 pgTAP: PASS (puede crecer >42)
F3 HTTP: PASS (debe crecer >24)
DB Types Drift: 0
Mobile Expo Doctor/Install/Metro: PASS
```

No bajar tests para obtener verde.

---

## 21. NO FASE 4

NO implementar Quote Engine ni fases posteriores.

---

## 22. REPORTE FINAL OBLIGATORIO

```text
Branch:
Base SHA:
Final SHA:
GitHub Actions Run URL:

Jobs:
  Quality:
  Mobile:
  Foundation DB:
  F2 Auth:
  F3 Onboarding:

Unit tests/pass/fail:
Foundation: 60/60
F3 pgTAP tests/pass/fail:
F2 Auth: 14/14 fail 0
F3 HTTP tests/pass/fail:
DB Types Drift:

Admin Security:
  role source public.profiles only:
  metadata/email fallback: NO
  factor-based AAL elevation: NO
  AAL1 queue/detail/read/approve/reject denied:
  AAL2 real:

Data Integrity:
  fake driver creation: NO
  fake detail objects: NO
  mock signed URL: NO

Documents:
  picker real:
  size/MIME fallback: NO
  real storage metadata verified:
  client size/MIME trusted: NO
  active delete in commit: NO
  historical rejected immutable:
  approve current dossier only:
  presence OFFLINE:

Business:
  authorizedLocationIds real:
  resumable wizard:
  hardcoded default coordinates: NO

Idempotency:
  UUID-v4:
  atomic:
  expiry enforced:
  TTL 24h:
  same-action retry same key:
  mismatch 422:

Storage:
  direct write bypass: NO
  provider signed upload lifetime documented: 2h
  Güegüense acceptance window: 15m
  signed read TTL: 900s

Versions:
  frozen Expo core restored:
  Expo Doctor PASS:

Scope:
  Foundation migrations changed: NO
  F4 implemented: NO
  F3 merged main: NO
```

Última línea EXACTA:

```text
FASE 3 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENERSE.

---

# PROMPT OPERATIVO DEL AGENTE

Lee COMPLETAMENTE este archivo.

Trabaja SOLO en:

```text
phase/3-onboarding-b2b-drivers
```

Base exacta:

```text
530ee3068af7504284fe6a20c6fe02d6edb6489d
```

Corrige SOLO v1.3.

Prioridad:

```text
1. cerrar bypass AAL2
2. role solo public.profiles
3. eliminar metadata/email role fallback
4. eliminar fake driver/data/mock URLs
5. commit document verifica Storage real
6. no borrar activos
7. histórico REJECTED/EXPIRED inmutable
8. approve -> VERIFIED+ACTIVE+OFFLINE
9. reject -> REJECTED+REGISTERED
10. picker metadata fail-closed
11. quitar coordenadas default Managua
12. Admin UI detail + signed read
13. idempotency expiry real
14. retry reutiliza misma UUID
15. restaurar core Expo congelado
16. ampliar tests para reproducir cada defecto
```

IMPORTANTE:

```text
Supabase createSignedUploadUrl = provider lifetime 2h.
NO falsees 15m.
Güegüense acceptance/commit authorization = 15m.
Admin signed read = 900s.
```

Mantén Foundation 60/60, F2 Auth 14/14, 5 jobs, CLI 2.110.0, Drift 0.

NO merge main.
NO F4.

Push SOLO la rama F3, espera Actions, entrega SHA + run + reporte.
Luego DETENTE.

# FIN — FASE 3 CIERRE DE SEGURIDAD v1.3
