# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CIERRE v1.5

**Tipo:** Micro-parche final de cierre y verificación reproducible  
**Base auditada:** `gueguenseapp-phase-1-foundation(3).zip`  
**Fase:** FASE 1 — FUNDACIÓN Y ESTRUCTURA CORE  
**Estado:** ❌ FASE 1 NO APROBADA AÚN  
**Regla:** Corregir únicamente los bloqueos comprobados de este documento. NO comenzar Fase 2. NO mergear a `main`.

---

# PARTE A — VEREDICTO DEL CEREBRO

La v1.4 resolvió casi todo el checklist estructural.

## PASS confirmados en el ZIP

```text
Node.js                         24.18.0
pnpm manifest/CI                11.17.0
Turbo manifest                  2.10.7
Supabase CLI manifest           2.110.0
Next.js                         16.2.12
eslint-config-next              16.2.12
Expo SDK                        57
React Native                    0.86.2
React                           19.2.3
Expo Doctor                     1.20.1

Expo install exclude            0
CI expo install --check         PRESENTE
CI Expo Doctor                  PRESENTE
CI Android export               PRESENTE

Invalid UUID fixtures           0
pgTAP plan                      58
pgTAP static assertions         58
Plan mismatch                   0

Foundation DB Types             9/9

Tracked .turbo                  0
Tracked .next                   0
Tracked .expo                   0
Tracked node_modules            0
Nested pnpm-lock.yaml           0

profiles direct UPDATE          DENY
drivers direct UPDATE           DENY
driver_documents write          DENY
driver_presence direct UPDATE   DENY

Business bidirectional test     PRESENTE
Owner/Employee location tests   PRESENTES
Driver own/cross read tests     PRESENTES
Driver persistence tests        PRESENTES
Driver document own/cross       PRESENTES
Driver presence 3 denies        PRESENTES
```

No volver a modificar esos componentes salvo que sea estrictamente necesario para cerrar los tres bloqueos siguientes.

---

# PARTE B — BLOQUEO CRÍTICO 1: `pnpm-lock.yaml` NO PROVIENE DEL REGISTRY REAL

## 1. Hallazgo comprobado

Aunque los MANIFESTS contienen correctamente las versiones congeladas principales, el `pnpm-lock.yaml` contiene resoluciones de paquetes que el registry público estable no respalda en el momento de esta auditoría.

Ejemplos detectados:

```text
LOCKFILE:
@supabase/supabase-js  2.112.2
postcss                8.5.26
tsx                    4.23.12
```

En la auditoría del Cerebro, el registry público muestra actualmente como releases publicadas:

```text
@supabase/supabase-js  2.110.9
postcss                8.5.25 o inferior según propagación del registry
tsx                    4.22.5
```

El punto importante NO es congelar esos tres números para siempre.

El punto importante es:

```text
un `pnpm install --frozen-lockfile` real debe poder descargar TODAS las
versiones presentes en pnpm-lock.yaml desde el registry.
```

El lockfile actual no satisface esa condición de manera verificable.

## 1.1 Prohibición absoluta

NO:

```text
editar pnpm-lock.yaml manualmente
inventar versiones
inventar integrity hashes
generar YAML con una IA
copiar un lockfile de un entorno ficticio
```

## 1.2 Procedimiento obligatorio

En una máquina con acceso REAL a `registry.npmjs.org`:

```bash
corepack prepare pnpm@11.17.0 --activate
pnpm --version
```

Debe ser:

```text
11.17.0
```

Eliminar SOLO el lockfile:

```bash
rm pnpm-lock.yaml
```

NO modificar las versiones congeladas siguientes:

```text
Node                 24.18.0
pnpm                 11.17.0
Turbo                2.10.7
Supabase CLI         2.110.0
Next                 16.2.12
eslint-config-next   16.2.12
Expo Doctor          1.20.1
React                19.2.3
React Native         0.86.2
Expo SDK             57
```

