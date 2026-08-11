# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CORRECCIÓN v1.3

**Tipo:** Auditoría del repositorio real + corrección final focalizada  
**Base auditada:** `gueguenseapp-phase-1-foundation(1).zip`  
**Fase:** FASE 1 — FUNDACIÓN Y ESTRUCTURA CORE  
**Estado:** ❌ FASE 1 NO APROBADA — BLOQUEOS CONCRETOS  
**Regla principal:** NO comenzar Fase 2. NO mergear a `main`. NO rediseñar lo que ya pasó.

---

# 0. RESULTADO EJECUTIVO DEL CEREBRO

La v1.2 avanzó de forma importante y NO se deben reabrir decisiones ya corregidas.

## PASS confirmados estáticamente en el ZIP

```text
Node files: 24.18.0
Expo SDK: 57
React Native: 0.86.2
React: 19.2.3
Expo Doctor declarado: 1.20.1
Foundation DB Types: 9/9 tablas presentes
Tracked .turbo: 0
Tracked .next: 0
Tracked .expo: 0
Tracked node_modules: 0
Nested pnpm-lock.yaml: 0 (solo root)
profiles UPDATE directo: sin policy
drivers UPDATE directo: sin policy
driver_documents INSERT/UPDATE directo: sin policy
driver_presence UPDATE directo: sin policy
business_members policy: ya no se auto-consulta recursivamente de forma directa
private helpers: SECURITY DEFINER + search_path=''
Mobile strict TS flags: presentes
Admin Supabase browser/server factories: presentes
Tracking Web Supabase directo: ausente
CI DB: start → reset → test → db:types → drift → stop
```

## FAIL / BLOCKED restantes

```text
CRÍTICO — toolchain/lockfile contiene versiones que no están respaldadas
          por el registry estable verificable.

CRÍTICO — la suite pgTAP tiene plan(28) pero contiene 30 assertions.

CRÍTICO — los throws_ok() de seguridad usan incorrectamente el segundo
          argumento como si fuera descripción.

CRÍTICO — la suite RLS sigue sin cubrir location scope N:M y varios
          negative tests exigidos.

ALTO    — CI móvil NO ejecuta expo install --check.

ALTO    — ambas apps esconden TypeScript mediante expo.install.exclude.

ALTO    — Next está fijado en 16.3.0 aunque el registry verificable
          expone 16.3.0 como preview/canary, no stable.

MEDIO   — README sigue documentando toolchain anterior y directiva v1.1.
```

Esta ronda NO añade nuevas features ni nuevos debates arquitectónicos.
Corrige exclusivamente estos puntos.

---

# 1. BLOQUEO CRÍTICO — VERSIONES REALES Y LOCKFILE REPRODUCIBLE

## 1.1 Estado encontrado

El ZIP contiene:

```text
packageManager: pnpm@11.21.0
turbo: 2.10.9
supabase: 2.113.0
next: 16.3.0
eslint-config-next: 16.3.0
@next/eslint-plugin-next: 16.3.0
expo-doctor: 1.20.1
```

y el `pnpm-lock.yaml` contiene resoluciones/integrities para esas versiones.

El problema es que el registry público estable verificable por el Cerebro
no respalda varias de esas versiones como releases stable.

NO se acepta un lockfile que simplemente "parece válido".

## 1.2 Fuente de verdad obligatoria para el Agente

ANTES de editar manifests, ejecutar en terminal:

```bash
npm view pnpm dist-tags --json
npm view next dist-tags --json
npm view supabase dist-tags --json
npm view turbo dist-tags --json
npm view expo-doctor dist-tags --json
```

Para pnpm, la Fase 1 continúa en major 11.

Obtener explícitamente el tag de la línea 11, si existe:

```bash
npm view pnpm dist-tags.latest-11
```

Si ese tag no existe, consultar:

```bash
npm view pnpm versions --json
```

y seleccionar el mayor `11.x.y` ESTABLE publicado.

## 1.3 Validación anti-alucinación

Después de seleccionar cada versión exacta:

```bash
npm view pnpm@<VERSION> version
npm view next@<VERSION> version
npm view supabase@<VERSION> version
npm view turbo@<VERSION> version
npm view expo-doctor@<VERSION> version
```

