# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CIERRE FINAL DB TYPES v1.9

**Tipo:** Micro-parche final de reproducibilidad  
**Branch:** `phase/1-foundation`  
**Commit auditado:** `2a79bb45ad3165f33a38d990fd1af72d730cfe61`  
**Workflow auditado:** `31628420174`  
**Estado:** ❌ FASE 1 NO APROBADA TODAVÍA  
**Regla:** NO iniciar Fase 2. NO mergear a `main`. NO tocar RLS, migrations, lockfile ni toolchain.

---

# 1. VEREDICTO REAL

GitHub Actions terminó:

```text
✅ Code Quality & Monorepo Gates
✅ Mobile Apps SDK 57 & Metro Export Gates
❌ Supabase Foundation DB & pgTAP RLS Gates
```

Dentro del job Database:

```text
✅ pnpm install --frozen-lockfile
✅ Supabase CLI 2.110.0
✅ supabase start
✅ supabase db reset
✅ pgTAP 60/60
❌ Generated DB Types Drift
✅ supabase stop
```

La seguridad Foundation ya está validada.

El único bloqueo restante es:

```text
packages/types/src/database.generated.ts
```

no coincide exactamente con lo que produce en CI:

```bash
pnpm db:types
```

---

# 2. CAUSA COMPROBADA

El script correcto YA está en el repo:

```json
"db:types": "supabase gen types typescript --local --schema public > packages/types/src/database.generated.ts"
```

No cambiarlo.

El archivo committed fue generado con una salida distinta a la del CLI real usado por CI.

El CI con Supabase CLI `2.110.0` genera diferencias concretas como:

```text
driver_presence.current_location:
committed → unknown | null
CI real   → unknown

public.handle_new_user:
committed → aparece en Functions
CI real   → no aparece

helper types:
committed → formato PublicSchema anterior
CI real   → DatabaseWithoutInternals / DefaultSchema / Constants
```

Por tanto el problema NO es el schema ni las migrations.

El problema es que el archivo committed no fue tomado literalmente de la ejecución canónica de Supabase CLI 2.110.0 sobre un stack limpio equivalente al de CI.

---

# 3. CORRECCIÓN ÚNICA

Trabajar SOLO en:

```text
phase/1-foundation
```

Primero confirmar:

```bash
pnpm supabase --version
```

Debe imprimir exactamente:

```text
2.110.0
```

Si no imprime 2.110.0:

```text
DETENERSE
```

No usar una instalación global de Supabase CLI.

---

# 4. REGENERAR DESDE UN STACK LIMPIO

Detener/eliminar cualquier stack local viejo de Supabase que pueda conservar estado.

Ejecutar desde el root del repo:

```bash
pnpm supabase:stop
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
```

No editar:

```text
packages/types/src/database.generated.ts
```

a mano.

No pasar Prettier sobre el archivo generado.

No reponer manualmente:

```text
| null
handle_new_user
PublicSchema
```

si el CLI 2.110.0 no los genera.

La salida de:

```bash
pnpm db:types
```

es la única fuente de verdad.

---

# 5. DRIFT GATE LOCAL REAL

Después de generar el archivo:

```bash
git add packages/types/src/database.generated.ts package.json
git diff --cached -- packages/types/src/database.generated.ts
```

Después ejecutar otra vez:

```bash
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

Debe terminar:

```text
exit code 0
Generated DB Types Drift: 0
```

Si vuelve a modificar el archivo:

```text
NO PUSH
```

---

# 6. CLEAN REPRODUCIBILITY CHECK

Antes del push, hacer la prueba en un checkout/worktree limpio del commit candidato.

Ejemplo:

```bash
git worktree add ../gueguense-types-check HEAD
cd ../gueguense-types-check

pnpm install --frozen-lockfile
pnpm supabase --version
pnpm supabase:start
pnpm supabase:reset
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
pnpm supabase:stop
```

Requisitos:

```text
Supabase CLI: 2.110.0
DB Types Drift: 0
```

Esta prueba es obligatoria.

---

# 7. FOUNDATION TYPES

El archivo final debe conservar las 9 tablas públicas Foundation:

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

Resultado:

```text
Foundation public tables: 9/9
```

No editar tipos manualmente para conseguir 9/9.

---

# 8. GATES

Ejecutar:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Luego DB:

```bash
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

Resultados:

```text
Quality: PASS
pgTAP: 60/60 PASS
Generated Types Drift: 0
```

---

# 9. NO CAMBIAR

NO modificar:

```text
pnpm-lock.yaml
package versions
Supabase CLI version
RLS
GRANTs
private helpers
Foundation migrations
pgTAP behavior tests
Expo
Next
```

El script `db:types` con:

```text
--schema public
```

YA es correcto.

Solo hay que sincronizar literalmente el archivo generado con la salida reproducible del CLI pinned.

---

# 10. PUSH Y CI

Commit sugerido:

```text
fix(types): sync generated public schema types with pinned supabase cli
```

Push SOLO a:

```text
phase/1-foundation
```

Esperar GitHub Actions.

Debe quedar:

```text
✅ Code Quality & Monorepo Gates
✅ Mobile Apps SDK 57 & Metro Export Gates
✅ Supabase Foundation DB & pgTAP RLS Gates
```

Dentro del Database job deben pasar:

```text
✅ Reset Database
✅ pgTAP 60/60
✅ Verify Database Types Sync Drift
```

---

# 11. REPORTE FINAL OBLIGATORIO

```text
Branch:
Final SHA:
GitHub Actions Run URL:

Quality:
Mobile:
Database:

Supabase CLI:
pgTAP:
Foundation public tables:
Generated DB Types Drift:

Clean worktree:
  pnpm frozen install:
  Supabase CLI:
  db reset:
  db types:
  drift:
```

Terminar:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

y DETENERSE.

NO iniciar Fase 2.
NO mergear a main.

---

# 12. CRITERIO DEL CEREBRO

Si el siguiente commit confirma:

```text
Quality GREEN
Mobile GREEN
Database GREEN
pgTAP 60/60
Generated DB Types Drift 0
```

entonces:

```text
✅ FASE 1 — APROBADA
```

y se autoriza preparar la Fase 2.

No abrir otra ronda por mejoras opcionales.

---

# FIN — FASE 1 CIERRE FINAL DB TYPES v1.9
