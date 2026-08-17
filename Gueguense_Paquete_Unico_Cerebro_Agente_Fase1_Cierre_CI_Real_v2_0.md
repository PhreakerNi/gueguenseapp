# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1 CIERRE CI REAL v2.0

**Tipo:** Corrección mínima basada en el GitHub Actions REAL del commit `031b95d`  
**Branch:** `phase/1-foundation`  
**Commit auditado:** `031b95dd49f18938713b8e74044a5d9ec38d9cb8`  
**GitHub Actions Run:** `32077542996`  
**Run URL:** `https://github.com/PhreakerNi/gueguenseapp/actions/runs/32077542996`  
**Estado:** ❌ FASE 1 NO APROBADA TODAVÍA

---

# 1. VEREDICTO DEL CEREBRO

El reporte anterior del agente decía PASS en Mobile y Database, pero el run real de GitHub Actions terminó:

```text
✅ Code Quality & Monorepo Gates       PASS
❌ Mobile Apps SDK 57 & Metro Export  FAIL
❌ Supabase Foundation DB & pgTAP RLS FAIL
```

Detalles reales:

```text
Quality:
PASS

Mobile:
FAIL en "Business Mobile Expo Install Check"

Database:
DB reset = PASS
pgTAP = 60/60 PASS
Generated DB Types Drift = FAIL
```

Por tanto:

```text
FASE 1 — NO APROBADA
```

No iniciar Fase 2.
No mergear a main.

---

# 2. BLOQUEO REAL A — EXPO SDK 57 COMPATIBILITY

GitHub Actions ejecutó:

```bash
pnpm --filter @gueguense/business-mobile exec expo install --check
```

y Expo respondió:

```text
expo@57.0.12           -> expected ~57.0.14
expo-constants@57.0.10 -> expected ~57.0.12
expo-linking@57.0.5    -> expected ~57.0.6
expo-router@57.0.12    -> expected ~57.0.14

Found outdated dependencies
exit code 1
```

La documentación oficial de Expo establece que:

```text
expo install --check
```

valida las versiones compatibles y devuelve código distinto de cero en CI cuando detecta versiones incorrectas.

La corrección recomendada por Expo es:

```text
expo install --fix
```

---

# 3. CORRECCIÓN MOBILE OBLIGATORIA

Aplicar en AMBAS apps:

```bash
pnpm --filter @gueguense/business-mobile exec expo install --fix
pnpm --filter @gueguense/driver-mobile exec expo install --fix
```

Después revisar el diff.

Cambios actualmente esperados como mínimo:

```text
expo            ~57.0.14
expo-constants  ~57.0.12
expo-linking    ~57.0.6
expo-router     ~57.0.14
```

Mantener:

```text
Expo SDK        57
React           19.2.3
React Native    0.86.2
```

si `expo install --fix` no exige otra cosa.

Si Expo intenta cambiar:

```text
React major/minor
React Native major/minor
Expo SDK 57 -> 58
```

DETENERSE y reportarlo.

No usar:

```json
"expo": {
  "install": {
    "exclude": [...]
  }
}
```

para silenciar el gate.

---

# 4. LOCKFILE — AUTORIZACIÓN LIMITADA

En esta ronda SÍ está autorizado cambiar:

```text
pnpm-lock.yaml
```

pero ÚNICAMENTE como consecuencia de la alineación oficial de paquetes Expo SDK 57.

Reglas:

```text
NO editar pnpm-lock.yaml manualmente.
NO modificar integrity manualmente.
NO inventar versions.
```

Después de `expo install --fix` ejecutar:

```bash
pnpm install
pnpm install --frozen-lockfile
```

y confirmar:

```text
Clean frozen install = PASS
```

---

# 5. BLOQUEO REAL B — DATABASE GENERATED TYPES

GitHub Actions ejecutó correctamente:

```text
Supabase CLI 2.110.0
supabase start
supabase db reset
pgTAP 60/60
```

El fallo ocurre únicamente en:

