# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CORRECCIÓN v1.1

**Tipo:** Auditoría real de implementación + prompt operativo de corrección  
**Base auditada por el Cerebro:** `gueguenseapp-main(1)(3).zip`  
**Fase:** FASE 1 — FUNDACIÓN Y ESTRUCTURA CORE  
**Estado:** ❌ FASE 1 NO APROBADA — CORRECCIONES OBLIGATORIAS  
**Objetivo:** Corregir la fundación ya construida sin avanzar a Fase 2.  
**Regla:** No añadir features de negocio. No Dispatch real, Delivery real, OTP real, Tracking real, Pricing real ni Ledger real.

---

# ============================================================

# PARTE A — VEREDICTO DEL CEREBRO

# ============================================================

El ZIP sí contiene la implementación de Fase 1:

```text
apps/
packages/
supabase/
.github/workflows/
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
turbo.json
```

Sin embargo, Fase 1 NO puede aprobarse todavía.

Los bloqueos principales encontrados en los archivos reales son:

```text
CRÍTICO  — Expo SDK 57 con React Native/React/Expo Router incompatibles.
CRÍTICO  — profiles permite escalación de platform_role mediante UPDATE propio.
CRÍTICO  — business_members contiene RLS recursiva.
CRÍTICO  — database.generated.ts no corresponde al schema real.
ALTO     — Next.js implementado en 15.x aunque Fase 1 exige 16.x Active LTS.
ALTO     — driver_documents permite INSERT directo con verification_status elegible por cliente.
ALTO     — driver_presence tiene UPDATE policy autorreferencial y demasiado permisiva.
ALTO     — pgTAP no prueba comportamiento RLS ni aislamiento real.
ALTO     — migrations no coinciden con la arquitectura aprobada en varias columnas/constraints.
MEDIO    — .turbo y logs/cache generados están versionados.
MEDIO    — CI no valida las apps Expo y no ejecuta db reset antes de pgTAP.
MEDIO    — Supabase CLI/Turbo no están fijados de forma exacta en package.json.
MEDIO    — Admin Web no tiene todavía factories SSR preparados.
MEDIO    — los tsconfig móviles no heredan todos los flags strict acordados.
MEDIO    — app.json referencia assets inexistentes.
```

---

# ============================================================

# PARTE B — DECISIONES TÉCNICAS OBLIGATORIAS

# ============================================================

# 1. Toolchain

## 1.1 Node.js

Usar:

```text
Node.js 24.18.0 LTS
```

Actualizar de forma consistente:

```text
.node-version
.nvmrc
package.json engines cuando aplique
.github/workflows/ci.yml
```

No usar Node 26 Current.

---

# 2. Expo SDK 57 — CORRECCIÓN CRÍTICA

Las apps móviles actualmente declaran:

```text
expo ~57
react-native 0.78
react 19.0
expo-router ~5
```

Esto NO es una instalación válida de SDK 57.

Para Expo SDK 57 la línea compatible debe provenir del template oficial SDK 57 y actualmente corresponde a:

```text
Expo SDK 57
React Native 0.86
React 19.2.3
Expo Router de la línea SDK 57
```

No corregir solamente `react-native`.

## Procedimiento obligatorio

En cada app:

```text
apps/business-mobile
apps/driver-mobile
```

usar el template oficial `default@sdk-57` como referencia de dependencias.

Ejecutar desde cada workspace, con pnpm:

```text
expo install --fix
expo install --check
expo-doctor
```

La validación final debe reportar:

```text
expo install --check: PASS
expo-doctor: PASS
```

No utilizar `expo.install.exclude` para ocultar incompatibilidades.

## 2.1 `.npmrc`

Eliminar:

```text
strict-peer-dependencies=false
```

como mecanismo para esconder incompatibilidades.

Después de alinear dependencias, usar peer dependency checking estricto o la configuración por defecto sin una excepción global que oculte errores.

