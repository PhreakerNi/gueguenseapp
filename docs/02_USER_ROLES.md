# 02 — MODELO DE ROLES Y MEMBRESÍAS (USER ROLES & PERMISSIONS)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Control de Acceso, Identidad `auth.users`, Roles de Plataforma, Membresías Comerciales y Permisos RBAC  

---

## 1. Arquitectura de Identidad y Roles Desacoplados

Güegüense basa su autenticación en **Supabase Auth (`auth.users`)**, separando los **Roles de Plataforma** de las **Membresías Comerciales** y el **Perfil de Conductor**.

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

---

## 2. Definición Canónica de Roles y Alcance de Sucursal (`location_scope`)

### 2.1 Roles de Plataforma (`PLATFORM_ROLE`)
Definidos en `public.profiles.platform_role`:
* **`super_admin`:** Control total del sistema, variables globales, MFA obligatorio y auditoría contable.
* **`admin`:** Gestión operativa, aprobación de retiros, configuración de tarifas y disputas.
* **`operator`:** Monitoreo en vivo, soporte e intervención en incidentes/devoluciones/traspasos.
* **`verification_agent`:** Auditoría de la cola de revisión de documentos de conductores (`driver_documents`).

### 2.2 Roles de Membresía Comercial (`BUSINESS_MEMBER_ROLE`) y `location_scope`
Definidos en `public.business_members.role`:
* **`business_owner`:** Propietario legal de la empresa. Acceso total a todas las sucursales, facturación, cuentas de ledger y miembros.
* **`business_manager`:** Gerente de sucursal. Restringido por `location_scope` (UUID de `business_locations`). Puede crear/cancelar entregas y gestionar empleados de sus sucursales asignadas.
* **`business_employee`:** Despachador de caja. Restringido por `location_scope`. Solicita envíos y confirma la transferencia de custodia entregando el paquete al motorizado.

---

## 3. Matriz Canónica de Permisos por Recurso (RBAC & RLS)

| Recurso / Operación | super_admin | admin | operator | verification_agent | business_owner | business_manager | business_employee | driver | Tracking Token Holder |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Gestionar Roles Admin** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Aprobar Documentos Driver** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Configurar Tarifas/Zonas** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Crear Cotización / Delivery** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (Scope) | ✅ (Scope) | ❌ | ❌ |
| **Validar `PICKUP_CODE` (Custodia)**| ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (Scope) | ✅ (Scope) | ❌ | ❌ |
| **Ver `DELIVERY_OTP` (Plano)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Endpoint Customer) |
| **Ingresar `DELIVERY_OTP`** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Aceptar Oferta Delivery** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Aprobar Controlled Handoff** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ver Documentos Cifrados** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ (Propios) | ❌ |