Cada comando debe devolver EXACTAMENTE la versión solicitada.

Si devuelve 404/not found:

```text
NO usar esa versión.
```

No inventar releases basándose en la fecha actual.

## 1.4 Next.js

Debe ser:

```text
16.x stable
```

NO:

```text
preview
canary
beta
rc
```

La versión de:

```text
next
eslint-config-next
```

debe coincidir exactamente.

Si se mantiene `@next/eslint-plugin-next` de forma directa, debe coincidir
también exactamente.

## 1.5 Turbo

Usar el `latest` stable real del registry o una versión exacta stable
publicada y validada.

NO usar un número que solo existiría como futuro/canary.

## 1.6 Supabase CLI

Usar una versión stable real:

```bash
npm view supabase dist-tags.latest
npm view supabase@<VERSION> version
```

La versión en `package.json`, el lockfile, local y CI debe ser la misma.

## 1.7 Expo Doctor

`1.20.1` puede mantenerse únicamente si:

```bash
npm view expo-doctor@1.20.1 version
```

lo confirma en el entorno del agente.

## 1.8 Regeneración REAL del lockfile

Después de corregir manifests:

```bash
rm pnpm-lock.yaml
pnpm install
```

No editar `pnpm-lock.yaml` manualmente.

Después:

```bash
pnpm install --frozen-lockfile
```

debe pasar.

## 1.9 Verificación en clon limpio

Crear preferentemente un clon/directorio temporal limpio del branch.

Ejecutar:

```bash
pnpm install --frozen-lockfile
```

Resultado requerido:

```text
Clean frozen install: PASS
```

Este gate es obligatorio.

## 1.10 Pre-release scan

Buscar en dependencias DIRECTAS:

```text
-canary
-preview
-beta
-rc
-alpha
```

Resultado:

```text
Direct prerelease dependencies: 0
```

Una prerelease TRANSITIVA solo puede aceptarse si proviene legítimamente
de un paquete stable y el package manager la resolvió desde el registry;
debe reportarse si existe.

---

# 2. NEXT.JS ESLINT — USAR CONFIGURACIÓN OFICIAL

La configuración actual usa directamente `@next/eslint-plugin-next`.

Ese patrón puede ser válido, pero como ya existe `eslint-config-next`,
preferimos cerrar Fase 1 con el patrón oficial simple de Next 16.

En cada app:

```text
apps/admin-web/eslint.config.mjs
apps/tracking-web/eslint.config.mjs
```

usar:

```text
eslint-config-next/core-web-vitals
eslint-config-next/typescript
```

junto con los ignores necesarios.

No duplicar plugins/configs de manera que ESLint produzca conflictos.

Resultado:

```bash
pnpm --filter @gueguense/admin-web lint
pnpm --filter @gueguense/tracking-web lint
```

Debe pasar SIN:

```text
Next.js plugin was not detected
```

y sin conflictos de plugin redefinido.

Si por una incompatibilidad real del monorepo se mantiene el plugin directo,
documentar el motivo y eliminar dependencias redundantes.

---

# 3. EXPO — NO OCULTAR EL CHECK DE TYPESCRIPT

## 3.1 Problema encontrado

Ambas apps contienen:

```json
"expo": {
  "install": {
    "exclude": ["typescript"]
  }
}
```

La directiva v1.2 prohibía utilizar `expo.install.exclude` para esconder
incompatibilidades.

Eliminar esa exclusión.

## 3.2 Alinear con SDK 57

Mantener:

```text
Expo SDK 57
React Native 0.86.x
React 19.2.3
```

Después ejecutar en CADA app:

```bash
pnpm --dir apps/business-mobile exec expo install --fix
pnpm --dir apps/business-mobile exec expo install --check

pnpm --dir apps/driver-mobile exec expo install --fix
pnpm --dir apps/driver-mobile exec expo install --check
```

Si TypeScript queda marcado como incompatible:

1. NO volver a agregar `expo.install.exclude`.
2. Consultar el template oficial `default@sdk-57`.
3. Alinear la versión de TypeScript del workspace móvil con la versión
   recomendada por el template/Expo actual.