## 2.2 Smoke bundle

No basta `tsc`.

Para cada app ejecutar un bundle Metro reproducible, por ejemplo:

```text
expo export --platform android
```

a un directorio temporal/no versionado.

Debe pasar en CI.

## 2.3 Assets

Actualmente `app.json` referencia:

```text
./assets/icon.png
```

pero `assets/` no existe.

Corregir:

- agregar un asset placeholder válido; o
- retirar referencias inexistentes hasta Branding.

Resultado obligatorio:

```text
expo config: PASS
expo-doctor: PASS
expo export: PASS
```

No versionar outputs de export.

---

# 3. Next.js — actualizar a 16.x Active LTS

Actualmente las dos apps web resuelven:

```text
Next.js 15.5.x
```

pero Fase 1 exige Next.js 16.x estable.

Actualizar:

```text
apps/admin-web
apps/tracking-web
```

a un patch estable actual de:

```text
Next.js 16.x
```

No utilizar:

```text
canary
beta
rc
```

Usar React/React DOM compatibles con Next 16.

Ejecutar:

```text
next build
```

en ambas.

## 3.1 ESLint Next

Los logs actuales muestran:

```text
Next.js plugin was not detected in your ESLint configuration
```

Corregir las configuraciones de las apps Next usando `eslint-config-next`/flat config compatible con Next 16.

El build/lint final no debe emitir esa advertencia.

---

# 4. Versiones reproducibles

## 4.1 pnpm

`packageManager` debe apuntar a una versión real, estable y existente de pnpm 11.x.

Antes de continuar, el agente debe verificar contra el registry:

```text
pnpm --version
registry stable 11.x
```

y fijar exactamente:

```json
"packageManager": "pnpm@<stable-11.x-exact>"
```

No usar pnpm 12 alpha/beta/RC.

## 4.2 Turbo

Actualmente:

```json
"turbo": "^2.4.4"
```

y el lockfile resuelve otra versión.

Fijar una versión estable exacta:

```json
"turbo": "<exact>"
```

## 4.3 Supabase CLI

Actualmente:

```json
"supabase": "^2.15.8"
```

pero el lockfile resuelve una CLI muy distinta.

Seleccionar la versión estable actual que realmente se utilizará y fijar:

```json
"supabase": "<exact>"
```

La CLI utilizada localmente y en CI debe ser la MISMA.

No mantener una CLI local y otra distinta mediante `supabase/setup-cli`.

## 4.4 TypeScript / tooling crítico

Fijar exactamente las herramientas críticas del root que afectan compilación reproducible, al menos:

```text
typescript
turbo
supabase
```

El lockfile debe regenerarse una única vez después de las correcciones.

---

# 5. Eliminar artifacts generados versionados

El ZIP contiene más de cien entradas bajo:

```text
.turbo/
apps/*/.turbo/
packages/*/.turbo/
```

Aunque `.gitignore` ya contiene `.turbo/`, estos archivos están versionados.

Eliminar del índice Git:

```text
.turbo/
**/.turbo/
```

Resultado obligatorio:

```text
git ls-files | buscar ".turbo/"
→ 0 archivos
```

No versionar:

```text
turbo cache
turbo logs
.next
.expo
dist
build
node_modules
```

---

# ============================================================

# PARTE C — DATABASE / RLS — CORRECCIONES CRÍTICAS

# ============================================================

# 6. Reescribir las migrations de Foundation antes de merge

Fase 1 todavía NO está merged ni desplegada a Production.

Por tanto, corregir las migrations iniciales existentes de forma limpia en vez de acumular migrations de reparación innecesarias.

Después ejecutar desde cero:

```text
supabase db reset
```

No mantener una migration vulnerable solo porque ya fue creada en la rama.

---

# 7. CRÍTICO — `profiles.platform_role` permite privilege escalation

La policy actual:

```text
Users can update own profile
```

permite actualizar la fila completa del usuario.

