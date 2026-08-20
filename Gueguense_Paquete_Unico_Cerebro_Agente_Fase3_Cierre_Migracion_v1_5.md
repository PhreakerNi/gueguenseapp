# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE

# FASE 3 — CIERRE DE MIGRACIÓN Y DATA-MINIMIZATION v1.5

**Repositorio:** `https://github.com/PhreakerNi/gueguenseapp`  
**Rama:** `phase/3-onboarding-b2b-drivers`  
**SHA base auditado:** `7fcdff8cff87633f9781b3520550487f58d26322`  
**Run auditado:** `32409264816`

**Estado:** FASE 3 NO APROBADA TODAVÍA.  
**Fase 4:** NO AUTORIZADA.  
**Merge F3 → main:** NO AUTORIZADO.

---

## 1. Dictamen del Cerebro

La v1.4 corrigió la mayoría de los bloqueadores. Auditoría directa:

```text
Branch HEAD == tested SHA: YES
5/5 jobs: SUCCESS
Supabase CLI: 2.110.0
Foundation pgTAP: 60/60
F3 pgTAP: 61/61
Total pgTAP: 121/121
F2 Auth: 14/14, fail 0
F3 HTTP: 41/41, fail 0
DB Types Drift: 0
```

No se aprueba F3 por tres defectos concretos:

1. Se reescribió `20260820000001_phase3_security_closure_v1_3.sql`.
   La corrección debía ser una migración nueva aditiva. Fresh CI no detecta
   el problema de upgrade desde un entorno que ya aplicó v1.3.
2. La queue backend todavía devuelve `national_id_number` y `license_number`
   aunque Admin Web ya no los renderiza.
3. `api-v1` todavía expone `err.message` / mensajes de DB en respuestas 500.

---

## 2. Base Git exacta

```bash
git fetch origin
git checkout phase/3-onboarding-b2b-drivers
git pull --ff-only origin phase/3-onboarding-b2b-drivers
git rev-parse HEAD
```

Debe ser:

```text
7fcdff8cff87633f9781b3520550487f58d26322
```

Si no coincide: DETENERSE.

No rebase. No force push. No merge a main. No F4.

---

## 3. Restaurar inmutabilidad de migraciones

Restaurar EXACTAMENTE:

```text
supabase/migrations/20260820000001_phase3_security_closure_v1_3.sql
```

a su contenido en:

```text
62e4fda22e236177160397374904e2f34019f5a9
```

Método recomendado:

```bash
git show 62e4fda22e236177160397374904e2f34019f5a9:supabase/migrations/20260820000001_phase3_security_closure_v1_3.sql   > supabase/migrations/20260820000001_phase3_security_closure_v1_3.sql
```

Crear NUEVA migración aditiva:

```text
supabase/migrations/20260820000002_phase3_security_microclosure_v1_4.sql
```

Debe transformar la v1.3 original al schema correcto actual. Incluir allí,
según el diff real v1.3→v1.4:

- correcciones necesarias de constraint documental;
- `admin_verify_driver`:
  - REJECT solo PENDING/UNDER_REVIEW + REGISTERED;
  - REJECTED/VERIFIED/EXPIRED => INVALID_STATE;
  - APPROVE exige `driver_presence` existente;
  - APPROVE nunca INSERT/UPSERT presence;
  - UPDATE presence => OFFLINE;
- helpers RPC corregidos;
- `authorize_driver_document_upload` si aplica;
- todos los REVOKE de PUBLIC/anon/authenticated;
- GRANT únicamente `service_role` para RPC sensibles;
- cualquier otro DDL que hoy solo existe porque se reescribió v1.3.

Usar como fuente:

```bash
git diff 62e4fda22e236177160397374904e2f34019f5a9   7fcdff8cff87633f9781b3520550487f58d26322   -- supabase/migrations/20260820000001_phase3_security_closure_v1_3.sql
```

No modificar ninguna Foundation migration.

---

## 4. Guard CI de inmutabilidad

Agregar una compuerta reproducible para garantizar que v1.3 nunca vuelva a
cambiar. Opción recomendada:

```bash
git fetch --depth=1 origin 62e4fda22e236177160397374904e2f34019f5a9
git diff --exit-code   62e4fda22e236177160397374904e2f34019f5a9   -- supabase/migrations/20260820000001_phase3_security_closure_v1_3.sql
```

También puede usarse checksum SHA-256 congelado del archivo original.

---

## 5. Probar migración forward

No basta `supabase db reset`.

CI debe demostrar:

```text
v1.3 original -> aplicar 20260820000002...v1_4.sql -> PASS
```

Flujo recomendado con CLI 2.110.0:

```bash
mv supabase/migrations/20260820000002_phase3_security_microclosure_v1_4.sql /tmp/
pnpm supabase:reset
mv /tmp/20260820000002_phase3_security_microclosure_v1_4.sql supabase/migrations/
pnpm supabase migration up --local
```

Primero comprobar sintaxis exacta con:

```bash
pnpm supabase migration up --help
```

No actualizar Supabase CLI.

Tras upgrade verificar:

- authenticated no ejecuta RPC sensibles;
- service_role sí;
- re-reject REJECTED falla;
- missing presence approve falla;
- queue no contiene PII.

