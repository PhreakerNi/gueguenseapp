# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 1

**Versión:** 1.0  
**Fase:** FASE 1 — FUNDACIÓN Y ESTRUCTURA CORE  
**Estado previo:** ✅ FASE 0 APROBADA POR EL CEREBRO  
**Base auditada:** `gueguenseapp-main(6).zip`  
**Objetivo:** Convertir la arquitectura aprobada en una base técnica reproducible, segura, testeable y lista para construir las Apps de Motorizado y Negocios en las siguientes fases.

---

# PARTE A — DECISIÓN FORMAL DEL CEREBRO

## 1. Aprobación de Fase 0

El Cerebro auditó el ZIP final contra el Definition of Done v1.8 y verificó:

```text
Filas API inválidas: 0
Eventos API huérfanos: 0
Payout /approve → APPROVED: OK
APPROVED → PROCESSING → PAID/FAILED: documentado
Policies configurables restantes: corregidas
Pseudoestados operativos Return/Handoff: corregidos
Código ejecutable añadido durante Fase 0: 0
```

Por tanto:

```text
✅ FASE 0 — APROBADA
```

A partir de este documento queda autorizado comenzar código ejecutable **exclusivamente dentro del alcance de Fase 1**.

---

# 2. Principio de Fase 1

Fase 1 NO construye todavía el producto completo.

Fase 1 crea la infraestructura de ingeniería sobre la que se implementarán las demás fases.

Debe quedar:

```text
Repositorio reproducible
+ Monorepo
+ Apps compilables
+ Paquetes compartidos
+ Supabase local
+ Base de identidad/tenancy
+ RLS base
+ Tipos generados
+ Tests
+ CI
+ Gestión segura de entornos
```

No deben implementarse todavía:

```text
Dispatch real
Delivery completo
OTP de entrega real
Tracking live real
Pricing real
Ledger completo
Payout real
Pagos reales
Catálogo
Admin funcional completo
UX final
```

---

# 3. Stack autorizado y congelado para Fase 1

## Runtime

Usar:

```text
Node.js 24 LTS
```

Preferencia de pin inicial:

```text
24.18.0
```

Si al ejecutar la fase existe un parche 24.x LTS más reciente, el agente puede usarlo, siempre que:

- siga siendo Node 24 LTS;
- sea estable;
- se registre la versión exacta;
- se actualice `.node-version` / `.nvmrc`;
- CI use la misma major/minor/patch cuando sea viable.

No usar Node 26 Current para la base del proyecto mientras Node 24 sea la línea LTS escogida.

## Package manager

Usar:

```text
pnpm 11 stable
```

NO usar pnpm 12 Release Candidate durante esta fase.

El agente debe resolver la versión estable 11.x vigente al momento de ejecución y fijarla exactamente en:

```json
"packageManager": "pnpm@X.Y.Z"
```

No dejar `latest`.

## Monorepo

Usar:

```text
pnpm workspaces
Turborepo stable
```

Fijar versión exacta de `turbo` en `devDependencies`.

## Mobile

Usar explícitamente:

```text
Expo SDK 57
React Native 0.86
React 19.2.3
Expo Router
TypeScript
```

Crear los proyectos con template:

```text
default@sdk-57
```

No utilizar Canary/Beta.

## Web

Usar:

```text
Next.js 16.x Active LTS
App Router
TypeScript
ESLint
Tailwind CSS
Turbopack por defecto
```

Resolver el patch estable actual de Next 16 durante la ejecución y fijarlo en el lockfile. NO utilizar Canary.

## Backend / Database

Usar:

```text
Supabase CLI
PostgreSQL
PostGIS
RLS
pgTAP
```

Instalar Supabase CLI como dependencia de desarrollo del proyecto y fijar versión exacta.

NO depender de una instalación global de Supabase CLI en CI.

---

# 4. Fuentes oficiales de compatibilidad usadas por el Cerebro

El agente debe priorizar documentación oficial actual en caso de detalles operativos.

Referencias:

```text
Node.js releases:
https://nodejs.org/en/about/previous-releases

Expo SDK:
https://docs.expo.dev/versions/latest/

Expo create project:
https://docs.expo.dev/get-started/create-a-project/

Expo monorepos:
https://docs.expo.dev/guides/monorepos/

Expo Router:
https://docs.expo.dev/router/introduction/

Next.js installation:
https://nextjs.org/docs/app/getting-started/installation

Next.js support policy:
https://nextjs.org/support-policy

Supabase CLI:
https://supabase.com/docs/guides/local-development/cli/getting-started

Supabase local workflow:
https://supabase.com/docs/guides/local-development/cli-workflows

Supabase database testing:
https://supabase.com/docs/guides/database/testing

Supabase SSR:
https://supabase.com/docs/guides/auth/server-side
```

No usar blogs de terceros para resolver incompatibilidades de toolchain si existe documentación oficial.

---

# 5. Estructura exacta objetivo

Al finalizar Fase 1 debe existir:

```text
gueguenseapp/
├── apps/
│   ├── business-mobile/
│   ├── driver-mobile/
│   ├── admin-web/
│   └── tracking-web/
│
├── packages/
│   ├── types/
│   ├── schemas/
│   ├── domain/
│   ├── ui/
│   └── config/
│
├── supabase/
│   ├── migrations/
│   ├── functions/
│   ├── tests/
│   │   └── database/
│   ├── seed.sql
│   └── config.toml
│
├── docs/
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── .editorconfig
├── .gitignore
├── .npmrc
├── .node-version
├── .nvmrc
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── README.md
```

No crear carpetas nativas `android/` e `ios/` manualmente.

Usar Continuous Native Generation de Expo mientras no exista una razón aprobada para mantener proyectos nativos.

---

# 6. Git workflow de Fase 1

No desarrollar directamente sobre `main`.

Crear:

```text
phase/1-foundation
```

desde el `main` actualizado.

Todos los cambios de Fase 1 viven en esa rama hasta auditoría.

No hacer merge a `main` sin aprobación del Cerebro/usuario.

Commits recomendados:

```text
chore(foundation): initialize pnpm turbo workspace
chore(apps): scaffold expo and next applications
chore(packages): add shared workspace packages
feat(db): add identity and tenancy foundation
test(db): add rls and schema foundation tests
ci: add phase 1 quality gates
docs: mark phase 1 candidate for review
```

No es obligatorio usar exactamente siete commits, pero sí mantener commits legibles y reversibles.

---

# 7. Root workspace

Crear `package.json` root privado.

Debe contener, como mínimo, scripts conceptualmente equivalentes a:

```text
dev
build
lint
typecheck
test
format
format:check

supabase:start
supabase:stop
supabase:reset
supabase:test
db:types
```

`packageManager` debe fijar pnpm exacto.

`engines.node` debe reflejar Node 24.

No instalar dependencias de aplicación innecesariamente en root.

Root contiene herramientas compartidas:

```text
turbo
typescript
eslint/prettier si se centralizan
supabase CLI
```

---

# 8. pnpm workspace

Crear:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

Expo SDK 57 soporta monorepo con pnpm y configuración automática de Metro.

NO agregar hacks antiguos de Metro como:

```text
watchFolders
resolver.nodeModulesPath
resolver.extraNodeModules
resolver.disableHierarchicalLookup
```

salvo que exista un problema reproducible y el Cerebro lo apruebe.

Mantener instalación aislada de pnpm inicialmente.

Solo cambiar a:

```text
nodeLinker: hoisted
```

si una dependencia nativa real de Fases posteriores demuestra incompatibilidad reproducible.

---

# 9. Política de versiones y lockfile

Reglas:

1. Un único `pnpm-lock.yaml` en root.
2. No conservar lockfiles anidados creados por scaffolding.
3. No usar `*` para dependencias externas.
4. Para paquetes internos utilizar:

```text
workspace:*
```

5. Preferir versiones exactas para herramientas críticas.
6. No utilizar `canary`, `beta`, `rc`, `next` o prereleases sin aprobación.
7. Después del scaffold ejecutar:

```text
pnpm install
```

desde root. 8. Verificar duplicados críticos:

```text
pnpm why react
pnpm why react-native
pnpm why expo
```