RLS controla filas, NO protege columnas.

Por tanto un usuario autenticado puede intentar:

```text
platform_role = super_admin
```

## Decisión de Fase 1

Eliminar el UPDATE directo de cliente sobre `public.profiles`.

En Fase 1:

```text
SELECT propio = permitido
UPDATE directo = DENEGADO
```

Más adelante se creará una operación controlada para editar únicamente:

```text
full_name
avatar_url
phone
```

`platform_role` siempre es server/admin-controlled.

Agregar pgTAP que demuestre:

```text
usuario normal no puede cambiar platform_role
usuario normal no puede convertirse en admin
```

No aceptar como solución una `WITH CHECK auth.uid() = id`, porque eso solo controla la fila.

---

# 8. CRÍTICO — RLS recursiva en `business_members`

La policy actual de `business_members` consulta nuevamente:

```text
public.business_members
```

desde una policy aplicada a `public.business_members`.

Esto puede producir:

```text
infinite recursion detected in policy
```

Además, `businesses`, `business_locations` y `business_member_locations` dependen directa o indirectamente de esa policy.

## Solución canónica

Crear helpers de autorización sin SQL dinámico, por ejemplo en schema privado:

```text
private.is_active_business_member(business_id)
private.can_access_business_location(location_id)
```

o estructura equivalente.

Requisitos:

```text
SECURITY DEFINER cuando sea necesario
SET search_path = ''
schema-qualified references
auth.uid()
REVOKE EXECUTE FROM PUBLIC
REVOKE EXECUTE FROM anon
GRANT mínimo al rol necesario
```

Las policies NO deben volver a consultar recursivamente la misma tabla protegida.

## Semántica de acceso

### Business

Miembro `ACTIVE` puede leer su Business.

### Business Members

Miembro `ACTIVE` puede leer los miembros de su Business conforme a la policy aprobada.

### Business Locations

```text
business_owner
→ acceso global a las sucursales de su negocio

business_manager / business_employee
→ solo locations asignadas mediante business_member_locations
```

No provocar ciclos RLS.

### Business Member Locations

La lectura debe respetar tenancy y rol.

---

# 9. CRÍTICO — `driver_documents` no puede auto-verificarse

Actualmente existe:

```text
Drivers can insert own documents
```

y el cliente puede enviar una fila con:

```text
verification_status = VERIFIED
```

porque la policy solo comprueba `driver_id`.

## Fase 1

Eliminar INSERT directo desde Supabase client.

La escritura de metadata de documentos se hará posteriormente mediante backend/upload flow validado.

Mantener:

```text
Driver SELECT own documents
```

pero:

```text
INSERT/UPDATE verification direct from client = DENY
```

No permitir al Driver controlar:

```text
verification_status
rejection_reason
storage_path
```

---

# 10. CRÍTICO — `driver_presence` no debe tener UPDATE directo en Fase 1

La policy actual:

```text
Drivers can toggle operational state
```

hace una subconsulta a la misma tabla para intentar proteger `current_location`.

Es innecesariamente frágil y puede crear recursión/semántica inesperada.

También permite al Driver escribir cualquier:

```text
OFFLINE
AVAILABLE
OFFERED
BUSY
PAUSED
```

sin validar account/verification status.

## Decisión Fase 1

Dejar:

```text
Driver SELECT own presence = permitido
Driver UPDATE directo = DENEGADO
```

El cambio de availability se implementará mediante una operación controlada en la fase funcional correspondiente.

La ubicación siempre será:

```text
Driver App
→ endpoint/RPC validado
→ server
→ driver_presence
```

Agregar tests de que cliente autenticado NO puede:

```text
actualizar current_location
actualizar location_updated_at
forzar operational_state
```

---

# 11. Alinear Foundation Schema con `06_DATABASE_ARCHITECTURE.md`

Las migrations actuales omiten o cambian campos/constraints de la arquitectura aprobada.

