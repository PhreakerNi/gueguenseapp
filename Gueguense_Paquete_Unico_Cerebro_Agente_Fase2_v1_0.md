# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 2 v1.0

**Fase:** 2 — Autenticación, Gestión de Identidad y Sesiones  
**Estado de entrada:** ✅ FASE 1 APROBADA  
**Commit Foundation aprobado:** `49a6ee944861d36beb8272650481cf4a0d56119c`  
**GitHub Actions aprobado:** `32086480941`  
**Repositorio:** `PhreakerNi/gueguenseapp`  
**Objetivo:** implementar autenticación e identidad segura para Business Mobile, Driver Mobile y Admin Web sin invadir el Onboarding de Fase 3.

---

# 0. VEREDICTO FORMAL DEL CEREBRO

La Fase 1 queda formalmente cerrada:

```text
✅ Code Quality & Monorepo Gates
✅ Mobile Apps SDK 57 & Metro Export Gates
✅ Supabase Foundation DB & pgTAP RLS Gates
✅ DB reset
✅ pgTAP 60/60
✅ Database Types Drift 0
```

Por tanto:

```text
✅ FASE 1 — APROBADA
🟢 FASE 2 — AUTORIZADA PARA INICIAR
```

No reabrir Fase 1 por mejoras opcionales.

---

# 1. SECUENCIA DE RAMAS OBLIGATORIA

La Fase 2 NO se desarrolla sobre `phase/1-foundation`.

Secuencia:

1. Crear Pull Request:
   `phase/1-foundation` → `main`.
2. Confirmar checks verdes.
3. Hacer merge mediante PR, sin force-push.
4. Actualizar local:
   ```bash
   git checkout main
   git pull --ff-only origin main
   ```
5. Crear:
   ```bash
   git checkout -b phase/2-auth-identity-sessions
   git push -u origin phase/2-auth-identity-sessions
   ```

Si el agente no puede completar el merge por permisos:

```text
DETENERSE
```

Entregar la URL del PR y NO iniciar Fase 2 desde otra base.

---

# 2. FUENTES CANÓNICAS A LEER ANTES DE EDITAR

Leer completas:

```text
docs/01_PRODUCT_SPEC.md
docs/02_USER_ROLES.md
docs/03_USER_FLOWS.md
docs/05_SYSTEM_ARCHITECTURE.md
docs/06_DATABASE_ARCHITECTURE.md
docs/07_API_CONTRACTS.md
docs/12_SECURITY_ARCHITECTURE.md
docs/17_TESTING_STRATEGY.md
docs/19_DEPLOYMENT_ARCHITECTURE.md
docs/20_DEVELOPMENT_ROADMAP.md
docs/21_CANONICAL_ENUMS.md
```

Auditar además la implementación real heredada de Fase 1:

```text
apps/business-mobile
apps/driver-mobile
apps/admin-web
apps/tracking-web
packages/types
packages/schemas
packages/domain
supabase/migrations
supabase/tests
.github/workflows
```

La implementación real del repo y los documentos canónicos tienen prioridad sobre suposiciones.

---

# 3. ALCANCE ESTRICTO DE FASE 2

Fase 2 INCLUYE exclusivamente:

```text
Supabase Auth
registro de cuenta
login
logout
recuperación de contraseña
callbacks/deep links de autenticación
persistencia segura de sesión
refresh/restauración de sesión
bootstrap de identidad
route guards
guards por perfil/rol/status
Admin SSR auth
MFA TOTP para Admin
pruebas de auth/session
CI de auth/session
```

Fase 2 NO INCLUYE:

```text
crear empresas
crear sucursales
invitar miembros
crear onboarding Driver
cargar documentos Driver
crear vehículos
verificación documental
cotizaciones
deliveries
dispatch
ofertas
GPS
tracking operativo
PICKUP_CODE
DELIVERY_OTP
retornos
handoffs
incidentes
pricing
ledger
cash settlements
payouts
push notifications
panel operativo Admin completo
```

