# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CORRECCIÓN v1.4

**Tipo:** Auditoría final focalizada + prompt de ejecución  
**Base auditada:** `gueguenseapp-phase-1-foundation(2).zip`  
**Estado:** ❌ FASE 1 TODAVÍA NO APROBADA  
**Objetivo:** cerrar únicamente los bloqueos comprobados de Fase 1.  
**Regla:** NO iniciar Fase 2. NO mergear a `main`. NO reabrir arquitectura aprobada.

---

# PARTE A — VEREDICTO DEL CEREBRO

La v1.3 sí resolvió varios puntos y NO deben tocarse innecesariamente:

```text
PASS — Expo SDK 57 / React Native 0.86.2 / React 19.2.3
PASS — expo.install.exclude eliminado
PASS — CI ya contiene expo install --check para Business y Driver
PASS — expo-doctor declarado
PASS — database.generated.ts contiene 9/9 tablas Foundation
PASS — pgTAP plan(44) coincide estáticamente con 44 assertions
PASS — throws_ok de driver_documents usa ya firma de 4 argumentos
PASS — tests de owner/employee/location fueron añadidos parcialmente
PASS — profiles/driver_documents/driver_presence siguen deny-by-default
PASS — caches .turbo/.next/.expo/node_modules = 0
PASS — un único pnpm-lock.yaml
PASS — Node 24.18.0
PASS — README/Roadmap apuntan a v1.3
```

No obstante, existen BLOQUEOS REALES que impiden ejecutar/aprobar la Fase 1.

---

# 1. BLOQUEO CRÍTICO — TOOLCHAIN CONTIENE VERSIONES NO STABLE/NO VERIFICADAS

El repositorio actual declara:

```text
pnpm                11.21.0
Next.js             16.3.0
eslint-config-next  16.3.0
@next/eslint-plugin-next 16.3.0
Supabase CLI        2.113.0
Turbo               2.10.9
Expo Doctor         1.20.1
```

El Cerebro volvió a verificar el registry público durante esta auditoría.

Versiones publicadas y verificables que se CONGELAN para este cierre:

```text
Node.js             24.18.0
pnpm                11.17.0
Next.js             16.2.12
eslint-config-next  16.2.12
Supabase CLI        2.110.0
Turbo               2.10.7
Expo Doctor         1.20.1
React               19.2.3
React Native        0.86.2
Expo SDK            57
TypeScript          5.8.2  (mantener si Expo check pasa)
```

No usar números “más nuevos” en esta ronda.

La finalidad de esta congelación es evitar otra discrepancia entre fecha, cache, registry y lockfile.

## Corrección exacta

### Root `package.json`

Usar exactamente:

```json
"packageManager": "pnpm@11.17.0"
```

y:

```text
turbo       2.10.7
supabase    2.110.0
expo-doctor 1.20.1
typescript  5.8.2
```

sin `^` ni `~` para esas herramientas.

### Web apps

En:

```text
apps/admin-web/package.json
apps/tracking-web/package.json
```

usar:

```text
next               16.2.12
eslint-config-next 16.2.12
```

Si se mantiene como dependencia directa:

```text
@next/eslint-plugin-next
```

debe ser también:

```text
16.2.12
```

Alternativamente puede eliminarse como dependencia directa y usar
`eslint-config-next`, que ya lo integra.

NO usar:

```text
16.3.0
preview
canary
beta
rc
```

---

# 2. REGENERAR LOCKFILE DESDE REGISTRY REAL

Después de corregir manifests:

```bash
rm pnpm-lock.yaml
corepack prepare pnpm@11.17.0 --activate
pnpm --version
pnpm install
```

Debe mostrar:

```text
pnpm --version
11.17.0
```

Luego:

```bash
pnpm install --frozen-lockfile
```

Debe pasar.

NO editar `pnpm-lock.yaml` a mano.

## Comprobación limpia

Usar un clon/directorio temporal limpio y ejecutar:

```bash
pnpm install --frozen-lockfile
```

Resultado requerido:

```text
Clean frozen install: PASS
```

## CI

Cambiar en los tres jobs:

```text
pnpm/action-setup
11.21.0
```

por:

```text
11.17.0
```

---

# 3. NEXT.JS / ESLINT — NO ABRIR OTRO REDISEÑO

El patrón actual con plugin directo puede mantenerse si:

```text
Next.js = 16.2.12
@next/eslint-plugin-next = 16.2.12
eslint-config-next = 16.2.12
lint = PASS
warning "Next.js plugin was not detected" = 0
```

También se permite simplificar a:

```text
eslint-config-next/core-web-vitals
eslint-config-next/typescript
```

No hacer más cambios si el lint real pasa.

Gates:

```bash
pnpm --filter @gueguense/admin-web lint
pnpm --filter @gueguense/tracking-web lint
```

---

# 4. BLOQUEO CRÍTICO — UUIDs INVÁLIDOS EN pgTAP

El archivo:

```text
supabase/tests/database/01_foundation_rls.test.sql
```

contiene IDs usados en columnas UUID que NO son UUID válidos:

```text
loc11111-1111-1111-1111-111111111111
loc22222-2222-2222-2222-222222222222
loc33333-3333-3333-3333-333333333333
bml11111-1111-1111-1111-111111111111
```

`l`, `o`, `c`, `m` no son caracteres hexadecimales válidos para un UUID.

Esto hace que la suite pueda fallar ANTES de llegar a las assertions.

## Corrección

Reemplazar por UUIDs sintéticos válidos.

Ejemplo permitido:

```text
Location A1:
a1000000-0000-4000-8000-000000000001

Location A2:
a1000000-0000-4000-8000-000000000002

Location B1:
b1000000-0000-4000-8000-000000000001

BML Employee A → Location A1:
c1000000-0000-4000-8000-000000000001
```

Actualizar TODAS las referencias correspondientes en la suite.

Después:

```text
UUID fixture parse errors: 0
```

---

# 5. pgTAP — PLAN YA COINCIDE, PERO DEBE CAMBIAR AL AGREGAR LOS TESTS FALTANTES

Estado auditado:

```text
plan declarado: 44
assertions contadas estáticamente: 44
```

Ese problema de v1.3 quedó corregido.

NO cambiar `plan(44)` por capricho.

Sin embargo, los tests faltantes de esta v1.4 aumentarán el número.

Al terminar:

```text
plan(N) = assertions reales N
```

y:

```bash
pnpm supabase:test
```

debe pasar.

---

# 6. TEST FALTANTE — TRIGGER auth.users → profiles

La suite crea usuarios en:

```text
auth.users
```

y luego usa sus profiles, pero no contiene una assertion explícita que documente el contrato del trigger.

Agregar al menos una prueba directa:

```text
INSERT auth.users
→ public.profiles contiene exactamente ese id
```

Preferentemente para uno de los fixtures ya existentes.

Resultado requerido:

```text
Auth profile bootstrap trigger: PASS
```

---

# 7. TESTS FALTANTES — business_member_locations

Actualmente se INSERTA una asignación N:M, pero no se consulta directamente:

```text
public.business_member_locations
```

bajo RLS.

Agregar fixtures y tests.

Debe probarse como mínimo:

```text
Owner A puede leer asignaciones de Business A según policy.
Employee A puede leer la asignación autorizada de Business A.
Employee A no obtiene asignaciones de Business B.
Outsider B no obtiene asignaciones de Business A.
```

Crear, si hace falta, una asignación sintética de Business B para que el
cross-tenant denial no sea un test vacío sin dato objetivo.

Resultado:

```text
business_member_locations RLS behavior: PASS
```

---

# 8. TESTS FALTANTES — driver_documents own/cross read

La migration define:

```text
Driver puede SELECT solo sus propios documentos.
INSERT/UPDATE directo = DENY.
```

La suite actual solo prueba el INSERT denegado.

Crear mediante `postgres`:

```text
document_driver_a
document_driver_b
```

Después, como Driver A:

```text
Driver A lee document_driver_a       → ALLOWED
Driver A lee document_driver_b       → DENIED / 0 rows
Driver A INSERT VERIFIED directamente → DENIED
```

Resultado:

```text
Driver document own-read: PASS
Driver document cross-read: DENIED
Driver document direct insert: DENIED
```

---

# 9. TESTS FALTANTES — ESTADO PERSISTIDO DE DRIVER

Ya existen:

```text
verification_status UPDATE → 0 rows
account_status UPDATE      → 0 rows
```

Agregar comprobación privilegiada posterior:

```text
verification_status sigue PENDING
account_status sigue REGISTERED
```

Así se demuestra que no hubo modificación lateral.

Resultado:

```text
Driver verification persistence: PASS
Driver account persistence: PASS
```

---

# 10. TEST FALTANTE — PRIVATE SCHEMA DIRECT ACCESS

La suite actual verifica:

```text
schema_privs_are('private', 'authenticated', [])
```

Eso es útil, pero la v1.3 exigía también comportamiento real.

Como `authenticated`, intentar acceso/invocación directa al helper privado.

Debe resultar denegado según el diseño final, SIN romper las policies que
internamente usan esos helpers.

Debe quedar demostrado simultáneamente:

```text
Business policies using private helper: PASS
Location policies using private helper: PASS
Direct client private helper/schema access: DENIED
```

No conceder `USAGE` global al schema privado para hacer pasar la prueba.