Corregir como mínimo:

## profiles

- index `platform_role`;
- decidir si `updated_at` queda:
  - si queda, mantenerlo correctamente; o
  - retirarlo si no forma parte del modelo.
- nunca client-controlled `platform_role`.

## businesses

Agregar indexes:

```text
verification_status
account_status
```

## business_members

Agregar indexes:

```text
business_id
user_id
```

## business_member_locations

Alinear con la arquitectura aprobada.

Preferencia:

```text
id UUID PK
business_member_id
business_location_id
created_at
UNIQUE(business_member_id, business_location_id)
```

No mezclar nombres distintos entre docs/migration/code.

## business_locations

La arquitectura aprobada exige:

```text
location GEOGRAPHY(Point,4326) NOT NULL
pickup_instructions TEXT nullable
is_active BOOLEAN NOT NULL DEFAULT true
```

Agregar index:

```text
business_id
GIST(location)
```

## drivers

Agregar:

```text
UNIQUE(national_id_number)
UNIQUE(license_number)
INDEX verification_status
INDEX account_status
```

## driver_documents

Resolver la inconsistencia `file_path` vs `upload_id`.

Decisión recomendada:

La API futura recibe:

```text
upload_id/upload_reference
```

pero `driver_documents` persiste un path/identifier SERVER-OWNED del objeto, por ejemplo:

```text
storage_path
```

junto con:

```text
rejection_reason
verification_status
```

El Driver nunca elige libremente el storage path.

Actualizar `06_DATABASE_ARCHITECTURE.md` para usar el mismo nombre final.

## vehicles

Alinear:

```text
year NOT NULL
color TEXT NOT NULL
INDEX driver_id
UNIQUE license_plate
```

## driver_presence

Agregar index:

```text
operational_state
GIST(current_location)
```

Sin UPDATE directo de cliente.

---

# 12. `handle_new_user` hardening

La función ya usa:

```text
SECURITY DEFINER
SET search_path = ''
schema-qualified insert
```

Mantener.

Agregar explícitamente permisos mínimos sobre la función.

No dejar `EXECUTE` innecesario para `PUBLIC`.

Debe seguir funcionando como trigger de `auth.users`.

Agregar test de creación de profile.

---

# ============================================================

# PARTE D — TESTING

# ============================================================

# 13. pgTAP actual es insuficiente

El archivo actual prueba principalmente:

```text
schema exists
table exists
RLS enabled
```

No prueba aislamiento ni comportamiento real.

La Fase 1 exige tests POSITIVOS y NEGATIVOS de RLS.

Crear fixtures sintéticos dentro de transacciones.

## Cobertura obligatoria

### Schema

- 9 foundation tables existen.
- PK/FK/UNIQUE críticos.
- PostGIS disponible.
- private schema inaccesible a client roles.

### Profiles

- user A lee perfil A.
- user A no lee perfil B.
- user A no cambia `platform_role`.
- trigger auth.users crea profile.

### Business tenancy

Crear:

```text
User A → Business A
User B → Business B
```

Probar:

```text
A puede leer Business A
A NO puede leer Business B
B NO puede leer Business A
```

### Business members

- SELECT no produce RLS recursion.
- active member puede leer según policy.
- outsider no enumera memberships.

### Location scope N:M

Crear:

```text
Location A1
Location A2
employee asignado solo A1
owner sin asignación específica
```

Probar:

```text
owner ve A1/A2
employee ve A1
employee NO ve A2
cross-business = DENY
```

### Drivers

- Driver A lee solo Driver A.
- Driver no cambia verification_status.
- Driver no cambia account_status.

### Driver Documents

- Driver lee propios.
- Driver no puede crear registro auto-VERIFIED.
- preferentemente no puede INSERT directo en Fase 1.

### Driver Presence

- Driver lee propio state.
- direct current_location UPDATE = DENY.
- direct location_updated_at UPDATE = DENY.
- direct operational_state UPDATE = DENY en Fase 1.