```bash
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

El archivo committed NO coincide con el output real producido por CI.

---

# 6. EVIDENCIA EXACTA DEL DRIFT

El archivo committed contiene:

```ts
type DatabaseWithoutInternals = Omit<Database, "__schema">;

type DefaultSchema = DatabaseWithoutInternals[keyof DatabaseWithoutInternals];
```

y usa nombres como:

```text
PublicTableNameOrOptions
PublicEnumNameOrOptions
```

GitHub Actions con Supabase CLI `2.110.0` genera:

```ts
type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];
```

y los helpers:

```text
DefaultSchemaTableNameOrOptions
DefaultSchemaEnumNameOrOptions
```

además de:

```ts
export const Constants = {
  public: {
    Enums: {},
  },
} as const;
```

La salida de CI coincide también con la plantilla oficial actual del generador Supabase.

---

# 7. REGLA DE FUENTE DE VERDAD PARA DB TYPES

El agente ejecuta desde Windows.

El supuesto:

```text
"worktree local drift 0"
```

NO es suficiente porque ya contradijo dos veces el runner Linux de GitHub Actions.

Para este cierre:

```text
FUENTE DE VERDAD = output del runner Linux de GitHub Actions
```

No diseñar ni “mejorar” los tipos.

No cambiar schema.
No cambiar migrations.
No cambiar RLS.
No cambiar Supabase CLI.

---

# 8. CORRECCIÓN DB TYPES OBLIGATORIA

Usar el propio run:

```text
32077542996
```

y el job Database:

```text
95533807839
```

Descargar/leer el log completo del job y tomar el unified diff generado por:

```bash
pnpm db:types
git diff --exit-code -- packages/types/src/database.generated.ts
```

Aplicar EXACTAMENTE el lado `+` generado por CI al archivo:

```text
packages/types/src/database.generated.ts
```

No añadir cambios que no estén en el output del generador.

El objetivo es que el próximo runner Linux genere exactamente el mismo archivo y:

```text
git diff --exit-code = 0
```

---

# 9. VALIDACIÓN LOCAL DE ESTRUCTURA

Después de sincronizar el archivo:

```text
Foundation public tables = 9/9
```

Deben seguir presentes:

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

Confirmar además:

```text
__InternalSupabase          PRESENTE si lo genera CLI
DatabaseWithoutInternals    PRESENTE
DefaultSchema               PRESENTE
Constants                   PRESENTE
__schema                    AUSENTE
```

No exigir drift 0 de Windows si su generador local contradice el runner Linux.

El gate final de reproducibilidad será GitHub Actions Ubuntu.

---

# 10. NO REGRESAR LO YA APROBADO

NO tocar:

```text
Foundation migrations
RLS
GRANT SELECT
private helpers
pgTAP assertions
Node 24.18.0
pnpm 11.17.0
Turbo 2.10.7
Supabase CLI 2.110.0
Next 16.2.12
React 19.2.3
React Native 0.86.2
TypeScript root/web 5.8.2
TypeScript mobile 6.0.3
```

Salvo que `expo install --fix` muestre explícitamente una incompatibilidad nueva con React/RN; en ese caso DETENERSE.

---

# 11. GATES MOBILE OBLIGATORIOS

Ejecutar:

```bash
pnpm --filter @gueguense/business-mobile exec expo config
pnpm --filter @gueguense/business-mobile exec expo install --check
pnpm --filter @gueguense/business-mobile exec expo-doctor
pnpm --filter @gueguense/business-mobile exec expo export --platform android --output-dir dist-ci

pnpm --filter @gueguense/driver-mobile exec expo config
pnpm --filter @gueguense/driver-mobile exec expo install --check
pnpm --filter @gueguense/driver-mobile exec expo-doctor
pnpm --filter @gueguense/driver-mobile exec expo export --platform android --output-dir dist-ci
```

Resultado obligatorio:

```text
Business --check = PASS
Business doctor  = PASS
Business export  = PASS