Después ejecutar REALMENTE:

```bash
pnpm install
```

El NUEVO `pnpm-lock.yaml` debe ser exclusivamente el producido por pnpm.

Luego:

```bash
pnpm install --frozen-lockfile
```

Debe terminar:

```text
exit code 0
```

## 1.3 Validación del lockfile

Después del install real:

```bash
pnpm why @supabase/supabase-js
pnpm why postcss
pnpm why tsx
```

Reportar las versiones que pnpm instaló realmente.

No forzar esas versiones a mano salvo que exista una incompatibilidad real.

## 1.4 Verificación directa con npm

Para cualquier versión dudosa del lockfile usar:

```bash
npm view <package>@<version> version
```

Ejemplos:

```bash
npm view @supabase/supabase-js@<LOCK_VERSION> version
npm view postcss@<LOCK_VERSION> version
npm view tsx@<LOCK_VERSION> version
```

Si npm devuelve:

```text
E404 / version not found
```

esa versión NO puede permanecer en el lockfile.

## 1.5 Clean install

Crear un clon/directorio temporal LIMPIO del commit candidato.

Ejecutar:

```bash
corepack prepare pnpm@11.17.0 --activate
pnpm install --frozen-lockfile
```

Resultado obligatorio:

```text
Clean frozen install: PASS
```

Este resultado debe provenir de una ejecución real.

---

# PARTE C — BLOQUEO DE SEGURIDAD 2: EL TEST DE PRIVATE SCHEMA USA UNA FUNCIÓN INEXISTENTE

## 2. Hallazgo

El test actual contiene:

```sql
SELECT private.get_user_business_ids(...)
```

pero esa función NO existe en las migrations de Foundation.

Los helpers reales son:

```text
private.is_active_business_member(UUID)
private.can_access_business_location(UUID)
```

Por tanto, el test actual no demuestra explícitamente que un cliente no pueda invocar los helpers REALES.

## 2.1 Corrección

Eliminar el test contra:

```text
private.get_user_business_ids
```

y reemplazarlo por una invocación directa de un helper REAL.

Por ejemplo:

```sql
SELECT throws_ok(
  'SELECT private.is_active_business_member(''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa''::uuid)',
  '42501',
  NULL,
  'Authenticated client cannot directly invoke private.is_active_business_member'
);
```

Si PostgreSQL/Supabase produce otro SQLSTATE de privilegio en el entorno real, usar el SQLSTATE REAL y documentarlo.

Agregar también, si no aumenta innecesariamente la suite:

```sql
SELECT throws_ok(
  'SELECT private.can_access_business_location(''a1000000-0000-4000-8000-000000000001''::uuid)',
  '42501',
  NULL,
  'Authenticated client cannot directly invoke private.can_access_business_location'
);
```

Al mismo tiempo deben seguir pasando las queries RLS de:

```text
businesses
business_locations
business_members
business_member_locations
```

Esto demuestra la propiedad buscada:

```text
helpers privados funcionan dentro de policies
+
cliente no los puede invocar directamente
```

NO conceder `USAGE` global a `private`.

---

# PARTE D — BLOQUEO DE COBERTURA 3: FALTA OUTSIDER B → BUSINESS_MEMBER_LOCATIONS DE BUSINESS A

La suite ya prueba:

```text
Employee A no ve assignment de Business B
```

Agregar la dirección inversa requerida.

Como:

```text
Outsider/Owner B
```

ejecutar:

```text
SELECT sobre business_member_locations de Business A
```

y verificar:

```text
0 rows
```

Resultado requerido:

```text
Business Member Locations A→B: DENIED
Business Member Locations B→A: DENIED
```

No cambiar la policy salvo que el test real revele una vulnerabilidad.

---

# PARTE E — DOCUMENTACIÓN: TYPESCRIPT REAL POR WORKSPACE

El README/Roadmap dicen únicamente:

```text
TypeScript 5.8.2
```

pero las apps móviles declaran actualmente:

```text
typescript ~6.0.3
```

Esto NO requiere volver a cambiar Expo.

Documentar la matriz REAL:

```text
TypeScript root/web/shared: 5.8.2
TypeScript Expo mobile:     6.0.3
```

si `expo install --check` confirma esa versión como compatible.

Si Expo cambia la versión durante `expo install --fix`, documentar la versión REAL finalmente instalada.

No utilizar `expo.install.exclude`.

---

# PARTE F — RUNTIME GATES: LA APROBACIÓN NECESITA EVIDENCIA REAL

La auditoría estática del ZIP no puede ejecutar Docker/Supabase local ni descargar npm packages en el entorno del Cerebro.

Por ello, esta ronda debe dejar evidencia verificable de que los gates se ejecutaron realmente.

## 6.1 Local

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

Mobile:

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

## 6.2 GitHub Actions obligatorio

Después del push del commit final, esperar el workflow:

```text
CI Quality & Security Gates
```

Los tres jobs deben estar VERDES:

```text
Code Quality & Monorepo Gates          PASS
Mobile Apps SDK 57 & Metro Export     PASS
Supabase Foundation DB & pgTAP RLS    PASS
```

Si uno falla:

```text
NO solicitar aprobación todavía.
```

Corregir únicamente el fallo de Fase 1, hacer push y esperar otro run.

## 6.3 Evidencia que debe entregar el Agente

En su respuesta final incluir:

```text
Final commit SHA
GitHub Actions run URL
Quality job: PASS
Mobile job: PASS
Database job: PASS
```

Si el agente no puede consultar el estado de Actions:

```text
ACTIONS_STATUS_UNKNOWN
```

y el usuario deberá adjuntar una captura del workflow verde junto al próximo ZIP.

NO inventar una URL ni un PASS.

---

# PARTE G — DB TYPES

Mantener:

```text
Foundation Tables: 9/9
```

Después del `supabase db reset` real:

```bash
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

Debe dar:

```text
Generated DB Types Drift: 0
```

Si cambia el archivo:

1. aceptar únicamente la salida real del CLI;
2. commitearla;
3. repetir reset/types/drift.

No editar generated types manualmente.

---

# PARTE H — pgTAP

Después de agregar los tests de esta v1.5:

1. volver a contar assertions;
2. ajustar `plan(N)` al total REAL;
3. ejecutar `pnpm supabase:test`.

Resultado obligatorio:

```text
plan = assertions reales
Result: PASS
```

No mantener `plan(58)` automáticamente si el número cambió.

---

# PARTE I — LO YA APROBADO ESTÁTICAMENTE NO DEBE REGRESAR

Mantener:

```text
Expo SDK 57
React Native 0.86.2
React 19.2.3

No expo.install.exclude

profiles direct UPDATE = DENY
drivers direct UPDATE = DENY
driver_documents INSERT/UPDATE = DENY
driver_presence UPDATE = DENY

Foundation DB types = 9/9

