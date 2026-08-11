# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CORRECCIÓN v1.2

**Tipo:** Auditoría real del repositorio + instrucciones ejecutables de corrección  
**Base auditada:** `gueguenseapp-phase-1-foundation.zip`  
**Fase:** FASE 1 — FUNDACIÓN Y ESTRUCTURA CORE  
**Estado:** ❌ FASE 1 NO APROBADA  
**Regla:** No comenzar Fase 2. No mergear a `main`. No añadir features de negocio.

---

# PARTE A — VEREDICTO DEL CEREBRO

La corrección v1.1 resolvió varios problemas importantes:

```text
PASS  Expo SDK 57 → React Native 0.86.2 / React 19.2.3
PASS  Node 24.18.0 en .node-version/.nvmrc/CI
PASS  Assets móviles existen
PASS  .turbo/.next/.expo/node_modules no aparecen en el ZIP
PASS  un único pnpm-lock.yaml
PASS  profiles ya no tiene UPDATE directo
PASS  business_members ya no usa una policy recursiva directa
PASS  driver_documents no tiene INSERT/UPDATE directo
PASS  driver_presence no tiene UPDATE directo
PASS  helpers SECURITY DEFINER usan search_path=''
PASS  constantes canónicas ampliadas
PASS  tsconfig móviles incluye flags estrictos
PASS  mobile Supabase clients ya no tienen placeholder silencioso
PASS  Admin Web tiene factories Supabase browser/server
PASS  Tracking Web no tiene cliente Supabase directo
PASS  CI DB ejecuta start → reset → test → db:types → drift
```

Sin embargo todavía existen bloqueos que impiden aprobar Fase 1.

Los tres más importantes son:

```text
CRÍTICO  pnpm-lock/package versions no son reproducibles contra el registry estable.
CRÍTICO  database.generated.ts sigue representando solo 3 de las 9 tablas Foundation.
CRÍTICO  pgTAP sigue teniendo solo tests estructurales; no demuestra RLS/tenancy real.
```

También faltan gates de Expo y la configuración correcta de ESLint para Next.js.

---

# PARTE B — BLOQUEO 1: REGISTRY / LOCKFILE / VERSIONES REALES

## 1.1 Problema detectado

El repositorio declara actualmente:

```text
packageManager = pnpm@11.21.0
next package spec = ^16.0.0
pnpm-lock → next@16.3.0
supabase CLI = 2.15.8
turbo = 2.4.4
```

La auditoría externa del Cerebro comprobó contra el registry público estable que esos valores no representan correctamente el estado estable publicado.

A fecha de esta auditoría, el registry público muestra como referencias estables:

```text
pnpm 11.x estable: 11.17.0
Next.js 16.x estable: 16.2.12
Supabase CLI estable: 2.110.0
Turbo estable: 2.10.7
Expo Doctor estable: 1.20.1
```

No confiar ciegamente en estos números si el registry cambia antes de ejecutar la corrección.

## 1.2 Regla definitiva

Antes de modificar package.json, ejecutar y guardar resultado:

```bash
npm view pnpm dist-tags.latest
npm view next dist-tags.latest
npm view supabase dist-tags.latest
npm view turbo dist-tags.latest
npm view expo-doctor dist-tags.latest
```

Validaciones:

```text
pnpm debe seguir en major 11 para esta Fase.
Next debe ser stable 16.x.
Supabase CLI debe ser stable, no beta.
Turbo debe ser stable.
Expo Doctor debe ser stable.
```

Si `pnpm latest` ya cambió a major 12 estable:

```text
NO migrar automáticamente.
Usar el último 11.x publicado estable.
```

Consultar:

```bash
npm view pnpm versions --json
```

y elegir el último 11.x real.

## 1.3 Pin exacto

Fijar EXACTAMENTE, sin `^` ni `~`, las herramientas críticas del root:

```text
pnpm packageManager
turbo
supabase
typescript (mantener la versión aprobada salvo incompatibilidad real)
expo-doctor
```

Para Next:

```text
next = versión exacta stable 16.x
eslint-config-next = misma versión exacta que Next
```

en ambas apps web.

No usar:

```text
16.3.0-preview.*
16.3.0-canary.*
beta
rc
next
```

## 1.4 Regenerar lockfile REAL

El lockfile actual debe descartarse y regenerarse desde el registry real.

Secuencia:

```bash
rm pnpm-lock.yaml

# con el pnpm 11.x real seleccionado
pnpm install
pnpm install --frozen-lockfile
```