No permitir React/React Native incompatibles entre las dos apps móviles.

---

# 10. Apps móviles

Crear:

```text
apps/business-mobile
apps/driver-mobile
```

con Expo SDK 57 y template default.

Expo Router queda como sistema de navegación.

## Fase 1 mobile scope

Cada app debe:

- iniciar correctamente;
- compilar TypeScript;
- resolver workspace packages;
- mostrar una pantalla técnica mínima de boot;
- tener nombre/bundle placeholders consistentes;
- tener configuración separada por app;
- no contener secretos;
- tener package name distinto.

Ejemplo conceptual de pantalla:

```text
Güegüense Negocios
Foundation ready

Güegüense Motorizado
Foundation ready
```

No diseñar todavía Login final, Home final, mapas ni navegación del Delivery.

Eliminar demo/example code innecesario del template, conservando lo mínimo para una base limpia.

---

# 11. Apps web

Crear:

```text
apps/admin-web
apps/tracking-web
```

con Next.js 16 App Router.

Configuración:

```text
TypeScript = sí
ESLint = sí
Tailwind = sí
App Router = sí
src/ = sí
Turbopack = default
```

## Admin Web

Solo necesita en Fase 1:

- build correcto;
- página técnica mínima;
- layout base;
- env validation;
- estructura preparada para Supabase SSR.

No implementar todavía dashboard real.

## Tracking Web

Solo necesita:

- build correcto;
- página técnica mínima;
- estructura para rutas de tracking futuras;
- NO conectar directamente a Realtime;
- NO implementar tracking real.

---

# 12. Paquetes compartidos

Crear los cinco packages.

## `@gueguense/types`

Responsabilidad:

- tipos TypeScript compartidos;
- tipos utilitarios;
- tipos DB generados o re-exportados donde corresponda.

No duplicar Domain Enums si `domain` es la fuente canónica.

## `@gueguense/schemas`

Responsabilidad:

- Zod schemas compartidos;
- validaciones de payload base;
- env-safe schemas reutilizables cuando sea adecuado.

No meter reglas de negocio complejas.

## `@gueguense/domain`

Responsabilidad:

- constantes canónicas de estados;
- guards puros;
- tipos de dominio;
- lógica que no dependa de React, Expo, Next o Supabase.

Crear constantes TypeScript desde `docs/21_CANONICAL_ENUMS.md`.

Ejemplo de patrón:

```ts
export const DELIVERY_STATUSES = [
  "SEARCHING_DRIVER",
  "DRIVER_ASSIGNED",
  ...
] as const;
```

No implementar todavía toda la State Machine operativa.

Sí puede crear tests básicos que aseguren que las constantes no tienen duplicados.

## `@gueguense/ui`

En Fase 1:

- scaffolding;
- design tokens iniciales derivados de `16_DESIGN_SYSTEM.md`;
- tipos;
- NO intentar compartir componentes React Native y Web complejos prematuramente.

Puede contener tokens neutrales:

```text
spacing
radius
semantic names
```

No crear un sistema universal de componentes si obliga a dependencias cruzadas difíciles.

## `@gueguense/config`

Compartir:

- tsconfig base;
- convenciones;
- config común donde tenga sentido.

No forzar una config única si Next y Expo requieren diferencias específicas.

---

# 13. TypeScript

Crear:

```text
tsconfig.base.json
```

Usar modo estricto.

Objetivo:

```text
strict = true
noUncheckedIndexedAccess = true
exactOptionalPropertyTypes = true
```

Si alguna herramienta generada no tolera una opción, documentar la excepción en el tsconfig del workspace específico.

No relajar globalmente `strict` para “hacer que compile”.

---

# 14. Formato y lint

Usar ESLint como linter principal de Fase 1.

Puede utilizarse Prettier para formato.

No mezclar ESLint y Biome como dos linters simultáneos.

Debe existir:

```text
pnpm lint
pnpm format:check
```

y ambos deben pasar desde root.

---

# 15. Variables de entorno

Crear `.env.example` apropiados.

Nunca subir `.env`, `.env.local` ni secretos reales.

## Mobile

Solo variables públicas explícitas:

```text
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

NO:

```text
SUPABASE_SECRET_KEY
service_role
server Routes API key
payment secrets
```

dentro de Expo.

## Admin Web

Cliente:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

Server-only futuro:

```text
SUPABASE_SECRET_KEY
```

solo cuando una función server realmente lo requiera.

No crear una secret key falsa dentro de archivos client.

## Tracking Web

No necesita conexión directa a Supabase en Fase 1.

Preparar únicamente env de backend/API si se necesita posteriormente.

---

# 16. Supabase local

Instalar Supabase CLI como `devDependency`.

Ejecutar:

```text
pnpm supabase init
pnpm supabase start
```

o equivalentes project-scoped.

El local stack es exclusivamente para desarrollo.

NO exponerlo a Internet.

No enlazar todavía Production automáticamente.

No usar credenciales reales de producción.

---

# 17. Migraciones permitidas en Fase 1

Fase 1 crea únicamente la **fundación de identidad, tenancy y conductor**.

No crear todavía las 37 entidades completas.

Crear migraciones pequeñas, ordenadas y testeables.

## Migration A — extensions/schemas

Preparar:

```text
extensions schema según necesidad
PostGIS
pgTAP para testing cuando corresponda
private schema
```

No conceder acceso indiscriminado al schema `private`.

## Migration B — identity/business foundation

Crear de acuerdo con `06_DATABASE_ARCHITECTURE.md`:

```text
public.profiles
public.businesses
public.business_members
public.business_member_locations
public.business_locations
```

## Migration C — driver foundation

Crear:

```text
public.drivers
public.driver_documents
public.vehicles
public.driver_presence
```

No crear todavía:

```text
delivery_requests
delivery_quotes
deliveries
dispatch offers
tracking points de delivery
ledger
payments
payouts reales
```

salvo que una dependencia técnica sea estrictamente necesaria y esté documentada.

---

# 18. Reglas de DB obligatorias

Las migrations deben respetar el documento 06.

En particular:

- `auth.users` es la identidad;
- `profiles.id → auth.users.id`;
- business membership separada de profile;
- scope N:M mediante `business_member_locations`;
- Driver separado de Profile;
- `driver_presence` 1:1 con Driver;
- `driver_presence.current_location` NO debe poder escribirse directamente desde cliente;
- tipos monetarios no aplican todavía en esta subfase salvo campos ya documentados;
- timestamps `TIMESTAMPTZ`;
- IDs UUID;
- constraints, FKs e índices según spec;
- PostGIS index para locations geográficas.

No inventar columnas fuera de la especificación sin documentar motivo.

---

# 19. Auth bootstrap

Puede implementarse un trigger/control mínimo para crear `public.profiles` cuando se crea un `auth.users`, siempre que:

- use una función segura;
- `SECURITY DEFINER` solo si realmente es necesario;
- `SET search_path = ''`;
- referencias schema-qualified;
- permisos mínimos;
- tenga test.

No implementar todavía Login UI.

No implementar recuperación de contraseña, MFA UI ni onboarding funcional completo.

---

# 20. RLS foundation

RLS debe estar habilitado desde la primera migration de tablas expuestas.

Principio:

```text
DENY BY DEFAULT
```

No crear policies tipo:

```text
USING (true)
```

para “hacer que funcione”.

Cobertura mínima:

## profiles

- User puede leer su perfil.
- Campos privilegiados como `platform_role` no pueden ser escalados desde cliente.

## businesses

- miembro válido puede leer el negocio correspondiente;
- usuario ajeno no puede leerlo;
- account/verification status no puede modificarse libremente desde client.

## business_members

- acceso acotado al negocio;
- user ajeno no puede enumerar membresías;
- roles no pueden escalarse sin autorización.

## business_member_locations

- respeta misma tenancy.

## business_locations

- miembros autorizados leen sucursales correspondientes.

## drivers

- driver lee su propio expediente;
- no puede auto-marcarse VERIFIED/ACTIVE arbitrariamente.

## driver_documents

- driver puede ver solo sus documentos;
- verificación es server/admin-controlled.

## vehicles

- conductor solo sobre su scope autorizado.

## driver_presence

- puede leer su estado propio;
- **NO puede actualizar directamente coordenadas/current_location desde Supabase client**.

Admin policies más amplias solo si existe helper seguro y tests.

---

# 21. Database tests

Crear pgTAP tests en:

```text
supabase/tests/database/
```

Ejecutables con:

```text
pnpm supabase test db
```

Cobertura mínima:

- tablas existen;
- PK/FK/UNIQUE críticos;
- RLS está habilitado;
- profile own-read;
- cross-user profile denial cuando corresponda;
- cross-business denial;
- business member scoping;
- member location scoping N:M;
- driver self-read;
- driver cannot set own verification/account status;
- driver cannot update `driver_presence.current_location` directly;
- private schema inaccessible to normal client roles.

Tests negativos son obligatorios.

---

# 22. Seed

Crear `supabase/seed.sql` mínimo.

No colocar:

- personas reales;
- teléfonos reales;
- documentos reales;
- claves reales;
- direcciones privadas reales.

Usar datos sintéticos de desarrollo.

Si insertar users en `auth.users` mediante seed genera complejidad innecesaria, puede reservarse para test helpers y dejar seed centrado en datos no sensibles.

---

# 23. Database types

Después de aplicar migrations localmente:

```text
supabase gen types
```

Generar tipos TypeScript.

Ubicación recomendada:

```text
packages/types/src/database.generated.ts
```

No editar manualmente ese archivo.

Agregar encabezado:

```text
GENERATED FILE — DO NOT EDIT
```

Crear exports limpios desde:

```text
packages/types/src/index.ts
```

---

# 24. Supabase clients — alcance Fase 1

No implementar Auth funcional completo.

Sí dejar preparados factories seguros.

## Mobile

Puede crear client factory únicamente con:

```text
SUPABASE_URL
PUBLISHABLE_KEY
```

No secret key.

La persistencia final de sesiones/secure storage se implementará al desarrollar Auth de cada app si no queda cerrada en esta fase.

## Admin Web

Preparar estructura para Supabase SSR siguiendo documentación oficial vigente.

No usar patrones antiguos copiados de blogs.

## Tracking Web

NO necesita cliente Supabase directo para el MVP.

---

# 25. CI

Crear:

```text
.github/workflows/ci.yml
```

Trigger:

```text
pull_request
push a phase/1-foundation si se desea
```

No hacer deploy.

Quality gates mínimos:

```text
pnpm install --frozen-lockfile
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

