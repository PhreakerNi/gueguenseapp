# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CIERRE DB TYPES v1.8

**Tipo:** Micro-parche final basado en GitHub Actions real  
**Branch:** `phase/1-foundation`  
**Commit auditado:** `4ddbdad556f2e75203c95e2e068ad7452f5750c5`  
**Workflow auditado:** `31627766237`  
**Estado:** ❌ FASE 1 NO APROBADA TODAVÍA  
**Regla:** NO iniciar Fase 2. NO mergear a `main`. NO tocar toolchain, lockfile, RLS ni migrations salvo necesidad estrictamente derivada del gate.

---

# 1. ESTADO REAL DE GITHUB ACTIONS

El commit `4ddbdad` ejecutó CI y terminó así:

```text
✅ Code Quality & Monorepo Gates
✅ Mobile Apps SDK 57 & Metro Export Gates
❌ Supabase Foundation DB & pgTAP RLS Gates
```

Dentro del job DB:

```text
✅ Install Monorepo Dependencies
✅ Supabase CLI exact version
✅ Supabase start
✅ Supabase db reset
✅ pgTAP 60/60
❌ Verify Database Types Sync Drift
✅ Supabase stop
```

Por tanto:

```text
SEGURIDAD RLS / pgTAP = PASS
ÚNICO BLOQUEO = database.generated.ts NO coincide con la salida real del CLI
```

---

# 2. HALLAZGO EXACTO

El archivo versionado:

```text
packages/types/src/database.generated.ts
```

tiene aproximadamente 277 líneas y fue construido en una forma reducida/manual.

Pero el comando real del proyecto:

```bash
supabase gen types typescript --local
```

genera aproximadamente 1044 líneas en el runner actual e incluye, además de `public`:

```text
graphql_public
storage
```

y metadata/Relationships/helpers adicionales.

El CI ejecuta:

```bash
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

y detecta un diff masivo.

Esto demuestra que el archivo versionado todavía NO es la salida reproducible del CLI.

---

# 3. DECISIÓN ARQUITECTÓNICA FINAL

Para Güegüense Foundation queremos tipos de aplicación del schema:

```text
public
```

No necesitamos versionar tipos internos de:

```text
storage
graphql_public
private
```

en `packages/types/src/database.generated.ts`.

Por tanto el script canónico debe quedar explícitamente limitado a `public`.

Modificar root `package.json`:

```json
"db:types": "supabase gen types typescript --local --schema public > packages/types/src/database.generated.ts"
```

NO editar manualmente el archivo generado.

---

# 4. REGENERACIÓN CORRECTA

Con Supabase local iniciado y migrations aplicadas:

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm db:types
```

El archivo:

```text
packages/types/src/database.generated.ts
```

debe ser reemplazado COMPLETAMENTE por la salida real del CLI.

NO:

```text
añadir header manual
reordenar campos
aplicar Prettier manualmente al archivo
convertir interface/type a mano
eliminar Relationships a mano
recortar schemas a mano
```

El filtrado se hace únicamente mediante:

```text
--schema public
```

---

# 5. VALIDACIONES OBLIGATORIAS

Después de regenerar:

```bash
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

El segundo `pnpm db:types` debe producir exactamente el mismo archivo.

Resultado:

```text
Generated DB Types Drift: 0
```

Además verificar que siguen presentes exactamente las 9 tablas Foundation de `public`:

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

No exigir que el archivo tenga solo 9 entidades totales si el CLI añade metadata/helper types propios del schema `public`.

---

# 6. NO REGRESAR LOS GATES YA VERDES

NO tocar salvo fallo real:

```text
GRANT SELECT a authenticated
RLS policies
private helpers
pgTAP assertions
migrations Foundation
pnpm-lock.yaml
Node / pnpm / Turbo / Next / Expo / Supabase CLI
```

El commit `4ddbdad` ya demostró:

```text
pgTAP 60/60 PASS
```

No modificar esos tests si siguen pasando.

---

# 7. EJECUCIÓN LOCAL

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
DB types generation: PASS
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

Si `format:check` exige reformatear el archivo generado, NO deformar la salida CLI manualmente.

En ese caso, excluir `packages/types/src/database.generated.ts` de Prettier mediante `.prettierignore`, porque es un artefacto generado reproducible.

---

# 8. CI

Push SOLO a:

```text
phase/1-foundation
```

Esperar GitHub Actions.

Resultado requerido:

```text
✅ Code Quality & Monorepo Gates
✅ Mobile Apps SDK 57 & Metro Export Gates
✅ Supabase Foundation DB & pgTAP RLS Gates
```

Si los tres quedan verdes, DETENERSE.

---

# 9. REPORTE FINAL

Entregar:

```text
Branch:
Final SHA:
GitHub Actions Run URL:

Quality:
Mobile:
Database:

db:types command:
Foundation public tables:
Generated DB Types Drift:
pgTAP:
DB reset:
```

Valores esperados:

```text
db:types command:
supabase gen types typescript --local --schema public > packages/types/src/database.generated.ts

Foundation public tables: 9/9
Generated DB Types Drift: 0
pgTAP: 60/60 PASS
DB reset: PASS
```

Terminar exactamente:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENERSE.

NO iniciar Fase 2.
NO mergear a `main`.

---

# 10. CRITERIO DE APROBACIÓN DEL CEREBRO

Si el siguiente commit tiene:

```text
Quality   GREEN
Mobile    GREEN
Database  GREEN
```

y el job DB confirma:

```text
pgTAP 60/60
generated types drift 0
```

entonces:

```text
✅ FASE 1 APROBADA
```

No abrir otra ronda por mejoras opcionales.

---

# FIN — FASE 1 CIERRE DB TYPES v1.8