Todos deben ejecutarse realmente con contexto:

```text
authenticated
auth.uid()
```

No simular seguridad únicamente verificando que una policy existe.

---

# 14. Database types son incorrectos/stale

El archivo actual:

```text
packages/types/src/database.generated.ts
```

solo contiene:

```text
profiles
businesses
drivers
```

pero las migrations crean 9 tablas.

También faltan columnas reales.

Esto demuestra que el archivo NO corresponde al schema local actual.

## Corrección

Después de:

```text
supabase db reset
```

ejecutar:

```text
pnpm db:types
```

El archivo generado debe contener todas las foundation tables:

```text
profiles
businesses
business_members
business_member_locations
business_locations
drivers
driver_documents
vehicles
driver_presence
```

No editarlo manualmente.

## CI drift check

Agregar después de DB reset:

```text
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

Resultado:

```text
generated DB types drift = 0
```

---

# ============================================================

# PARTE E — DOMAIN / TYPESCRIPT

# ============================================================

# 15. Completar constantes canónicas

`@gueguense/domain` contiene muchas constantes correctas, pero no todo el diccionario aprobado.

Completar desde:

```text
docs/21_CANONICAL_ENUMS.md
```

incluyendo como mínimo:

```text
BUSINESS_MEMBER_STATUS
DOCUMENT_VERIFICATION_STATUS
PAYOUT_METHOD_VERIFICATION_STATUS
TRACKING_FRESHNESS
PROOF_TYPE
EVENT_TYPE
```

y cualquier auxiliar canónico ausente.

Agregar tests:

```text
ningún array contiene duplicados
terminal delivery statuses ⊂ DELIVERY_STATUSES
OTP_ALLOWED_STATES ⊂ DELIVERY_STATUSES
```

No implementar todavía la State Machine completa.

---

# 16. TypeScript strict mobile

Los packages y web heredan `tsconfig.base.json`, pero las apps Expo solo declaran:

```text
strict = true
```

Agregar explícitamente en ambos tsconfig móviles:

```text
noUncheckedIndexedAccess = true
exactOptionalPropertyTypes = true
noImplicitReturns = true
noFallthroughCasesInSwitch = true
```

o una solución compatible que conserve `expo/tsconfig.base`.

No bajar strictness para hacer pasar builds.

---

# ============================================================

# PARTE F — SUPABASE CLIENTS / WEB

# ============================================================

# 17. Mobile Supabase client

Eliminar fallbacks silenciosos:

```text
placeholder-anon-key
```

No debe existir una app que parezca funcionar con credenciales inválidas.

Crear factory segura que:

- use solo `EXPO_PUBLIC_SUPABASE_URL`;
- use solo `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`;
- no contenga secret key;
- valide las variables cuando el factory sea utilizado;
- no obligue al boot screen de Fase 1 a conectarse.

Persistencia real de sesión puede esperar a la fase Auth.

---

# 18. Admin Web — preparar Supabase SSR de verdad

Actualmente solo están instalados los packages.

Crear estructura mínima siguiendo la documentación oficial vigente, por ejemplo:

```text
src/lib/supabase/client.ts
src/lib/supabase/server.ts
```

Requisitos:

```text
browser client usa publishable key
server client sigue patrón oficial SSR/cookies de Next 16
NO service/secret key para la sesión normal del usuario
```

No implementar Login todavía.

Tracking Web continúa SIN cliente Supabase directo.

---

# ============================================================

# PARTE G — CI

# ============================================================

# 19. CI: usar una sola Supabase CLI

Eliminar la duplicación:

```text
project-local Supabase CLI
+
supabase/setup-cli con otra versión
```

Usar la CLI exacta fijada en `package.json`.

Agregar:

```text
pnpm supabase --version
```

al reporte/job si ayuda.

---

# 20. CI Database job

Secuencia mínima:

```text
pnpm install --frozen-lockfile
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
git diff --exit-code packages/types/src/database.generated.ts
pnpm supabase:stop
```

`stop` debe ejecutarse con `if: always()` o equivalente.

No afirmar que migrations fueron testeadas si no se ejecutó `db reset`.

---

# 21. CI Mobile gates

Agregar job o steps para AMBAS apps:

```text
expo config
expo install --check
expo-doctor
typecheck
lint
expo export --platform android
```

Outputs de export deben ir a path temporal/ignorado.

El CI actual puede pasar aunque las apps móviles sean incompatibles porque `turbo build` solo compila las apps Next.

Esto debe corregirse.

---

# 22. CI Web gates

Mantener:

```text
admin-web build
tracking-web build
```

con Next 16.

Lint no debe emitir warning de Next plugin ausente.

---

# ============================================================

# PARTE H — REPO HYGIENE

# ============================================================

# 23. Secret scan

Mantener búsqueda de:

```text
sb_secret_
service_role
sk_live_
sk_test_
ghp_
PRIVATE KEY
BEGIN RSA
```

Los strings de ejemplos/documentación no son secretos reales, pero el agente debe diferenciar:

```text
placeholder/reference
vs
valor secreto real
```

Resultado final:

```text
Secretos reales detectados: 0
```

---

# 24. Git hygiene

Antes de push:

```text
Tracked .turbo files: 0
Tracked .next files: 0
Tracked .expo files: 0
Tracked node_modules: 0
Nested lockfiles: 0
```

Un solo:

```text
pnpm-lock.yaml
```

en root.

---

# ============================================================

# PARTE I — PROHIBICIONES

# ============================================================

NO implementar:

```text
Dispatch real
Delivery State Machine DB
OTP real
GPS ingestion real
Tracking live real
Maps Routes calls
Push
Pricing
Ledger
Payments
Payout processing real
Admin dashboard
Customer flow
Catalog
```

Solo reparar Fase 1.

NO merge a `main`.

NO iniciar Fase 2.

---

# ============================================================

# PARTE J — SECUENCIA DEL AGENTE

# ============================================================

1. Permanecer en `phase/1-foundation`.
2. Verificar HEAD/working tree.
3. Corregir toolchain.
4. Corregir Expo 57 con tooling oficial.
5. Corregir Next 16.
6. Limpiar `.turbo`.
7. Corregir migrations Foundation.
8. Corregir RLS.
9. Ejecutar `supabase db reset`.
10. Expandir pgTAP con tests conductuales.
11. Ejecutar pgTAP.
12. Regenerar Database Types.
13. Completar domain constants.
14. Corregir mobile strict TS.
15. Preparar Supabase factories.
16. Corregir CI.
17. Ejecutar todos los gates.
18. Ejecutar secret/git hygiene.
19. Actualizar README/Roadmap a Fase 1 candidata.
20. Commit + push en `phase/1-foundation`.
21. DETENERSE.

---

# ============================================================

# PARTE K — QUALITY GATES OBLIGATORIOS

# ============================================================

El agente debe ejecutar y reportar comando + exit code.

Como mínimo:

```text
node --version
pnpm --version