Database job:

```text
Supabase local start
database reset
supabase test db
```

Puede separarse en jobs.

No guardar tokens de Production.

---

# 26. Builds y smoke tests

Fase 1 no requiere publicar a stores.

Debe comprobar:

## business-mobile

```text
expo config
typecheck
Metro starts
```

## driver-mobile

mismo.

## admin-web

```text
next build
```

## tracking-web

```text
next build
```

No crear EAS Production builds todavía.

Development builds pueden prepararse después si una dependencia nativa lo exige.

---

# 27. Root Turbo pipeline

Definir tasks conceptuales:

```text
build
lint
typecheck
test
dev
```

`build` debe respetar dependencias entre packages.

`dev` no debe cachearse.

No cachear archivos que contengan secretos.

No cachear `.env*`.

---

# 28. Seguridad de supply chain y repositorio

Obligatorio:

- lockfile versionado;
- no prereleases;
- no secrets;
- `.env*` ignorados salvo `.env.example`;
- no `node_modules`;
- no builds generados;
- no `.next`;
- no Expo local state;
- no Supabase temp state;
- no service keys.

Ejecutar antes de entregar:

```text
git status
git ls-files
```

y búsqueda de patrones sensibles.

Buscar:

```text
sb_secret_
service_role
sk_live_
sk_test_
ghp_
PRIVATE KEY
BEGIN RSA
```

No reportar secretos completos si accidentalmente aparecen; eliminarlos/rotarlos y reportar el incidente sin exponer valor.

---

# 29. README y Roadmap

Al iniciar Fase 1 actualizar:

```text
FASE 0 — ✅ APROBADA
FASE 1 — 🟡 EN DESARROLLO
```