4. No cambiar TypeScript de TODO el monorepo salvo que sea necesario.
5. Ejecutar nuevamente `expo install --check`.

## 3.3 Expo Doctor

Ejecutar:

```bash
pnpm exec expo-doctor apps/business-mobile
pnpm exec expo-doctor apps/driver-mobile
```

## 3.4 Metro export

Ejecutar:

```bash
pnpm --dir apps/business-mobile exec expo export --platform android --output-dir .expo/android-export
pnpm --dir apps/driver-mobile exec expo export --platform android --output-dir .expo/android-export
```

Outputs no versionados.

## 3.5 CI

El job `mobile-gates` DEBE incluir explícitamente:

```bash
expo config
expo install --check
expo-doctor
expo export --platform android
```

para Business y Driver.

Actualmente falta `expo install --check`; corregirlo.

---

# 4. pgTAP — LA SUITE ACTUAL NO PUEDE PASAR

Archivo:

```text
supabase/tests/database/01_foundation_rls.test.sql
```

## 4.1 Error mecánico confirmado

El archivo declara:

```sql
SELECT plan(28);
```

pero el Cerebro contó:

```text
has_schema:         2
has_extension:      1
has_table:          9
rls_is_enabled:     9
schema_privs_are:   1
results_eq:         2
is_empty:           2
throws_ok:          4
----------------------
TOTAL ASSERTIONS:  30
```

Por tanto:

```text
plan declarado: 28
assertions:      30
```

Esto debe corregirse.

NO limitarse a cambiar 28 → 30 porque todavía faltan tests de seguridad.

Después de agregar todos los tests requeridos:

```text
plan(N) == número real de assertions
```

Comprobarlo mecánicamente.

---

# 5. pgTAP — throws_ok ESTÁ MAL UTILIZADO

Actualmente aparecen formas conceptualmente equivalentes a:

```sql
SELECT throws_ok(
  'UPDATE ...',
  'User A denied ...'
);
```

En pgTAP, el segundo argumento de la forma de dos argumentos es
`errmsg` o `errcode`, NO una mera descripción.

Por tanto esas pruebas no demuestran lo que dicen.

## 5.1 UPDATE denegado por RLS

Para UPDATE sin policy, Postgres/RLS puede simplemente afectar 0 filas
en vez de lanzar excepción.

NO usar `throws_ok()` como única prueba.

Usar un patrón de comportamiento, por ejemplo:

```sql
SELECT is_empty(
  'UPDATE public.profiles
     SET platform_role = ''super_admin''
   WHERE id = ''...''
   RETURNING id',
  'Normal user cannot update platform_role'
);
```

Luego, bajo rol privilegiado de test, comprobar además que el valor persistido
NO cambió.

Aplicar este principio a:

```text
profiles.platform_role
drivers.verification_status
drivers.account_status
driver_presence.current_location
driver_presence.location_updated_at
driver_presence.operational_state
```

## 5.2 INSERT que debe lanzar excepción

Para `driver_documents` direct INSERT, si el comportamiento real produce
RLS violation, usar una firma correcta de pgTAP.

Preferencia:

```sql
SELECT throws_ok(
  'INSERT ...',
  '42501',
  NULL,
  'Driver cannot directly insert driver_documents'
);
```

Si el SQLSTATE real del stack es diferente, usar el real y documentarlo.

## 5.3 Acceso directo a private schema

Para una operación que realmente debe lanzar `insufficient_privilege`,
usar también `throws_ok()` con firma correcta.

---

# 6. RLS BEHAVIORAL TESTS — COMPLETAR LOS CASOS YA EXIGIDOS

La suite v1.2 todavía NO contiene fixtures de:

```text
employee_a
location_a1
location_a2
location_b1
business_member_locations assignment
```

y no prueba todo el aislamiento Driver.

Crear los fixtures y tests que siguen.

## 6.1 Profiles

Probar:

```text
user_a puede leer profile_a
user_a NO lee profile_b
platform_role UPDATE afecta 0 filas
platform_role sigue en valor original
auth.users insert crea profile automáticamente
```

## 6.2 Business

Fixtures:

```text
owner_a    → business_a
employee_a → business_a
owner_b    → business_b
```

Probar:

```text
owner_a ve business_a
owner_a NO ve business_b
owner_b NO ve business_a
```

## 6.3 business_members

Ejecutar una consulta REAL como `owner_a`:

```text
SELECT ... FROM public.business_members
```

Debe:

```text
PASS sin infinite recursion
mostrar solo el scope autorizado
```

Incluir assertion `lives_ok` o results-based equivalente.

## 6.4 Location Scope N:M

Crear:

```text
location_a1 → business_a
location_a2 → business_a
location_b1 → business_b

employee_a asignado SOLO a location_a1
```

Probar:

```text
owner_a ve location_a1
owner_a ve location_a2

employee_a ve location_a1
employee_a NO ve location_a2
employee_a NO ve location_b1
```

También probar lectura apropiada de `business_member_locations`.

## 6.5 Drivers

Probar:

```text
driver_a ve driver_a
driver_a NO ve driver_b

driver_a verification_status UPDATE → 0 filas / valor sin cambio
driver_a account_status UPDATE      → 0 filas / valor sin cambio
```

## 6.6 Driver Documents

Crear un documento propio mediante rol privilegiado de fixture.

Probar:

```text
driver_a lee documento propio
driver_a NO lee documento de driver_b
driver_a direct INSERT = DENIED
driver_a no puede auto-crear VERIFIED
```

## 6.7 Driver Presence

Probar por separado:

```text
current_location UPDATE      → DENIED / 0 filas
location_updated_at UPDATE   → DENIED / 0 filas
operational_state UPDATE     → DENIED / 0 filas
```

No usar un único UPDATE de operational_state como sustituto de los tres.

## 6.8 Private helpers

Probar simultáneamente:

```text
Policies que usan private helpers funcionan desde authenticated: PASS
Direct client invocation/access to private schema: DENIED
No RLS recursion: PASS
```

NO dar `USAGE` global al schema `private` para arreglar un test.

---

# 7. AUTH CONTEXT DE LOS TESTS

Los tests deben correr con identidad autenticada real/simulada compatible
con Supabase local.

Puede usarse el mecanismo de claims soportado por el stack, siempre que:

```text
auth.uid() devuelva el UUID esperado
```

Agregar una assertion explícita al cambiar de fixture:

```text
auth.uid() == expected_fixture_user
```

al menos una vez por helper de autenticación utilizado.

No considerar un test RLS válido si `auth.uid()` queda NULL accidentalmente.

---

# 8. DATABASE GENERATED TYPES — 9/9 YA ESTÁN, AHORA PROBAR REPRODUCIBILIDAD

El archivo actual ya contiene las 9 tablas Foundation:

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

NO volver a reconstruirlo manualmente.

Después de:

```bash
pnpm supabase:start
pnpm supabase:reset
```

ejecutar:

```bash
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

Resultado obligatorio:

```text
Foundation tables generated: 9/9
Generated DB types drift: 0
```

Si `pnpm db:types` cambia el archivo, COMMITTEAR la salida REAL del CLI
y repetir hasta drift 0.

---

# 9. README / ROADMAP — ELIMINAR VERSIONES STALE

## 9.1 README actual

Todavía contiene referencias como:

```text
Directiva vigente: ...Fase1_Correccion_v1_1.md
pnpm@11.21.0
turbo@2.4.4
Supabase CLI 2.15.8
Expo Router v5 line
```

Esto ya no representa la rama.

Actualizar a:

```text
Directiva vigente: Fase1_Correccion_v1_3.md
```

y a las versiones REALES verificadas en registry/package manifests.

## 9.2 Roadmap

El Roadmap debe usar la misma matrix exacta.

NO escribir una versión que no haya sido confirmada por:

```bash
npm view <package>@<version> version
```

Para Expo Router documentar la versión real instalada (`57.x`) y no
"v5 line".

---

# 10. CI FINAL

## quality-gates

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## mobile-gates

Para AMBAS apps:

```text
expo config
expo install --check
expo-doctor
expo export --platform android
```

## database-gates

```text
pnpm install --frozen-lockfile
pnpm supabase --version
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
pnpm supabase:stop
```

`supabase:stop` con cleanup `if: always()`.

---

# 11. GATES LOCALES OBLIGATORIOS ANTES DE PUSH

Ejecutar y reportar:

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

pnpm --dir apps/business-mobile exec expo config
pnpm --dir apps/business-mobile exec expo install --check
pnpm exec expo-doctor apps/business-mobile
pnpm --dir apps/business-mobile exec expo export --platform android --output-dir .expo/android-export

pnpm --dir apps/driver-mobile exec expo config
pnpm --dir apps/driver-mobile exec expo install --check
pnpm exec expo-doctor apps/driver-mobile
pnpm --dir apps/driver-mobile exec expo export --platform android --output-dir .expo/android-export

pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
pnpm supabase:stop
```