Luego hacer el fresh reset normal.

---

## 6. Queue API sin PII

`public.get_admin_driver_verification_queue()` debe devolver únicamente:

```text
id
verification_status
account_status
created_at
```

NO:

```text
national_id_number
license_number
```

El Detail conserva esos campos.

En `supabase/functions/api-v1/index.ts`, el fallback de queue debe seleccionar:

```text
id, verification_status, account_status, created_at
```

Tests obligatorios sobre JSON RAW:

```text
GET /admin/verifications/drivers -> 200
cada item NO tiene national_id_number
cada item NO tiene license_number
```

Y test del RPC vía service_role con la misma garantía.

No basta que la UI no lo renderice.

---

## 7. Higiene de errores 500

El catch general NO puede responder:

```ts
err?.message;
```

Debe responder un mensaje fijo:

```text
INTERNAL_SERVER_ERROR
An unexpected server error occurred
500
```

Errores DB/provider con status 500 tampoco deben devolver `.message`.

Ejemplo:

```text
DATABASE_ERROR
Database operation failed
500
```

Revisar todas las respuestas 500 de `api-v1`.

Se permite logging interno sanitizado, pero nunca:

- Authorization header;
- JWT;
- service-role key;
- signed URL;
- tokens;
- secretos.

Los errores de dominio 4xx normalizados pueden conservar mensajes públicos.

---

## 8. Preservar todo lo correcto de v1.4

No reabrir:

- RPC service_role-only;
- AAL2 current JWT;
- role desde `public.profiles`;
- Reject state machine;
- approve sin crear `driver_presence`;
- storage real;
- signed-read server bridge;
- queue UI solo “Ver Expediente”;
- dossier Admin approve/reject;
- env fail-closed;
- Driver stable idempotency;
- Expo overrides congelados;
- Foundation 60/60;
- F2 Auth 14/14;
- DB drift 0.

---

## 9. No Fase 4

Prohibido implementar Quote Engine o cualquier fase posterior.

---

## 10. CI final

Mantener 5 jobs.

Debe quedar:

```text
Quality PASS
Mobile PASS
Foundation DB PASS
F2 Auth PASS
F3 Integration PASS

Foundation pgTAP = 60/60
F3 pgTAP >= 61, fail 0
F2 Auth = 14/14, fail 0
F3 HTTP >= 41, fail 0
DB Types Drift = 0
Supabase CLI = 2.110.0
```

Fresh reset debe mostrar:

```text
20260811000001_foundation_extensions_schema.sql
20260811000002_foundation_identity_business.sql
20260811000003_foundation_driver.sql
20260819000001_phase3_onboarding_and_verification.sql
20260819000002_phase3_closure_v1_2.sql
20260820000001_phase3_security_closure_v1_3.sql
20260820000002_phase3_security_microclosure_v1_4.sql
```

---

## 11. Reporte final obligatorio

```text
Branch:
Base SHA:
Final SHA:
GitHub Actions Run URL:

Branch HEAD == tested SHA:

Migration immutability:
  v1.3 restored exactly to SHA 62e4fda:
  v1.4 additive migration created:
  v1.4 migration filename:
  forward migration v1.3 -> v1.4 PASS:
  fresh reset applies v1.4:

Jobs:
  Quality:
  Mobile:
  Foundation DB:
  F2 Auth:
  F3 Onboarding:

Foundation pgTAP:
  tests: 60
  pass: 60
  fail: 0

F3 pgTAP:
  tests:
  pass:
  fail:

F2 Auth:
  tests: 14
  pass: 14
  fail: 0

F3 HTTP:
  tests:
  pass:
  fail:

Queue data minimization:
  raw RPC national_id_number present: NO
  raw RPC license_number present: NO
  raw Edge national_id_number present: NO
  raw Edge license_number present: NO

500 error hygiene:
  catch general exposes err.message: NO
  database 500 exposes provider message: NO
  app code logs tokens/secrets/signed URLs: NO

RPC boundary:
  PUBLIC: DENIED
  anon: DENIED
  authenticated: DENIED
  service_role required RPCs: YES

DB Types Drift:

Scope:
  Foundation migrations changed: NO
  old F3 migrations rewritten: NO
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

Lee COMPLETAMENTE este archivo y ejecútalo literalmente.

Trabaja SOLO en `phase/3-onboarding-b2b-drivers`.
Base exacta: `7fcdff8cff87633f9781b3520550487f58d26322`.

Objetivos únicos:

1. restaurar v1.3 exacta al SHA `62e4fda...`;
2. crear migración aditiva `20260820000002_phase3_security_microclosure_v1_4.sql`;
3. probar upgrade forward;
4. quitar cédula/licencia del JSON RAW de la queue RPC y Edge;
5. eliminar exposición de mensajes internos en respuestas 500.

NO merge a main. NO F4. NO rebase. NO force push.

Preserva todo lo ya correcto en v1.4.

Al terminar ejecuta los 5 gates, verifica logs reales, entrega SHA final y Run
URL en el formato de este archivo.

Última línea EXACTA:

FASE 3 — EN REVISIÓN / CANDIDATA A APROBACIÓN

Después DETENTE.