---

# 11. business_members — MEJORAR ASSERTION DE SCOPE

Actualmente existe:

```text
lives_ok(SELECT ... business_members ...)
```

Eso demuestra ausencia de excepción/recursión, pero no demuestra el contenido
retornado.

Mantener `lives_ok` y agregar un resultado que pruebe tenancy:

```text
Owner A obtiene miembros de Business A
Owner A NO obtiene miembro de Business B
```

Resultado:

```text
business_members recursion: NONE
business_members cross-tenant leak: 0
```

---

# 12. CROSS-BUSINESS BIDIRECCIONAL

Actualmente Owner A no ve Business B.

Agregar también:

```text
Owner B / Outsider B no ve Business A
```

para cerrar el test en ambos sentidos.

---

# 13. DB TYPES — 9/9 STATIC PASS, REGENERAR CON CLI REAL

El archivo actual contiene estáticamente las 9 tablas Foundation:

```text
profiles
businesses
business_members
business_locations
business_member_locations
drivers
driver_documents
vehicles
driver_presence
```

Esto ya es PASS.

Pero como el repo usa una versión de Supabase CLI no verificada, hay que
demostrar que ese archivo realmente sale del schema.

Después de cambiar a:

```text
Supabase CLI 2.110.0
```

ejecutar:

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

Si el CLI modifica el archivo, COMMITTEAR la salida real y repetir.

Resultado:

```text
Foundation DB types: 9/9
Generated types drift: 0
```

No editar generated types manualmente.

---

# 14. EXPO — LOS CAMBIOS v1.3 YA ESTÁN EN CI

No reabrir estas decisiones.

El CI ya contiene:

```text
expo config
expo install --check
expo-doctor
expo export --platform android
```

para ambas apps.

Mantenerlos.

Ejecutar realmente:

```bash
pnpm --filter @gueguense/business-mobile exec expo install --check
pnpm exec expo-doctor apps/business-mobile
pnpm --filter @gueguense/business-mobile exec expo export --platform android --output-dir .expo/android-export

pnpm --filter @gueguense/driver-mobile exec expo install --check
pnpm exec expo-doctor apps/driver-mobile
pnpm --filter @gueguense/driver-mobile exec expo export --platform android --output-dir .expo/android-export
```

No agregar `expo.install.exclude`.

---

# 15. README / ROADMAP

Actualizar únicamente la matrix de versiones.

Debe quedar:

```text
Node.js             24.18.0
pnpm                11.17.0
Turbo               2.10.7
TypeScript          5.8.2
Expo SDK            57
React Native        0.86.2
React               19.2.3
Next.js             16.2.12
eslint-config-next  16.2.12
Supabase CLI        2.110.0
Expo Doctor         1.20.1
```

Cambiar directiva vigente a:

```text
Gueguense_Paquete_Unico_Cerebro_Agente_Fase1_Correccion_v1_4.md
```

Fase 1 continúa:

```text
🟡 EN REVISIÓN / CANDIDATA A APROBACIÓN
```

NO marcarla aprobada.

---

# 16. QUALITY GATES FINALES

Ejecutar:

```bash
node --version
pnpm --version
pnpm turbo --version
pnpm supabase --version

pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Móvil:

```bash
pnpm --filter @gueguense/business-mobile exec expo config
pnpm --filter @gueguense/business-mobile exec expo install --check
pnpm exec expo-doctor apps/business-mobile
pnpm --filter @gueguense/business-mobile exec expo export --platform android --output-dir .expo/android-export

pnpm --filter @gueguense/driver-mobile exec expo config
pnpm --filter @gueguense/driver-mobile exec expo install --check
pnpm exec expo-doctor apps/driver-mobile
pnpm --filter @gueguense/driver-mobile exec expo export --platform android --output-dir .expo/android-export
```

DB:

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
pnpm supabase:stop
```

Si un gate no se ejecutó:

```text
NOT_EXECUTED / BLOCKED
```

NO reportarlo como PASS.

---

# 17. HYGIENE

Debe conservarse:

```text
Tracked .turbo:       0
Tracked .next:        0
Tracked .expo:        0
Tracked node_modules: 0
Nested lockfiles:     0
Direct prereleases:   0
Real secrets:         0
```

---

# 18. PROHIBIDO

NO implementar:

```text
Fase 2
Auth UI
Onboarding funcional
Dispatch
Delivery
OTP
Tracking live
GPS productivo
Pricing
Ledger
Payments
Payouts
Push
Admin dashboard real
```

NO merge a `main`.

Permanecer en:

```text
phase/1-foundation
```

---

# 19. DEFINITION OF DONE v1.4

La siguiente auditoría del Cerebro será BINARIA sobre este checklist.