Si Docker no existe:

```text
DB tests = BLOCKED_ENVIRONMENT
```

NO decir PASS.

Pero para solicitar aprobación formal de Fase 1, los DB tests deben
haber pasado en algún entorno reproducible, preferentemente CI.

---

# 12. HYGIENE

Mantener:

```text
Tracked .turbo = 0
Tracked .next = 0
Tracked .expo = 0
Tracked node_modules = 0
Nested lockfiles = 0
Real secrets = 0
```

Buscar:

```text
sb_secret_
service_role
sk_live_
sk_test_
ghp_
BEGIN PRIVATE KEY
BEGIN RSA PRIVATE KEY
```

No imprimir ningún secreto real.

---

# 13. PROHIBIDO

NO implementar todavía:

```text
Auth UI
Onboarding funcional
Dispatch
Delivery Engine
OTP
Tracking live
GPS ingestion real
Maps
Push
Pricing
Ledger
Payments
Payout real
Admin dashboard real
Catalog
```

NO mergear a `main`.

NO iniciar Fase 2.

---

# 14. DEFINITION OF DONE — FASE 1 v1.3

La próxima revisión será sobre estos puntos concretos:

- [ ] packageManager usa pnpm 11.x realmente publicado.
- [ ] versión pnpm validada con `npm view`.
- [ ] Next 16.x stable realmente publicado.
- [ ] Next NO es preview/canary.
- [ ] eslint-config-next coincide exactamente con Next.
- [ ] Supabase CLI realmente publicada y stable.
- [ ] Turbo realmente publicado y stable.
- [ ] Expo Doctor realmente publicado.
- [ ] lockfile regenerado desde registry.
- [ ] clean `pnpm install --frozen-lockfile` pasa.
- [ ] dependencias directas prerelease = 0.
- [ ] ambas apps ya NO usan `expo.install.exclude`.
- [ ] `expo install --check` pasa Business.
- [ ] `expo install --check` pasa Driver.
- [ ] `expo-doctor` pasa Business.
- [ ] `expo-doctor` pasa Driver.
- [ ] Android export pasa Business.
- [ ] Android export pasa Driver.
- [ ] CI incluye `expo install --check`.
- [ ] Next lint pasa sin warning/plugin conflict.
- [ ] pgTAP `plan()` coincide con assertions reales.
- [ ] pgTAP no usa una descripción como segundo argumento de `throws_ok`.
- [ ] UPDATE-denied se valida mediante filas afectadas/estado persistido.
- [ ] auth.uid() de fixtures está validado.
- [ ] profile own/cross-user RLS probado.
- [ ] platform_role escalation probado y DENIED.
- [ ] auth trigger profile probado.
- [ ] cross-business isolation probado.
- [ ] business_members query sin recursion probado.
- [ ] owner location scope probado.
- [ ] employee assigned location probado.
- [ ] employee unassigned location DENIED.
- [ ] cross-business location DENIED.
- [ ] driver self/cross-user read probado.
- [ ] driver verification self-change DENIED.
- [ ] driver account status self-change DENIED.
- [ ] driver document own/cross read probado.
- [ ] driver document direct INSERT DENIED.
- [ ] driver current_location update DENIED.
- [ ] driver location_updated_at update DENIED.
- [ ] driver operational_state update DENIED.
- [ ] private schema direct access DENIED.
- [ ] private helpers funcionan dentro de policies.
- [ ] database generated types = 9/9.
- [ ] generated DB types drift = 0.
- [ ] README refleja v1.3 y toolchain real.
- [ ] Roadmap refleja toolchain real.
- [ ] tracked caches = 0.
- [ ] nested lockfiles = 0.
- [ ] real secrets = 0.
- [ ] Fase 2 sigue sin iniciar.
- [ ] branch sigue `phase/1-foundation`.
- [ ] NO merge a main.