Driver --check   = PASS
Driver doctor    = PASS
Driver export    = PASS
```

---

# 12. GATES FOUNDATION DB

Ejecutar:

```bash
pnpm supabase:start
pnpm supabase:reset
pnpm supabase:test
pnpm supabase:stop
```

Requisitos:

```text
DB reset = PASS
pgTAP = 60/60 PASS
```

No modificar seguridad para conseguir drift 0.

---

# 13. QUALITY

Ejecutar:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Todo debe pasar.

---

# 14. COMMIT Y PUSH

Commit sugerido:

```text
fix(foundation): align expo sdk 57 packages and canonical db generated types
```

Push SOLO a:

```text
phase/1-foundation
```

No mergear a main.

Esperar el nuevo GitHub Actions completo.

---

# 15. CRITERIO FINAL REAL

El nuevo run debe mostrar:

```text
✅ Code Quality & Monorepo Gates
✅ Mobile Apps SDK 57 & Metro Export Gates
✅ Supabase Foundation DB & pgTAP RLS Gates
```

Dentro de Mobile:

```text
✅ Business Mobile Expo Install Check
✅ Driver Mobile Expo Install Check
```

Dentro de Database:

```text
✅ Reset Database & Apply Foundation Migrations
✅ Run pgTAP Database & RLS Security Tests
✅ Verify Database Types Sync Drift
```

y:

```text
pgTAP = 60/60
DB Types Drift = 0
```

---

# 16. REPORTE FINAL OBLIGATORIO

Entregar:

```text
Branch:
Final SHA:
GitHub Actions Run URL exacta:

Quality:
Mobile:
Database:

Business Expo Install Check:
Driver Expo Install Check:

Expo:
expo-constants:
expo-linking:
expo-router:

Supabase CLI:
DB reset:
pgTAP:
DB Types Drift:

pnpm-lock manual edit:
Fase 2 iniciada:
Merge main:
```

Valores esperados:

```text
Quality: PASS
Mobile: PASS
Database: PASS

Business Expo Install Check: PASS
Driver Expo Install Check: PASS

Supabase CLI: 2.110.0
DB reset: PASS
pgTAP: 60/60 PASS
DB Types Drift: 0

pnpm-lock manual edit: NO
Fase 2 iniciada: NO
Merge main: NO
```

No reportar PASS basándose solo en local.

La URL exacta del run es obligatoria.

---

# 17. ESTADO DE SALIDA

Terminar exactamente:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

y DETENERSE.

Si y solo si el Cerebro verifica directamente el siguiente GitHub Actions con los 3 jobs verdes:

```text
✅ FASE 1 — APROBADA
```

No abrir Fase 2 antes.

---

# PROMPT OPERATIVO DEL AGENTE

Lee y ejecuta COMPLETAMENTE este archivo.

Trabaja únicamente en:

```text
phase/1-foundation
```

El run real `32077542996` demostró dos fallos:

1. Mobile:
   `expo install --check` exige actualizar cuatro paquetes Expo SDK 57.

2. Database:
   `database.generated.ts` sigue sin coincidir con el output real del runner Linux con Supabase CLI 2.110.0.

Corrige SOLO esos dos puntos.

Para Mobile usa `expo install --fix` en Business y Driver, permite únicamente los ajustes de compatibilidad SDK 57 y regenera el lockfile con pnpm. NO uses `expo.install.exclude`.

Para DB Types usa como fuente de verdad el unified diff del job GitHub Actions `95533807839` del run `32077542996`. El archivo final debe coincidir con el output Linux de CI, incluyendo `__InternalSupabase`, `DefaultSchema...` y `Constants`.

No cambies RLS, migrations ni arquitectura.

Haz push a `phase/1-foundation`, espera el NUEVO run, verifica los tres jobs y entrega la URL exacta `/actions/runs/<id>`.

NO declares PASS si GitHub Actions está rojo.
NO inicies Fase 2.
NO hagas merge a main.

# FIN — FASE 1 CIERRE CI REAL v2.0