- [ ] pnpm = 11.17.0 exacto.
- [ ] Turbo = 2.10.7 exacto.
- [ ] Supabase CLI = 2.110.0 exacto.
- [ ] Next = 16.2.12 exacto en ambas webs.
- [ ] eslint-config-next = 16.2.12.
- [ ] pnpm-lock regenerado desde registry.
- [ ] clean frozen install pasa.
- [ ] CI usa pnpm 11.17.0.
- [ ] Next lint pasa.
- [ ] Expo checks pasan en ambas apps.
- [ ] No expo.install.exclude.
- [ ] UUID fixture inválidos = 0.
- [ ] pgTAP plan = assertions reales.
- [ ] `supabase db reset` pasa.
- [ ] `supabase test db` pasa.
- [ ] auth.users → profiles trigger probado.
- [ ] Profile own/cross y privilege escalation pasan.
- [ ] Business cross-tenant bidireccional probado.
- [ ] business_members no recursión + scope probado.
- [ ] business_member_locations RLS probado.
- [ ] Owner/Employee location N:M probado.
- [ ] Driver self/cross read probado.
- [ ] Driver verification/account persistence probada.
- [ ] Driver document own/cross read probado.
- [ ] Driver document direct insert denegado.
- [ ] Driver presence 3 updates denegados.
- [ ] Private helpers funcionan dentro de policies.
- [ ] Private direct access denegado.
- [ ] DB types = 9/9.
- [ ] Generated types drift = 0.
- [ ] Quality gates pasan.
- [ ] tracked caches = 0.
- [ ] nested lockfiles = 0.
- [ ] real secrets = 0.
- [ ] README/Roadmap usan matrix v1.4.
- [ ] Fase 2 no iniciada.
- [ ] No merge a main.

Si todo lo anterior pasa y no aparece una vulnerabilidad crítica real:

```text
✅ FASE 1 APROBADA
```

No abrir una v1.5 por mejoras opcionales.

---

# PARTE B — PROMPT OPERATIVO PARA EL AGENTE

Eres el Agente Senior de Ejecución de Güegüense.

El Cerebro auditó directamente `gueguenseapp-phase-1-foundation(2).zip`.

Debes aplicar exclusivamente esta v1.4.

## Orden obligatorio

1. Permanecer en `phase/1-foundation`.
2. Corregir versiones EXACTAS congeladas en este documento.
3. Regenerar el lockfile desde registry real.
4. Ejecutar clean frozen install.
5. Corregir los UUID inválidos del pgTAP.
6. Añadir únicamente los tests RLS faltantes indicados.
7. Ajustar `plan(N)` al número real final.
8. Ejecutar `supabase db reset`.
9. Ejecutar `supabase test db`.
10. Regenerar tipos con Supabase CLI 2.110.0.
11. Comprobar generated types drift = 0.
12. Ejecutar Expo gates.
13. Ejecutar lint/typecheck/test/build.
14. Actualizar README/Roadmap.
15. Ejecutar hygiene/secret scan.
16. Push SOLO a `phase/1-foundation`.
17. DETENERSE.

No cambies arquitectura.
No empieces Fase 2.

---

# REPORTE FINAL DEL AGENTE

Entregar:

## A. Branch / HEAD

```text
branch:
HEAD:
```

## B. Version Matrix

```text
Node:
pnpm:
Turbo:
TypeScript:
Expo:
React Native:
React:
Expo Router:
Next admin:
Next tracking:
eslint-config-next:
Supabase CLI:
Expo Doctor:
```

## C. Install

```text
Lockfile regenerated: YES/NO
Clean frozen install: PASS/FAIL
Direct prereleases: N
```

## D. pgTAP

```text
Invalid UUID fixtures: 0
Plan:
Assertions:
Plan mismatch: 0
supabase db reset:
supabase test db:
```

## E. Security

```text
Profile role escalation:
Business cross-tenant A→B:
Business cross-tenant B→A:
business_members recursion:
business_member_locations cross-tenant:
Employee unassigned location:
Driver cross-user:
Driver verification change:
Driver account change:
Driver document own-read:
Driver document cross-read:
Driver document insert:
Driver current_location update:
Driver location_updated_at update:
Driver operational_state update:
Private helper via policy:
Private direct access:
```

## F. DB Types

```text
Foundation tables: 9/9
Generated drift: 0
```

## G. Gates

Tabla:

```text
Command | Exit Code | PASS/FAIL/NOT_EXECUTED/BLOCKED
```

## H. Hygiene

```text
Tracked caches:
Nested lockfiles:
Real secrets:
```

## I. Estado

Terminar exactamente:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENERSE.

---

# FIN — FASE 1 CORRECCIÓN v1.4
