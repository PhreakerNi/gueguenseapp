# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CIERRE REAL v1.6

**Tipo:** Corrección exacta basada en GitHub Actions real  
**Branch auditado:** `phase/1-foundation`  
**Commit auditado:** `9aed957168f85f16ed90e67eae0a4b9c3987307c`  
**GitHub Actions Run:** `31619438050`  
**Estado:** ❌ FASE 1 NO APROBADA TODAVÍA  
**Alcance:** corregir únicamente el fallo real del job DB y volver a ejecutar CI.  
**Prohibido:** iniciar Fase 2, mergear a `main`, cambiar toolchain, regenerar lockfile sin necesidad, rediseñar RLS.

---

# 1. VEREDICTO DEL CEREBRO

El Cerebro ya tiene acceso directo al repositorio y a GitHub Actions.

La auditoría del commit `9aed957` confirma:

```text
Code Quality & Monorepo Gates       ✅ PASS
Mobile Apps SDK 57 & Metro Export   ✅ PASS
Supabase Foundation DB & pgTAP RLS  ❌ FAIL
```

El fallo NO es el lockfile.

GitHub Actions demostró que:

```text
pnpm 11.17.0 fue instalado correctamente
pnpm install --frozen-lockfile terminó correctamente
863 paquetes fueron descargados desde el registry
Supabase CLI 2.110.0 ejecutó correctamente
supabase start terminó correctamente
supabase db reset terminó correctamente
las 3 migrations Foundation se aplicaron correctamente
```

Por tanto:

```text
✅ EL LOCKFILE QUEDA ACEPTADO
```

NO volver a regenerarlo en esta ronda salvo que la corrección estrictamente lo requiera.

---

# 2. FALLO REAL IDENTIFICADO

GitHub Actions falla al comenzar las assertions RLS con:

```text
ERROR: function rls_is_enabled(unknown, unknown, unknown) does not exist
```

Ubicación:

```text
supabase/tests/database/01_foundation_rls.test.sql
```

La suite contiene 9 llamadas:

```sql
SELECT rls_is_enabled('public', 'profiles', ...);
SELECT rls_is_enabled('public', 'businesses', ...);
SELECT rls_is_enabled('public', 'business_members', ...);
SELECT rls_is_enabled('public', 'business_locations', ...);
SELECT rls_is_enabled('public', 'business_member_locations', ...);
SELECT rls_is_enabled('public', 'drivers', ...);
SELECT rls_is_enabled('public', 'driver_documents', ...);
SELECT rls_is_enabled('public', 'vehicles', ...);
SELECT rls_is_enabled('public', 'driver_presence', ...);
```

La función `rls_is_enabled(...)` no está disponible en el pgTAP instalado por el stack actual.

La suite aborta tras 12 tests, por eso GitHub informa:

```text
Planned: 60
Executed before abort: 12
Result: FAIL
```

NO interpretar esto como 48 fallos de seguridad.

La suite simplemente no llega a ejecutar el resto.

---

# 3. CORRECCIÓN OBLIGATORIA

Reemplazar las 9 assertions `rls_is_enabled(...)` por assertions pgTAP basadas en el catálogo nativo de PostgreSQL.

Usar `pg_catalog.pg_class.relrowsecurity`.

Patrón recomendado:

```sql
SELECT is(
  (
    SELECT c.relrowsecurity
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n
      ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'profiles'
  ),
  true,
  'RLS enabled on profiles'
);
```

Repetir exactamente el mismo patrón para:

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

Debe haber:

```text
9 assertions nuevas
```

sustituyendo:

```text
9 assertions antiguas
```

Por tanto, mientras no se añada ni elimine ninguna otra assertion:

```text
plan(60)
```

debe permanecer en:

```text
60
```

---

# 4. NO CAMBIAR RLS NI MIGRATIONS

Este fallo es del TEST HELPER, no de las policies.

GitHub Actions confirmó que:

```text
supabase start      PASS
supabase db reset   PASS
migrations          PASS
```

NO modificar:

```text
profiles policies
business policies
business_members policies
business_locations policies
business_member_locations policies
drivers policies
driver_documents policies
driver_presence policies
private helpers
migrations
```

salvo que, después de corregir `rls_is_enabled`, un test conductual real revele un fallo concreto.

---

# 5. NO CAMBIAR TOOLCHAIN