Al terminar trabajo del agente, antes de revisión:

```text
FASE 0 — ✅ APROBADA
FASE 1 — 🟡 EN REVISIÓN / CANDIDATA A APROBACIÓN
```

No marcar Fase 1 como aprobada.

Agregar al Roadmap una sección concreta de Fase 1 con los entregables reales implementados.

No modificar la arquitectura aprobada de Fase 0 salvo referencias de estado.

---

# 30. Prohibiciones de Fase 1

NO implementar todavía:

- algoritmo real de Dispatch;
- `accept_delivery_offer` final;
- Delivery State Machine completa en DB;
- OTP real;
- tracking live;
- Routes API calls;
- Push real;
- Pricing Engine;
- Ledger completo;
- Payout processing;
- customer delivery screens;
- admin operation screens;
- catalogs;
- payments;
- production deployments.

Puede haber interfaces/types placeholders si son necesarios para compilar, pero no lógica de negocio prematura.

---

# 31. Definition of Done — Fase 1

Fase 1 es candidata a aprobación solamente si:

- [ ] Rama `phase/1-foundation` creada.
- [ ] Node 24 LTS fijado.
- [ ] pnpm 11 stable fijado exactamente.
- [ ] Turborepo estable fijado.
- [ ] Un único lockfile.
- [ ] 4 apps existen.
- [ ] 2 apps Expo usan SDK 57.
- [ ] No hay React/React Native duplicados incompatibles.
- [ ] 2 apps Next usan 16.x Active LTS estable.
- [ ] 5 packages compartidos existen.
- [ ] `@gueguense/domain` contiene estados canónicos base.
- [ ] TypeScript strict pasa.
- [ ] Lint pasa.
- [ ] Format check pasa.
- [ ] Build web pasa.
- [ ] Mobile config/typecheck/Metro smoke pasa.
- [ ] Supabase CLI local está inicializado.
- [ ] Supabase CLI está fijado como dependencia de proyecto.
- [ ] PostGIS disponible.
- [ ] `private` schema existe y no está expuesto.
- [ ] Tablas foundation de identidad/business/driver existen.
- [ ] RLS está habilitado.
- [ ] Cross-tenant negative tests pasan.
- [ ] Driver no puede auto-verificarse.
- [ ] Driver no puede escribir GPS directo.
- [ ] pgTAP tests pasan.
- [ ] Database types se generan.
- [ ] CI existe y pasa.
- [ ] No hay secrets en Git.
- [ ] `.env.example` existe donde corresponda.
- [ ] README marca Fase 0 aprobada.
- [ ] Roadmap marca Fase 1 candidata.
- [ ] No se implementó funcionalidad fuera del scope.
- [ ] Agente entrega reporte final.
- [ ] Cerebro revisa ZIP/branch y aprueba.

---

# PARTE B — PROMPT OPERATIVO DEL AGENTE

Eres el **Agente Senior de Ejecución** de Güegüense.

El Cerebro ha aprobado formalmente la Fase 0.

Queda autorizado comenzar **FASE 1 — Fundación y Estructura Core**.

Tu misión es ejecutar la PARTE A de este mismo archivo.

No eres libre de cambiar el stack ni expandir scope.

---

# 32. Secuencia obligatoria de ejecución

## Paso 1 — Preparación

1. Actualiza `main`.
2. Verifica working tree limpio.
3. Crea:

```text
phase/1-foundation
```

4. Registra versiones del entorno existente.
5. Si faltan requisitos locales como Docker, detente y reporta `BLOCKED_ENVIRONMENT`; no simules que Supabase local pasó.

## Paso 2 — Toolchain

Configura:

```text
Node 24 LTS
pnpm 11 stable exact
Turborepo stable exact
```

Antes de instalar, registra en el reporte cuál versión exacta seleccionaste y por qué es estable.

No usar prereleases.

## Paso 3 — Monorepo

Crea root workspace, Turbo y configs.

No crear nested lockfiles permanentes.

## Paso 4 — Apps

Scaffold:

```text
business-mobile
driver-mobile
admin-web
tracking-web
```

Expo con SDK 57 explícito.

Next con 16.x estable.