Tracked .turbo = 0
Tracked .next = 0
Tracked .expo = 0
Tracked node_modules = 0
Nested lockfiles = 0
Real secrets = 0
```

---

# PARTE J — PROHIBIDO

NO:

```text
iniciar Fase 2
crear Auth UI
crear onboarding funcional
crear Deliveries
crear Dispatch
crear OTP
crear Tracking Live
crear GPS ingestion productivo
crear Pricing
crear Ledger
crear Payments/Payouts
hacer merge a main
```

Permanecer en:

```text
phase/1-foundation
```

---

# PARTE K — DEFINITION OF DONE v1.5

La siguiente revisión es de CIERRE.

- [ ] `pnpm-lock.yaml` fue regenerado por pnpm real.
- [ ] no fue editado manualmente.
- [ ] `pnpm install --frozen-lockfile` pasa en clon limpio.
- [ ] todas las versiones del lock consultadas existen en npm.
- [ ] no queda `@supabase/supabase-js@2.112.2` si npm no publica esa versión.
- [ ] no queda `postcss@8.5.26` si npm no publica esa versión.
- [ ] no queda `tsx@4.23.12` si npm no publica esa versión.
- [ ] versiones principales congeladas v1.4 se mantienen.
- [ ] test private schema usa helper REAL.
- [ ] direct invocation del helper REAL = DENIED.
- [ ] helpers privados siguen funcionando dentro de RLS policies.
- [ ] business_member_locations A→B = DENIED.
- [ ] business_member_locations B→A = DENIED.
- [ ] pgTAP plan coincide con assertions.
- [ ] `supabase db reset` = PASS.
- [ ] `supabase test db` = PASS.
- [ ] DB types = 9/9.
- [ ] generated types drift = 0.
- [ ] Expo checks = PASS en ambas apps.
- [ ] Next lint/build = PASS.
- [ ] quality gates = PASS.
- [ ] mobile gates = PASS.
- [ ] database gates = PASS.
- [ ] GitHub Actions final commit = VERDE.
- [ ] README/Roadmap documentan TypeScript root/web y mobile reales.
- [ ] caches tracked = 0.
- [ ] nested lockfiles = 0.
- [ ] real secrets = 0.
- [ ] no Fase 2.
- [ ] no merge a main.

Si todo esto pasa y no aparece una vulnerabilidad crítica REAL:

```text
✅ FASE 1 APROBADA
```

No crear otra ronda por mejoras opcionales.

---

# PARTE L — PROMPT OPERATIVO PARA EL AGENTE

Eres el Agente Senior de Ejecución de Güegüense.

El Cerebro auditó directamente el ZIP actual de `phase/1-foundation`.

Debes hacer SOLO este cierre v1.5.

## Orden

1. Permanecer en `phase/1-foundation`.
2. Verificar working tree.
3. Regenerar el lockfile usando pnpm REAL y registry REAL.
4. Ejecutar clean frozen install.
5. Corregir el test del private helper inexistente.
6. Añadir BML cross-tenant inverso.
7. Ajustar `plan(N)`.
8. Ejecutar Supabase reset + pgTAP.
9. Regenerar DB types + drift.
10. Ejecutar Expo gates.
11. Ejecutar lint/typecheck/test/build.
12. Actualizar README/Roadmap con TypeScript real por workspace.
13. Ejecutar hygiene/secret scan.
14. Push a `phase/1-foundation`.
15. Esperar GitHub Actions del commit final.
16. Si algún job falla, corregir solo ese fallo y repetir.
17. Cuando los 3 jobs estén verdes, entregar reporte.
18. DETENERSE.

NO comenzar Fase 2.
NO mergear a main.

---

# PARTE M — REPORTE FINAL OBLIGATORIO

## A. Branch / Commit

```text
Branch:
Final SHA:
GitHub Actions Run:
```

## B. Runtime versions

```text
Node:
pnpm:
Turbo:
Supabase CLI:
Next:
Expo:
React Native:
React:
TypeScript root/web:
TypeScript mobile:
```

## C. Real lock verification

```text
Lockfile manually edited: NO
Lockfile regenerated with pnpm: YES
Clean frozen install: PASS

Resolved @supabase/supabase-js:
Resolved postcss:
Resolved tsx:
```

## D. Security

```text
Real private helper direct invocation: DENIED
Private helper through RLS policy: PASS
BML A→B: DENIED
BML B→A: DENIED
```

## E. pgTAP

```text
Plan:
Assertions:
Plan mismatch: 0
supabase db reset: PASS
supabase test db: PASS
```

## F. DB Types

```text
Foundation tables: 9/9
Generated drift: 0
```

## G. CI

```text
Quality job:
Mobile job:
Database job:
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

# FIN — FASE 1 CIERRE v1.5