pnpm install --frozen-lockfile

pnpm format:check
pnpm lint
pnpm typecheck
pnpm test

business-mobile expo config
business-mobile expo install --check
business-mobile expo-doctor
business-mobile expo export --platform android

driver-mobile expo config
driver-mobile expo install --check
driver-mobile expo-doctor
driver-mobile expo export --platform android

admin-web next build
tracking-web next build

pnpm supabase --version
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
pnpm supabase:stop
```

Si un comando no se ejecutó:

```text
NOT_EXECUTED
```

No convertirlo en PASS.

---

# ============================================================

# PARTE L — CHECKS DE SEGURIDAD OBLIGATORIOS

# ============================================================

Debe demostrar mediante tests:

```text
Profile role escalation: DENIED
Cross-business read: DENIED
business_members RLS recursion: NONE
Employee unassigned location: DENIED
Owner business locations: ALLOWED
Driver verification self-change: DENIED
Driver document self-verification: DENIED
Driver direct GPS update: DENIED
Driver direct operational_state update: DENIED
private schema client access: DENIED
```

---

# ============================================================

# PARTE M — DEFINITION OF DONE FASE 1 v1.1

# ============================================================

Fase 1 vuelve a auditoría cuando:

- [ ] Node 24.18.0 LTS está fijado de forma consistente.
- [ ] pnpm 11 estable real está fijado exactamente.
- [ ] Turbo está fijado exactamente.
- [ ] Supabase CLI está fijada exactamente.
- [ ] CI y local usan la misma Supabase CLI.
- [ ] Expo SDK 57 usa React Native 0.86.
- [ ] Expo SDK 57 usa React 19.2.3.
- [ ] Expo Router está alineado a SDK 57.
- [ ] `expo install --check` pasa en ambas apps.
- [ ] `expo-doctor` pasa en ambas apps.
- [ ] Metro/Expo export smoke pasa en ambas apps.
- [ ] No hay paths de assets inexistentes.
- [ ] Next.js 16.x estable está en ambas webs.
- [ ] Next ESLint config está correcta.
- [ ] `.turbo` tracked = 0.
- [ ] profile platform_role escalation está cerrada.
- [ ] business_members no tiene RLS recursiva.
- [ ] business tenancy tests pasan.
- [ ] location scope tests pasan.
- [ ] driver_documents no permite auto-verificación.
- [ ] driver_presence no permite update directo.
- [ ] Foundation schema coincide con docs.
- [ ] Constraints/indexes críticos existen.
- [ ] pgTAP contiene tests positivos y negativos.
- [ ] `supabase db reset` pasa desde cero.
- [ ] `supabase test db` pasa.
- [ ] database.generated.ts contiene las 9 tablas Foundation.
- [ ] DB generated types drift = 0.
- [ ] domain constants cubren Canonical Enums base.
- [ ] mobile TypeScript mantiene strict flags acordados.
- [ ] Mobile Supabase no usa placeholder key silenciosa.
- [ ] Admin Supabase SSR factories existen.
- [ ] Tracking Web no usa Supabase directo.
- [ ] CI contiene mobile gates.
- [ ] CI database job ejecuta reset.
- [ ] CI web builds pasan.
- [ ] Secretos reales detectados = 0.
- [ ] Nested lockfiles = 0.
- [ ] Tracked caches/build outputs = 0.
- [ ] No scope creep a Fase 2.
- [ ] README/Roadmap: Fase 1 candidata, NO aprobada.
- [ ] Agente hace push y se detiene.
- [ ] Cerebro revisa el contenido real.

---

# ============================================================

# PARTE N — REPORTE FINAL DEL AGENTE

# ============================================================

Entregar:

## A. Branch / HEAD

```text
branch:
HEAD:
```

## B. Version matrix

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
Supabase CLI:
```

## C. Cambios de seguridad

Explicar:

```text
profiles
business RLS
driver_documents
driver_presence
```

## D. Schema

Listar las 9 tablas Foundation y divergencias corregidas.

## E. Database Types

```text
Foundation tables in generated types: 9/9
Generated types drift: 0
```

## F. Tests / comandos

Tabla:

```text
Command | Exit Code | PASS/FAIL/NOT_EXECUTED
```

## G. Hygiene

```text
Tracked .turbo: 0
Tracked build caches: 0
Nested lockfiles: 0
Real secrets: 0
```

## H. Deviations

Cualquier desviación de este documento debe explicarse.

## I. Estado

Terminar exactamente:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENERSE.

NO comenzar Fase 2.

---

# FIN DEL PAQUETE ÚNICO — FASE 1 CORRECCIÓN v1.1