Limpia demos innecesarias.

## Paso 5 — Packages

Crea:

```text
types
schemas
domain
ui
config
```

Con package names `@gueguense/...`.

## Paso 6 — Install limpio

Desde root:

```text
pnpm install
```

Verifica árbol de dependencias.

## Paso 7 — Supabase local

Instala CLI project-scoped, inicializa y arranca local stack.

No enlaces producción.

## Paso 8 — Database foundation

Crea migrations por responsabilidad.

No una migration gigante.

Crea solamente las entidades autorizadas de Fase 1.

## Paso 9 — RLS

Implementa deny-by-default y policies foundation.

No abrir tablas para “pasar pruebas”.

## Paso 10 — Tests

Crea pgTAP y tests TypeScript foundation.

Ejecuta todos.

## Paso 11 — Types

Genera tipos DB y compila packages.

## Paso 12 — CI

Crea workflow.

No deploy.

## Paso 13 — Docs

Actualiza estado:

```text
F0 APPROVED
F1 IN REVIEW / CANDIDATE
```

## Paso 14 — Auditoría local final

Ejecuta todos los gates.

## Paso 15 — Push

Push de:

```text
phase/1-foundation
```

NO merge a main.

Después detente.

---

# 33. Comandos y scaffolding — reglas

Puedes usar comandos oficiales de scaffolding.

Expo debe ser equivalente a:

```bash
npx create-expo-app@latest apps/business-mobile --template default@sdk-57
npx create-expo-app@latest apps/driver-mobile --template default@sdk-57
```

Después integrar al pnpm workspace y ejecutar instalación desde root.

Next debe usar `create-next-app` estable y App Router.

No copiar boilerplate aleatorio de repositorios de terceros.

---

# 34. Error handling del agente

Si aparece una incompatibilidad entre Node/pnpm/Expo/Next:

1. consultar documentación oficial;
2. no bajar versiones arbitrariamente;
3. documentar error exacto;
4. aplicar la mínima corrección compatible;
5. si exige cambiar una decisión congelada, DETENERSE.

No ocultar warnings importantes.

---

# 35. Reglas contra "fake completion"

No afirmar:

```text
build pasa
tests pasan
Supabase funciona
Metro funciona
```

sin haber ejecutado realmente el comando.

Para cada gate reportar:

```text
COMMAND
EXIT CODE
RESULT
```

Si el entorno no permite ejecutar un gate:

```text
NOT_EXECUTED — razón
```

No convertir `NOT_EXECUTED` en `PASS`.

---

# 36. Reporte final obligatorio del Agente

Entregar exactamente estas secciones:

## A. Branch y commits

```text
branch:
commit HEAD:
commits creados:
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
Next.js admin:
Next.js tracking:
Supabase CLI:
```

## C. Estructura creada

Árbol resumido.

## D. Database foundation

Migraciones creadas y tablas.

## E. RLS

Policies implementadas y riesgos cubiertos.

## F. Tests

Tabla:

```text
Command | Exit code | Result
```

## G. CI

Qué jobs existen y estado si se pudo ejecutar.

## H. Security scan

Confirmar:

```text
Secrets detectados: 0
Nested lockfiles: 0
node_modules tracked: 0
```

## I. Deviations

Cualquier diferencia respecto a esta directiva.

Si no hay:

```text
None
```

## J. Pending decisions

Solo decisiones reales del Cerebro.

## K. Definition of Done

Copiar checklist Fase 1 y marcar:

```text
PASS
FAIL
NOT_EXECUTED
BLOCKED
```

## L. Estado

Terminar exactamente:

```text
FASE 1 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENTE.

No iniciar Fase 2.

---

# 37. Política de auditoría del Cerebro

El Cerebro revisará:

1. estructura real del repo;
2. package manifests;
3. lockfile;
4. versions;
5. tsconfigs;
6. app configs;
7. migrations;
8. RLS;
9. pgTAP;
10. CI;
11. secrets;
12. scope creep.

Fase 1 no será aprobada por un reporte textual del agente.

Se revisará el contenido real del repositorio.

---

# FIN DEL PAQUETE ÚNICO — FASE 1