No editar `pnpm-lock.yaml` a mano.

Después verificar:

```bash
pnpm --version
pnpm turbo --version
pnpm supabase --version
pnpm --filter @gueguense/admin-web exec next --version
pnpm --filter @gueguense/tracking-web exec next --version
```

Los valores deben coincidir con los manifests/lockfile.

## 1.5 Sanity check de prereleases

Ejecutar una búsqueda sobre:

```text
pnpm-lock.yaml
package.json
apps/*/package.json
```

y comprobar que las dependencias críticas no resuelvan:

```text
-canary
-preview
-beta
-rc
-alpha
```

salvo una dependencia transitoria que sea explícitamente requerida por un paquete estable y no sea una decisión directa nuestra.

Reportar cualquier excepción.

---

# PARTE C — BLOQUEO 2: NEXT.JS + ESLINT

## 2.1 Problema

Las apps web importan únicamente el ESLint root:

```text
apps/admin-web/eslint.config.mjs
apps/tracking-web/eslint.config.mjs
```

pero el root solo contiene `typescript-eslint`.

No se está cargando la configuración oficial de Next.js.

La corrección v1.1 exigía eliminar el warning:

```text
Next.js plugin was not detected in your ESLint configuration
```

## 2.2 Corrección

Agregar `eslint-config-next` de la misma versión exacta de Next 16 estable.

Crear flat config por app siguiendo el patrón oficial de Next 16, incluyendo:

```text
eslint-config-next/core-web-vitals
eslint-config-next/typescript
```

Puede combinarse con reglas del root, pero no debe perder las reglas Next.

Resultado obligatorio:

```text
pnpm --filter @gueguense/admin-web lint → PASS sin warning de Next plugin
pnpm --filter @gueguense/tracking-web lint → PASS sin warning de Next plugin
```

## 2.3 Pin de Next

No mantener:

```json
"next": "^16.0.0"
```

Fijar la versión stable exacta elegida.

Ambas webs deben usar exactamente la misma.

---

# PARTE D — BLOQUEO 3: EXPO GATES INCOMPLETOS

## 3.1 Expo SDK actual

Las dependencias base ya están alineadas:

```text
Expo SDK 57
React Native 0.86.2
React 19.2.3
```

No volver a bajar esas versiones.

## 3.2 `expo-doctor`

El CI ejecuta:

```bash
pnpm --filter @gueguense/business-mobile exec expo-doctor
```

pero `expo-doctor` no está declarado en ningún `package.json` ni aparece en el lockfile auditado.

Agregar `expo-doctor` stable EXACTO como devDependency del root.

Ejecutarlo con un comando reproducible, por ejemplo:

```bash
pnpm exec expo-doctor apps/business-mobile
pnpm exec expo-doctor apps/driver-mobile
```

o equivalente probado.

No depender de una descarga implícita diferente en cada CI.

## 3.3 Falta `expo install --check`

Agregar a CI y ejecutar localmente:

```bash
pnpm --dir apps/business-mobile exec expo install --check
pnpm --dir apps/driver-mobile exec expo install --check
```

Resultado:

```text
Business Expo dependency check: PASS
Driver Expo dependency check: PASS
```

No usar `expo.install.exclude` para ocultar incompatibilidades.

## 3.4 Metro smoke

Mantener:

```bash
expo export --platform android
```

para ambas apps.

Además mantener:

```text
expo config
expo-doctor
typecheck
lint
```

Los typecheck/lint pueden permanecer en el job global si realmente abarcan ambas apps.

---

# PARTE E — BLOQUEO 4: DATABASE TYPES SIGUEN STALE

## 4.1 Hallazgo

Las migrations crean 9 tablas Foundation:

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

Pero:

```text
packages/types/src/database.generated.ts
```

solo contiene:

```text
profiles
businesses
drivers
```

Además no contiene varias columnas reales como:

```text
profiles.updated_at
businesses.updated_at
```

Por tanto:

```text
Foundation DB types = 3/9
```

No aceptar ese archivo como generado.

## 4.2 Corrección obligatoria

Después de instalar una Supabase CLI estable real y ejecutar las migrations desde cero:

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm db:types
```

Verificar mecánicamente que aparecen las 9 tablas.

No editar `database.generated.ts` manualmente.

El archivo debe ser la salida real de:

```bash
supabase gen types typescript --local
```

## 4.3 Drift Gate

Mantener/agregar:

```bash
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

pero esta vez debe ejecutarse realmente contra el schema reseteado.

Resultado obligatorio:

```text
Foundation tables in generated types: 9/9
Generated DB types drift: 0
```

Si no da 9/9, Fase 1 NO puede marcarse candidata.

---

# PARTE F — BLOQUEO 5: pgTAP NO PRUEBA RLS REAL

## 5.1 Hallazgo

La suite actual tiene:

```text
plan(18)
```

y prueba principalmente:

```text
schema exists
tables exist
RLS enabled
private schema privilege
profiles has PK
```

No prueba ninguno de los controles de seguridad principales exigidos por v1.1.

## 5.2 Obligatorio: tests conductuales

Crear fixtures sintéticos dentro de una transacción.

Las pruebas deben ejecutar queries reales con:

```text
ROLE authenticated
auth.uid() simulado mediante JWT claims/session config apropiado al stack local
```

No basta consultar `pg_policies`.

## 5.3 Fixtures mínimos

Crear usuarios sintéticos:

```text
user_a
user_b
driver_a
driver_b
owner_a
employee_a
outsider_b
```

Negocios:

```text
business_a
business_b
```

Locations:

```text
location_a1
location_a2
location_b1
```

Memberships:

```text
owner_a → business_a
employee_a → business_a → solo location_a1
outsider_b → business_b
```

## 5.4 Tests RLS obligatorios

### Profiles

```text
user_a puede leer profile A
user_a NO puede leer profile B
user_a NO puede cambiar platform_role
```

No basta que UPDATE no tenga policy: probar el efecto real y confirmar que el rol permanece sin cambios.

### Trigger

Crear un auth user sintético y comprobar:

```text
auth.users INSERT
→ public.profiles creado automáticamente
```

### Business isolation

```text
owner_a puede leer business_a
owner_a NO puede leer business_b
outsider_b NO puede leer business_a
```

### business_members recursion

Ejecutar SELECT real como miembro activo:

```text
no error de infinite recursion
```

y confirmar solo datos autorizados.

### Location scope

```text
owner_a ve location_a1
owner_a ve location_a2
employee_a ve location_a1
employee_a NO ve location_a2
employee_a NO ve location_b1
```

### Drivers

```text
driver_a ve driver_a
driver_a NO ve driver_b
driver_a no cambia verification_status
driver_a no cambia account_status
```

### Driver Documents

```text
driver_a lee sus propios documentos
driver_a NO puede INSERT directo
driver_a NO puede auto-crear un documento VERIFIED
```

### Driver Presence

```text
driver_a lee su presence
driver_a NO puede UPDATE current_location
driver_a NO puede UPDATE location_updated_at
driver_a NO puede UPDATE operational_state
```

### Private schema

Mantener test de privilegios y añadir una comprobación real de que un cliente autenticado no puede usar el schema privado como API directa.

## 5.5 Resultado

No fijar un número arbitrario de tests.

Debe haber suficientes assertions para cubrir todas las reglas anteriores.

El reporte debe mostrar:

```text
RLS behavioral tests: PASS
Cross-business isolation: PASS
Location N:M scope: PASS
Profile role escalation: DENIED
Driver self-verification: DENIED
Driver direct GPS: DENIED
business_members recursion: NONE
```

---

# PARTE G — BLOQUEO 6: VALIDAR HELPERS RLS EN EJECUCIÓN

Los helpers actuales:

```text
private.is_active_business_member
private.can_access_business_location
```

tienen buena dirección arquitectónica.

NO reescribirlos sin necesidad.

Pero deben verificarse con los tests conductuales anteriores.

El test debe confirmar que:

```text
las policies que llaman helpers privados funcionan para authenticated
no producen permission denied sobre schema private
no producen recursion
no exponen el helper como endpoint público directo
```

Si los tests revelan un problema de `USAGE`/EXECUTE:

- corregir el patrón siguiendo documentación oficial de Supabase/Postgres;
- mantener `private` fuera de exposed schemas;
- mantener `search_path=''`;
- mantener mínimo privilegio.

No abrir el schema `private` globalmente para “hacer pasar el test”.

---

# PARTE H — BLOQUEO 7: DOCUMENTACIÓN DE FASE 1 ESTÁ STALE

`README.md` está mayormente actualizado, pero:

```text
docs/20_DEVELOPMENT_ROADMAP.md
```

todavía afirma:

```text
Node 24.16.0
React Native 0.78 / 0.86
Supabase CLI 2.15.8
```

Después de cerrar toolchain, actualizar README + Roadmap con las versiones REALES verificadas.

Debe quedar una sola versión por componente.

No escribir:

```text
0.78 / 0.86
```

Debe decir la versión exacta utilizada.

Ejemplo:

```text
React Native 0.86.2
```

## 8.1 Expo Router

No describirlo como “v5 line” si la versión instalada es `57.x`.

Documentar la versión real que esté en package/lock.

---

# PARTE I — CHECKS YA CUMPLIDOS QUE NO DEBEN REGRESAR

Mantener:

```text
Tracked .turbo = 0
Tracked .next = 0
Tracked .expo = 0
Tracked node_modules = 0
Nested lockfiles = 0

profiles UPDATE directo = DENY
driver UPDATE directo = DENY
driver_documents INSERT/UPDATE directo = DENY
driver_presence UPDATE directo = DENY

Mobile placeholder Supabase key = eliminado
Admin browser/server factories = presentes
Tracking Web direct Supabase client = ausente

Mobile strict flags = presentes
Assets móviles = presentes
```

Cualquier regresión vuelve a bloquear Fase 1.

---

# PARTE J — CI FINAL REQUERIDO

## Quality job

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Mobile job

Para Business:

```bash
pnpm --dir apps/business-mobile exec expo config
pnpm --dir apps/business-mobile exec expo install --check
pnpm exec expo-doctor apps/business-mobile
pnpm --dir apps/business-mobile exec expo export --platform android --output-dir .expo/android-export
```

Repetir para Driver.

Si la sintaxis concreta difiere, usar una equivalente que hayas ejecutado y probado.

## Database job

```bash
pnpm install --frozen-lockfile
pnpm supabase --version
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
pnpm supabase:stop
```

`supabase:stop` siempre debe ejecutarse con cleanup (`if: always()` o equivalente).

---

# PARTE K — CLEAN INSTALL VERIFICATION

Antes del push final, simular un clon limpio.

No confiar en node_modules/cache existente.

Método recomendado:

```bash
git status --short
git clean -xfd -e .env -e .env.local  # usar con cuidado y solo si el agente sabe qué preserva
pnpm install --frozen-lockfile
```

Alternativamente usar un directorio/clon temporal limpio.

La finalidad es demostrar:

```text
un desarrollador nuevo puede clonar + instalar + ejecutar gates
```

No borrar archivos del usuario por usar `git clean` de forma irresponsable.

Preferir clon temporal si hay dudas.

---

# PARTE L — SECRET / HYGIENE SCAN

Antes de push:

```text
Tracked .turbo: 0
Tracked .next: 0
Tracked .expo: 0
Tracked node_modules: 0
Nested lockfiles: 0
Real secrets: 0
```

Buscar patrones:

```text
sb_secret_
service_role
sk_live_
sk_test_
ghp_
BEGIN PRIVATE KEY
BEGIN RSA PRIVATE KEY
```

No imprimir el valor completo si aparece uno real.

---

# PARTE M — PROHIBICIONES

NO implementar:

```text
Auth UI
Onboarding funcional
Dispatch
Deliveries
OTP
Tracking live
GPS ingestion productivo
Maps
Push
Pricing
Ledger
Payments
Payout real
Admin dashboard
Catalog
```

Esta ronda sigue siendo exclusivamente Foundation.

NO merge a main.

NO iniciar Fase 2.

---

# PARTE N — DEFINITION OF DONE FASE 1 v1.2

Fase 1 vuelve a auditoría únicamente cuando:

- [ ] pnpm seleccionado existe realmente en npm y es 11.x stable.
- [ ] `packageManager` usa esa versión exacta.
- [ ] Next stable 16.x real está fijado EXACTAMENTE en ambas webs.
- [ ] lockfile no contiene un Next stable inexistente/prerelease accidental.
- [ ] `eslint-config-next` coincide con Next.
- [ ] lint Next pasa sin warning de plugin.
- [ ] Supabase CLI stable real está fijada exactamente.
- [ ] Turbo stable real está fijado exactamente o se justifica conservar versión exacta compatible.
- [ ] pnpm-lock fue regenerado desde registry real, no editado.
- [ ] frozen install pasa desde entorno limpio.
- [ ] Expo SDK 57 continúa en RN 0.86 / React 19.2.3.
- [ ] `expo install --check` pasa en ambas apps.
- [ ] `expo-doctor` está disponible de forma reproducible y pasa.
- [ ] Expo Android export pasa en ambas apps.
- [ ] database.generated.ts contiene 9/9 tablas Foundation.
- [ ] database.generated.ts proviene del CLI local real.
- [ ] generated types drift = 0.
- [ ] pgTAP contiene pruebas RLS conductuales.
- [ ] profile own read / cross-user deny probado.
- [ ] platform_role escalation denegada en test.
- [ ] business cross-tenant isolation probada.
- [ ] business_members sin recursion probada.
- [ ] owner location scope probado.
- [ ] employee N:M location scope probado.
- [ ] driver cross-user isolation probada.
- [ ] driver verification/account self-update denegado.
- [ ] driver_documents direct insert/auto-verify denegado.
- [ ] driver_presence location/state updates denegados.
- [ ] private schema no es API directa.
- [ ] README y Roadmap reflejan toolchain real.
- [ ] Roadmap no contiene `RN 0.78 / 0.86`.
- [ ] caches/build outputs tracked = 0.
- [ ] nested lockfiles = 0.
- [ ] secrets reales = 0.
- [ ] CI contiene Expo dependency check.
- [ ] CI usa toolchain real y frozen install.
- [ ] CI DB ejecuta reset + tests + type drift.
- [ ] no scope creep.
- [ ] Fase 1 sigue `EN REVISIÓN / CANDIDATA A APROBACIÓN`.
- [ ] agente hace push y se detiene.
- [ ] Cerebro audita contenido real.

---

# PARTE O — PROMPT OPERATIVO PARA EL AGENTE

Eres el Agente Senior de Ejecución de Güegüense.

El Cerebro ha auditado directamente el ZIP actual de `phase/1-foundation`.

FASE 1 NO está aprobada.

Debes aplicar exactamente este archivo.

## Orden obligatorio

1. Permanecer en `phase/1-foundation`.
2. Verificar working tree/HEAD.
3. Consultar registry real de pnpm/Next/Supabase/Turbo/Expo Doctor.
4. Corregir manifests con versiones publicadas estables reales.
5. Instalar `eslint-config-next` correcto.
6. Instalar `expo-doctor` reproducible.
7. Eliminar y regenerar `pnpm-lock.yaml`.
8. Ejecutar frozen install limpio.
9. Ejecutar Expo check/doctor/export.
10. Corregir CI.
11. Ejecutar Supabase start/reset.
12. Regenerar DB types reales.
13. Reescribir/expandir pgTAP con comportamiento RLS real.
14. Ejecutar pgTAP.
15. Ejecutar DB types drift.
16. Ejecutar lint/typecheck/tests/build.
17. Actualizar README/Roadmap con versiones REALES.
18. Ejecutar hygiene/secret scan.
19. Push SOLO a `phase/1-foundation`.
20. DETENERSE.

## Prohibición de fake completion

No afirmar que un gate pasó si no fue ejecutado.

Cada gate:

```text
Command
Exit Code
PASS / FAIL / NOT_EXECUTED / BLOCKED
```

Si Docker no está disponible:

```text
DB gates = BLOCKED_ENVIRONMENT
```

No escribir PASS.

Si el registry no contiene una versión declarada:

```text
NO fabricar lockfile.
```

Corregir manifest a una versión publicada real.

---

# PARTE P — REPORTE FINAL DEL AGENTE

Entregar:

## A. Branch / HEAD

```text
branch:
HEAD:
```

## B. Registry verification

```text
pnpm stable selected:
Next stable selected:
Supabase CLI stable selected:
Turbo stable selected:
Expo Doctor selected:
```

Incluir los comandos `npm view` ejecutados.

## C. Actual version matrix

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

## D. Database Types

```text
Foundation tables expected: 9
Foundation tables generated: 9
Generated type drift: 0
```

## E. Security tests

```text
Profile role escalation: DENIED
Cross-business read: DENIED
business_members recursion: NONE
Owner locations: PASS
Employee assigned location: PASS
Employee unassigned location: DENIED
Driver cross-user read: DENIED
Driver verification self-change: DENIED
Driver document direct insert: DENIED
Driver direct GPS update: DENIED
Driver direct operational state update: DENIED
Private schema direct client access: DENIED
```

## F. Commands

Tabla:

```text
Command | Exit Code | Result
```

## G. CI changes

Explicar Expo checks, Next lint config y DB gates.

## H. Hygiene

```text
Tracked caches/build outputs:
Nested lockfiles:
Real secrets:
Prerelease direct dependencies:
```

## I. Deviations

Si ninguna:

```text
None
```

## J. Estado

Terminar exactamente:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENERSE.

NO iniciar Fase 2.

---

# FIN DEL PAQUETE ÚNICO — FASE 1 CORRECCIÓN v1.2
