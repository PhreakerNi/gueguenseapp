# 02 — MODELO DE ROLES Y MEMBRESÍAS (USER ROLES & PERMISSIONS)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Control de Acceso, Identidad `auth.users`, Roles de Plataforma, Membresías Comerciales y RLS  

---

## 1. Arquitectura de Identidad y Roles Desacoplados

Güegüense no limita a un usuario a un único rol global en su perfil. La autenticación se basa en **Supabase Auth (`auth.users`)**, separando los **Roles de Plataforma** de las **Membresías Comerciales** y el **Perfil de Conductor**.

```text
                                  ┌────────────────────────┐
                                  │      auth.users        │
                                  └───────────┬────────────┘
                                              │
         ┌────────────────────────────────────┼────────────────────────────────────┐
         │ (1:1)                              │ (1:N)                              │ (1:1)
┌────────▼─────────┐                ┌─────────▼─────────┐                ┌─────────▼─────────┐
│ public.profiles  │                │ business_members  │                │   public.drivers  │
│ (Platform Roles) │                │(Business Roles)   │                │ (Driver Profile)  │
└──────────────────┘                └───────────────────┘                └───────────────────┘
```

Una misma persona (un mismo `auth.users.id`) puede ser legalmente propietario de un negocio en `business_members` y simultáneamente estar registrado como conductor en `drivers`.

---

## 2. Definición Canónica de Roles

### 2.1 Roles de Plataforma (`PLATFORM_ROLE`)
Definidos en `public.profiles.platform_role`:
* **`super_admin`:** Control total del sistema, variables globales, MFA obligatorio y auditoría contable.
* **`admin`:** Gestión operativa, aprobación de retiros, configuración de tarifas y disputas.
* **`operator`:** Monitoreo en vivo, soporte e intervención en incidentes/devoluciones/traspasos.
* **`verification_agent`:** Auditoría de la cola de revisión de documentos de conductores (`driver_documents`).

### 2.2 Roles de Membresía Comercial (`BUSINESS_MEMBER_ROLE`)
Definidos en `public.business_members.role`:
* **`business_owner`:** Propietario legal del comercio. Acceso a facturación, gestión de sucursales y creación de empleados.
* **`business_manager`:** Gerente de sucursal. Administra entregas y sucursales asignadas.
* **`business_employee`:** Despachador de caja. Solicita envíos y entrega el paquete al motorizado validando la custodia.

### 2.3 Perfil de Conductor (`drivers`)
* Registro en `public.drivers` vinculado a `auth.users.id`. Posee estado de verificación (`verification_status`), estado de cuenta (`account_status`) y estado operacional (`operational_state`).

### 2.4 Destinatario / Cliente Final (`customer`)
* Acceso sin cuenta permanente mediante credencial de tracking válida (`holder of a valid customer/tracking credential`).

---

## 3. Matriz Canónica de Permisos por Recurso (RBAC & RLS)

| Recurso / Operación | super_admin | admin | operator | verification_agent | business_owner | business_employee | driver | Tracking Credential |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Gestionar Roles Admin** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Aprobar Documentos Driver** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Configurar Tarifas/Zonas** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Crear Cotización / Delivery** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Validar `PICKUP_CODE`** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Ver `DELIVERY_OTP` (Plano)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (En Pantalla Web) |
| **Ingresar `DELIVERY_OTP`** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (En App Driver) | ❌ |
| **Aceptar Oferta Delivery** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Reasignar / Hand-off** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ver Documentos Cifrados** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ (Propios) | ❌ |