Mantener:

```text
Node.js               24.18.0
pnpm                  11.17.0
Turbo                 2.10.7
Supabase CLI          2.110.0
Next.js               16.2.12
eslint-config-next    16.2.12
Expo Doctor           1.20.1
Expo SDK              57
React Native          0.86.2
React                 19.2.3
TypeScript root/web   5.8.2
TypeScript mobile     6.0.3
```

No actualizar por avisos de versiones nuevas durante esta ronda.

---

# 6. WARNINGS NO BLOQUEANTES

GitHub Actions mostró:

```text
WARN: [inbucket] deprecated; use [local_smtp]
```

y durante Docker pull:

```text
toomanyrequests: Rate exceeded
```

El stack finalmente inició correctamente.

Por tanto estos warnings NO bloquean esta ronda.

No modificar `supabase/config.toml` solo por el warning de `inbucket` durante este cierre.

Podrá limpiarse en mantenimiento posterior.

---

# 7. EJECUCIÓN OBLIGATORIA

Después de reemplazar únicamente las 9 assertions:

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
pnpm supabase:stop
```

Resultado requerido:

```text
supabase start: PASS
supabase db reset: PASS
pgTAP: 60/60 PASS
DB types: 9/9
Generated drift: 0
```

Si aparece un nuevo fallo REAL en alguna assertion conductual:

```text
NO ocultarlo
NO borrar el test
NO relajar RLS
```

Corregir únicamente la causa real y volver a ejecutar.

---

# 8. PUSH Y GITHUB ACTIONS

Commit recomendado:

```text
test(db): replace unavailable pgTAP RLS helper with catalog assertions
```

Push SOLO a:

```text
phase/1-foundation
```

Esperar el nuevo workflow:

```text
CI Quality & Security Gates
```

Los tres jobs deben quedar:

```text
Code Quality & Monorepo Gates       ✅ PASS
Mobile Apps SDK 57 & Metro Export   ✅ PASS
Supabase Foundation DB & pgTAP RLS  ✅ PASS
```

No mergear a `main`.

---

# 9. REPORTE FINAL DEL AGENTE

Entregar:

```text
Branch:
Final SHA:
GitHub Actions Run URL:

Quality job:
Mobile job:
Database job:

pgTAP planned:
pgTAP executed:
pgTAP passed:
DB reset:
DB types:
Generated drift:
```

Si los tres jobs quedan verdes, terminar:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

y DETENERSE.

---

# 10. DEFINITION OF DONE v1.6

- [ ] No queda ninguna llamada a `rls_is_enabled(...)`.
- [ ] Las 9 tablas comprueban `pg_class.relrowsecurity = true`.
- [ ] `plan(60)` coincide con 60 assertions.
- [ ] `supabase db reset` pasa.
- [ ] `supabase test db` ejecuta 60/60.
- [ ] DB Types siguen 9/9.
- [ ] Generated drift = 0.
- [ ] Quality GitHub job = GREEN.
- [ ] Mobile GitHub job = GREEN.
- [ ] Database GitHub job = GREEN.
- [ ] Toolchain no cambió.
- [ ] Lockfile no fue regenerado innecesariamente.
- [ ] RLS/policies no fueron relajadas.
- [ ] Fase 2 no inició.
- [ ] No merge a main.

Si todos los puntos pasan:

```text
✅ FASE 1 APROBADA
```

No abrir una v1.7 por mejoras opcionales.

---

# PROMPT DEL AGENTE

Eres el Agente Senior de Ejecución de Güegüense.

El Cerebro verificó directamente GitHub Actions del commit `9aed957`.

Quality y Mobile están VERDES.

El único job rojo es Database.

La causa exacta es:

```text
function rls_is_enabled(unknown, unknown, unknown) does not exist
```

Corrige SOLO las 9 assertions `rls_is_enabled(...)` usando
`pg_catalog.pg_class.relrowsecurity` con pgTAP `is(...)`.

No cambies dependencies, lockfile, migrations, RLS ni arquitectura salvo que
un test real posterior revele un defecto concreto.

Ejecuta Supabase reset/tests/types/drift, push a `phase/1-foundation`,
espera GitHub Actions y detente cuando los 3 jobs estén verdes.

NO inicies Fase 2.
NO hagas merge a main.

# FIN — FASE 1 CIERRE REAL v1.6