Todo eso pertenece a fases posteriores.

---

# 4. IDENTIDAD CANÓNICA — INVARIANTE

La única identidad raíz es:

```text
auth.users
```

Se conserva:

```text
auth.users
   ├── 1:1 public.profiles
   ├── 1:N public.business_members
   └── 1:1 public.drivers
```

PROHIBIDO crear:

```text
public.users
app_users
users_profile duplicado
custom auth table
```

`public.profiles` es perfil extendido, NO proveedor de autenticación.

---

# 5. MÉTODO DE AUTENTICACIÓN MVP DE FASE 2

Implementar:

```text
Email + Password
```

No implementar todavía:

```text
Google OAuth
Apple Sign-In
Facebook
phone OTP login
magic-link como método principal
```

Registro público permitido:

```text
Business Mobile
Driver Mobile
```

Registro público NO permitido:

```text
Admin Web
```

Las cuentas administrativas son aprovisionadas de forma controlada y su acceso depende de `public.profiles.platform_role`.

---

# 6. SEPARACIÓN AUTH VS ONBOARDING

El signup de Fase 2 crea únicamente:

```text
auth.users
+
public.profiles
```

`public.profiles` debe seguir creándose mediante el trigger Foundation existente.

NO crear automáticamente:

```text
businesses
business_members
business_locations
drivers
driver_documents
vehicles
```

Después del login:

Business Mobile:

```text
sin business_members → ONBOARDING_REQUIRED
```

Driver Mobile:

```text
sin drivers row → ONBOARDING_REQUIRED
```

El shell puede mostrar:

```text
"Tu cuenta está lista. Completa tu registro para continuar."
```

pero NO implementar el onboarding real. Eso corresponde a Fase 3.

---

# 7. BOOTSTRAP DE IDENTIDAD COMPARTIDO

Crear un modelo tipado compartido equivalente a:

```ts
type IdentityContext = {
  userId: string;
  email: string | null;
  profile: {
    platformRole:
      | "super_admin"
      | "admin"
      | "operator"
      | "verification_agent"
      | "none";
    fullName: string | null;
    phone: string | null;
    avatarUrl: string | null;
  };
  businessMemberships: Array<{
    membershipId: string;
    businessId: string;
    role: "business_owner" | "business_manager" | "business_employee";
    status: "ACTIVE" | "INVITED" | "SUSPENDED";
  }>;
  driver: null | {
    verificationStatus:
      | "PENDING"
      | "UNDER_REVIEW"
      | "VERIFIED"
      | "REJECTED"
      | "EXPIRED";
    accountStatus: "REGISTERED" | "ACTIVE" | "SUSPENDED" | "BLOCKED" | "CLOSED";
  };
};
```

Nunca autorizar desde:

```text
raw_user_meta_data.role
metadata editable por cliente
parámetros enviados por UI
```

Los roles y estados efectivos se obtienen de DB protegida por RLS.

---

# 8. BUSINESS MOBILE — AUTH

Implementar estructura Expo Router equivalente a:

```text
app/
  _layout.tsx
  (auth)/
    login.tsx
    register.tsx
    forgot-password.tsx
    reset-password.tsx
  (protected)/
    index.tsx
    onboarding-required.tsx
    account-restricted.tsx
```

Requisitos:

- login Email/Password;
- signup `auth.users`;
- manejo de email no confirmado si la configuración lo exige;
- recuperación de contraseña;
- logout;
- restauración automática de sesión;
- loading/splash mientras se resuelve la sesión;
- no mostrar una ruta protegida antes de terminar el bootstrap;
- sin membresía → `onboarding-required`;
- membresía `SUSPENDED` → `account-restricted`;
- negocio asociado `SUSPENDED`, `BLOCKED` o `CLOSED` → acceso operativo restringido.

NO crear negocios ni miembros en esta fase.

---

# 9. DRIVER MOBILE — AUTH

Estructura equivalente:

```text
app/
  _layout.tsx
  (auth)/
    login.tsx
    register.tsx
    forgot-password.tsx
    reset-password.tsx
  (protected)/
    index.tsx
    onboarding-required.tsx
    account-restricted.tsx
```

Después del login:

```text
drivers row inexistente → ONBOARDING_REQUIRED
```

Si existe:

```text
REGISTERED → shell pendiente/onboarding
ACTIVE     → shell protegido
SUSPENDED  → account-restricted
BLOCKED    → account-restricted
CLOSED     → account-restricted
```

No crear fila `drivers` en F2.

No implementar disponibilidad ni ofertas.

---

# 10. PERSISTENCIA SEGURA DE SESIÓN MOBILE

Endurecer los clientes Supabase mobile Foundation.

Usar almacenamiento seguro compatible con Expo SDK 57.

Preferencia:

```text
expo-secure-store
```

Instalar únicamente mediante Expo:

```bash
pnpm --filter @gueguense/business-mobile exec expo install expo-secure-store
pnpm --filter @gueguense/driver-mobile exec expo install expo-secure-store
```

Configurar el cliente Supabase para React Native con:

```text
persistSession = true
autoRefreshToken = true
detectSessionInUrl = false
storage adapter seguro
```

Gestionar `AppState` correctamente para auto-refresh cuando la app está activa.

PROHIBIDO guardar tokens/sesiones en almacenamiento plano propio.

PROHIBIDO loguear:

```text
access_token
refresh_token
session JSON
```

---

# 11. ADMIN WEB — SSR AUTH

`admin-web` ya dispone de `@supabase/ssr`.

Crear separación clara, por ejemplo:

```text
src/lib/supabase/client.ts
src/lib/supabase/server.ts
src/lib/auth/*
```

y protección de requests/rutas compatible con Next.js App Router.

Implementar:

```text
/login
/forgot-password
/reset-password
/auth/callback
área protegida
```

Reglas:

- cookies de sesión gestionadas con patrón SSR de Supabase;
- refresh server-side;
- `platform_role = none` NO puede entrar al Admin;
- roles permitidos:
  `super_admin`, `admin`, `operator`, `verification_agent`;
- sesión válida NO equivale a autorización Admin;
- NO usar Service Role Key para autenticar usuarios.

---

# 12. MFA ADMIN — OBLIGATORIO

La arquitectura de seguridad exige MFA para Admin.

Implementar TOTP MFA para:

```text
super_admin
admin
operator
verification_agent
```

Flujo:

```text
Password válido
→ AAL1
→ si no hay factor: enrollment MFA
→ challenge TOTP
→ AAL2
→ acceso al shell Admin
```

No permitir acceso al shell Admin únicamente con AAL1.

Crear helpers reutilizables para que fases posteriores puedan exigir step-up AAL2 en acciones sensibles.

No implementar todavía operaciones de Fase 18.

---

# 13. PASSWORD RECOVERY Y DEEP LINKS

Mobile:

```text
gueguense-business://
gueguense-driver://
```

Configurar rutas de recuperación/callback adecuadas sin exponer tokens en logs.

Admin Web:

```text
/auth/callback
/reset-password
```

Validar allowlist de redirect URLs por entorno.

No aceptar redirect URL arbitraria enviada por cliente.

---

# 14. TRACKING WEB

`tracking-web` NO utiliza cuentas Supabase Auth.

Mantener:

```text
sin login
sin signup
sin customer account
sin customer profile
```

Su modelo continúa siendo Bearer Tracking Token y pertenece a otra fase.

---

# 15. GUARDS POR ESTADO REAL

Business:

```text
business_members.status
businesses.account_status
```

Driver:

```text
drivers.account_status
drivers.verification_status
```

Admin:

```text
profiles.platform_role
```

No codificar autorización únicamente en UI.

Los estados restringidos producen un shell de acceso limitado; no borrar automáticamente identidad ni datos.

---

# 16. PROFILE UPDATE — LÍMITE

Puede implementarse edición segura de:

```text
full_name
avatar_url
phone
```

NUNCA:

```text
platform_role
business_members.role
business_members.status
drivers.verification_status
drivers.account_status
```

Si se implementa escritura de perfil, preferir RPC específica con:

```sql
SECURITY DEFINER
SET search_path = ''
```

schema qualification, validación de `auth.uid()` y permisos mínimos.

Si no es necesaria para cerrar F2, POSPONERLA.

---

# 17. ERRORES NORMALIZADOS

Crear manejo tipado de errores equivalente a:

```text
AUTH_INVALID_CREDENTIALS
AUTH_EMAIL_NOT_CONFIRMED
AUTH_USER_ALREADY_EXISTS
AUTH_WEAK_PASSWORD
AUTH_SESSION_EXPIRED
AUTH_PASSWORD_RECOVERY_INVALID
AUTH_MFA_REQUIRED
AUTH_MFA_INVALID
AUTH_ADMIN_ROLE_REQUIRED
AUTH_ACCOUNT_RESTRICTED
AUTH_ONBOARDING_REQUIRED
AUTH_NETWORK_ERROR
```

No mostrar stack traces ni mensajes internos sin sanitizar.

---

# 18. SEGURIDAD DE LOGS

Nunca loguear:

```text
password
access_token
refresh_token
Authorization header
MFA TOTP code
recovery token
session JSON
service_role
```

Observabilidad permitida:

```text
user_id
app
event_name
result
error_code normalizado
```

sin secretos.

---

# 19. SUPABASE LOCAL Y ENTORNOS

Mantener:

```text
Supabase CLI 2.110.0
```

No actualizarlo en F2.

Auth local debe ser reproducible para CI.

`.env.example` y `supabase/config.toml` no deben contener secretos reales.

Separar correctamente variables públicas y server-only.

---

# 20. RLS Y PRIVILEGIOS

Foundation permanece como baseline.

Todo cambio F2 debe cumplir:

```text
mínimo privilegio
RLS explícito
sin ALL a authenticated
sin acceso anon a identidad privada
sin modificación cliente de roles/status sensibles
```

No debilitar las 60 assertions Foundation.

Las pruebas F2 se SUMAN.

---

# 21. TESTS OBLIGATORIOS F2

Demostrar como mínimo:

```text
1. signup crea auth.users
2. trigger crea public.profiles
3. login válido produce sesión
4. login inválido es rechazado
5. logout elimina/invalida sesión del cliente
6. session restore / refresh funciona
7. usuario A no puede leer profile de usuario B
8. usuario normal no puede cambiar platform_role
9. usuario sin membership → ONBOARDING_REQUIRED Business
10. usuario sin drivers row → ONBOARDING_REQUIRED Driver
11. driver SUSPENDED → ACCOUNT_RESTRICTED
12. membership SUSPENDED → ACCOUNT_RESTRICTED
13. platform_role=none no entra a Admin
14. platform role permitido requiere MFA/AAL2
15. Admin con MFA correcto alcanza AAL2
16. tracking-web sigue sin account auth
17. secretos/tokens no aparecen en outputs de tests
```

Mantener:

```text
Foundation pgTAP 60/60 PASS
```

---

# 22. CI FASE 2

Conservar todos los gates existentes:

```text
format
lint
typecheck
unit tests
Next builds
Expo config
expo install --check
expo-doctor
Metro Android exports
Supabase CLI exact version
db reset
Foundation pgTAP
DB generated types drift
```

Añadir un gate reproducible de Auth/Session.

Ninguna prueba debe depender de cuentas SaaS personales o credenciales manuales.

---

# 23. DEPENDENCIAS

Mantener stack aprobado:

```text
Node.js        24.18.0
pnpm           11.17.0
Turbo          2.10.7
Next.js        16.2.12
Expo SDK       57 / expo 57.0.14
React          19.2.3
React Native   0.86.2
Supabase CLI   2.110.0
```

