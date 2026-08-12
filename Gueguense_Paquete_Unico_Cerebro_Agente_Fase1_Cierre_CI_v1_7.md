# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CIERRE CI v1.7

**Tipo:** Corrección mínima basada en fallo real de GitHub Actions  
**Branch:** `phase/1-foundation`  
**Commit auditado:** `9df55657bceffb6a73f87fc09e6791c95a93dd69`  
**Workflow auditado:** `31624792239`  
**Estado:** ❌ FASE 1 NO APROBADA TODAVÍA  
**Regla:** NO iniciar Fase 2. NO mergear a `main`. NO cambiar toolchain ni lockfile.

---

# 1. VEREDICTO REAL DE CI

GitHub Actions terminó así:

```text
✅ Code Quality & Monorepo Gates
✅ Mobile Apps SDK 57 & Metro Export Gates
❌ Supabase Foundation DB & pgTAP RLS Gates
```

El error real es:

```text
ERROR: permission denied for table profiles
```

La falla ocurre al ejecutar, bajo `ROLE authenticated`, la primera consulta conductual:

```sql
SELECT id
FROM public.profiles
WHERE id = '11111111-1111-1111-1111-111111111111';
```

Esto demuestra que las policies RLS existen, pero el rol `authenticated` no tiene privilegio SQL base `SELECT` sobre las tablas.

RLS NO sustituye los privilegios GRANT.

---

# 2. CAUSA

Las migrations crean policies SELECT para:

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

pero no conceden explícitamente `SELECT` sobre esas tablas a `authenticated`.

Por eso PostgreSQL rechaza la consulta ANTES de evaluar RLS.

---

# 3. CORRECCIÓN OBLIGATORIA — PRIVILEGIOS MÍNIMOS

Como Fase 1 todavía no está merged ni desplegada en producción, corregir las migrations Foundation existentes.

Agregar:

```sql
GRANT SELECT ON TABLE
    public.profiles,
    public.businesses,
    public.business_members,
    public.business_locations,
    public.business_member_locations
TO authenticated;
```

y:

```sql
GRANT SELECT ON TABLE
    public.drivers,
    public.driver_documents,
    public.vehicles,
    public.driver_presence
TO authenticated;
```

NO conceder:

```text
INSERT
UPDATE
DELETE
TRUNCATE
REFERENCES
TRIGGER
ALL
```

a `authenticated`.

NO conceder acceso a `anon`.

RLS continúa siendo la segunda barrera que filtra las filas.

---

# 4. TESTS DE ESCRITURA DENEGADA

Después de conceder únicamente `SELECT`, los intentos directos de:

```text
UPDATE profiles
UPDATE drivers
UPDATE driver_presence
INSERT driver_documents
```

deben fallar por falta de privilegio de escritura.

Por tanto, las assertions negativas de mutación que actualmente usan:

```sql
is_empty('UPDATE ... RETURNING ...')
```

deben convertirse a `throws_ok(...)` con SQLSTATE real de `insufficient_privilege` (normalmente `42501`), por ejemplo:

```sql
SELECT throws_ok(
  'UPDATE public.profiles
      SET platform_role = ''super_admin''
    WHERE id = ''11111111-1111-1111-1111-111111111111''',
  '42501',
  NULL,
  'Authenticated user cannot directly UPDATE profiles'
);
```

Aplicar el mismo patrón a:

```text
drivers.verification_status
drivers.account_status
driver_presence.current_location
driver_presence.location_updated_at
driver_presence.operational_state
```

El test de `driver_documents INSERT` debe continuar usando `throws_ok` si ya está correcto.

Conservar las comprobaciones posteriores bajo `postgres` que demuestran que los valores críticos no cambiaron.

---

# 5. PLAN pgTAP

Si se sustituyen assertions una por una:

```text
plan(60)
```

se mantiene.

Antes de ejecutar:

```text
plan(N) == assertions reales N
```

No cambiar el plan para ocultar fallos.

---

# 6. NO CAMBIAR

NO cambiar:

```text
Node / pnpm / Turbo / Next / Expo / Supabase CLI
pnpm-lock.yaml
private helpers
RLS tenancy rules
schema de tablas
generated DB types manualmente
```

NO conceder UPDATE/INSERT para “hacer pasar” tests.

La solución correcta es:

```text
GRANT SELECT mínimo
+
RLS para filtrar filas
+
sin privilegios de escritura directa
```

---

# 7. GATES OBLIGATORIOS

Ejecutar:

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
pnpm supabase:stop
```

Resultado obligatorio:

```text
DB reset: PASS
pgTAP: 60/60 PASS
Foundation DB Types: 9/9
Generated drift: 0
```

Luego:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Push SOLO a:

```text
phase/1-foundation
```

---

# 8. GITHUB ACTIONS — FUENTE DE VERDAD FINAL

Esperar el workflow del nuevo commit.

Debe quedar:

```text
✅ Code Quality & Monorepo Gates
✅ Mobile Apps SDK 57 & Metro Export Gates
✅ Supabase Foundation DB & pgTAP RLS Gates
```

Si Database vuelve a fallar:

```text
NO declarar Fase 1 terminada.
```

Entregar el SHA y detenerse para que el Cerebro lea el log real.

---

# 9. REPORTE FINAL

```text
Branch:
Final SHA:
GitHub Actions Run URL:

Quality:
Mobile:
Database:

DB reset:
pgTAP planned:
pgTAP executed:
pgTAP passed:
DB types:
Generated drift:

authenticated SELECT grants:
authenticated INSERT grants:
authenticated UPDATE grants:
authenticated DELETE grants:
```

Valores esperados:

```text
authenticated SELECT grants: 9 Foundation tables
authenticated INSERT grants: 0
authenticated UPDATE grants: 0
authenticated DELETE grants: 0
```

Terminar:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

y DETENERSE.

NO iniciar Fase 2.
NO mergear a main.

---

# FIN — FASE 1 CIERRE CI v1.7