---

# 15. PROMPT OPERATIVO PARA EL AGENTE

Eres el Agente Senior de Ejecución de Güegüense.

El Cerebro auditó el ZIP real actual de `phase/1-foundation`.

La Fase 1 todavía NO está aprobada.

No rediseñes la arquitectura.

Corrige únicamente este documento.

## Orden de ejecución

1. Permanecer en `phase/1-foundation`.
2. Registrar HEAD y `git status`.
3. Ejecutar todos los `npm view ... dist-tags`.
4. Validar cada versión elegida con `npm view package@version version`.
5. Corregir manifests.
6. Eliminar/regenerar `pnpm-lock.yaml` desde registry REAL.
7. Hacer clean/frozen install.
8. Corregir ESLint Next.
9. Eliminar `expo.install.exclude`.
10. Ejecutar Expo `install --fix`, `install --check`, doctor y exports.
11. Corregir CI móvil.
12. Reescribir/expandir pgTAP según este documento.
13. Ejecutar Supabase reset desde cero.
14. Ejecutar tests DB.
15. Regenerar DB Types y comprobar drift.
16. Ejecutar quality/web gates.
17. Actualizar README/Roadmap con versiones verificadas.
18. Ejecutar hygiene/secret scan.
19. Push SOLO a `phase/1-foundation`.
20. DETENERSE.

---

# 16. REPORTE FINAL OBLIGATORIO DEL AGENTE

## A. Branch / HEAD

```text
branch:
HEAD:
```

## B. Registry evidence

Copiar salida exacta NO sensible de:

```text
npm view pnpm dist-tags --json
npm view next dist-tags --json
npm view supabase dist-tags --json
npm view turbo dist-tags --json
npm view expo-doctor dist-tags --json
```

Y:

```text
npm view pnpm@SELECTED version
npm view next@SELECTED version
npm view supabase@SELECTED version
npm view turbo@SELECTED version
npm view expo-doctor@SELECTED version
```

## C. Final Version Matrix

```text
Node:
pnpm:
Turbo:
TypeScript root:
TypeScript business-mobile:
TypeScript driver-mobile:
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

## D. Lockfile

```text
Lockfile regenerated from registry: YES
Clean frozen install: PASS
Direct prerelease dependencies: 0
```

## E. Expo

```text
Business expo install --check:
Business expo-doctor:
Business Android export:
Driver expo install --check:
Driver expo-doctor:
Driver Android export:
expo.install.exclude remaining: 0
```

## F. pgTAP

```text
Plan:
Assertions actually executed:
Plan mismatch: 0
RLS behavioral suite: PASS
```

## G. Security Results

```text
Profile cross-user: DENIED
Profile role escalation: DENIED
Business cross-tenant: DENIED
business_members recursion: NONE
Owner all business locations: PASS
Employee assigned location: PASS
Employee unassigned location: DENIED
Cross-business location: DENIED
Driver cross-user: DENIED
Driver verification self-change: DENIED
Driver account self-change: DENIED
Driver document direct INSERT: DENIED
Driver direct current_location: DENIED
Driver direct location_updated_at: DENIED
Driver direct operational_state: DENIED
Private schema direct access: DENIED
```

## H. DB Types

```text
Foundation tables expected: 9
Foundation tables generated: 9
Generated drift: 0
```

## I. Commands

Tabla:

```text
Command | Exit Code | PASS/FAIL/NOT_EXECUTED/BLOCKED
```

## J. Hygiene

```text
Tracked caches:
Nested lockfiles:
Real secrets:
```

## K. Deviations

Si ninguna:

```text
None
```

## L. Estado

Terminar exactamente:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENERSE.

NO comenzar Fase 2.

---

# FIN — FASE 1 CORRECCIÓN v1.3