Cambios de `pnpm-lock.yaml` permitidos SOLO por dependencias justificadas de F2, por ejemplo `expo-secure-store`.

No hacer upgrades generales.

---

# 24. DOCUMENTACIÓN

Actualizar:

```text
README.md
docs/20_DEVELOPMENT_ROADMAP.md
```

Estado durante desarrollo:

```text
FASE 1 — ✅ APROBADA
FASE 2 — 🟡 EN IMPLEMENTACIÓN / REVISIÓN
```

No alterar arquitectura de otras fases.

---

# 25. DEFINITION OF DONE — FASE 2

Fase 2 será candidata únicamente con:

```text
✅ Fase 1 merged a main mediante PR
✅ phase/2-auth-identity-sessions creada desde main aprobado
✅ Business signup/login/logout/recovery
✅ Driver signup/login/logout/recovery
✅ sesiones mobile persistidas de forma segura
✅ IdentityContext
✅ guards membership/driver/account status
✅ Admin SSR auth
✅ Admin platform role guard
✅ Admin MFA TOTP + AAL2
✅ tracking-web sin account auth
✅ no public.users
✅ no onboarding F3 implementado
✅ roles/status sensibles no editables por clientes
✅ auth/session tests
✅ Foundation pgTAP sigue 60/60
✅ DB types drift 0
✅ Quality PASS
✅ Mobile PASS
✅ Database/Auth PASS
✅ sin secretos en repo/logs
```

---

# 26. REPORTE FINAL DEL AGENTE

Entregar exactamente:

```text
Base main SHA:
Phase 1 PR URL:
Phase 1 merge SHA:

Phase 2 branch:
Final Phase 2 candidate SHA:
GitHub Actions Run URL exacta:

Quality:
Mobile:
Database:
Auth/Session:

Foundation pgTAP:
F2 auth tests:
DB Types Drift:

Business:
  signup:
  login:
  logout:
  recovery:
  secure session:
  onboarding guard:

Driver:
  signup:
  login:
  logout:
  recovery:
  secure session:
  onboarding guard:
  account status guard:

Admin:
  SSR session:
  platform role guard:
  MFA enrollment:
  MFA challenge:
  AAL2 guard:

Tracking Web account auth added: NO
public.users created: NO
Fase 3 onboarding implemented: NO
Delivery/Dispatch/OTP/Tracking implemented: NO
```

Terminar:

```text
FASE 2 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

y DETENERSE.

NO iniciar Fase 3.

---

# PROMPT OPERATIVO DEL AGENTE

Lee COMPLETAMENTE este archivo antes de modificar el repo.

La Fase 1 está formalmente APROBADA sobre:

```text
49a6ee944861d36beb8272650481cf4a0d56119c
```

y GitHub Actions:

```text
32086480941
```

Primero integra `phase/1-foundation` a `main` mediante Pull Request con checks verdes. No uses force-push. Si no puedes hacer el merge, DETENTE y entrega el PR URL.

Después crea:

```text
phase/2-auth-identity-sessions
```

desde el `main` actualizado.

Implementa EXCLUSIVAMENTE:

```text
Supabase Auth
Email/Password
signup de auth.users
login/logout/recovery
sesión segura Expo
IdentityContext
route guards
Admin SSR auth
Admin platform-role guard
Admin MFA TOTP/AAL2
tests y CI
```

NO implementes Onboarding Fase 3.
NO crees empresas, sucursales, memberships o drivers durante signup.
NO implementes Delivery, Dispatch, GPS, OTP, Tracking, Finanzas ni Push.
NO crees `public.users`.
NO expongas Service Role Key.
NO permitas editar `platform_role`, `account_status` o `verification_status` desde clientes.

Usa `expo-secure-store` para persistencia segura mobile y conserva Expo SDK 57 compatible.

Mantén el stack aprobado y todos los gates verdes.

Haz commit/push SOLO en la rama F2, espera el CI completo, entrega el reporte de la sección 26 y DETENTE.

# FIN — FASE 2 v1.0
