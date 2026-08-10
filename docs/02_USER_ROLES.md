# 02 — MODELO DE ROLES Y MEMBRESÍAS (USER ROLES & PERMISSIONS)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Control de Acceso, Identidad `auth.users`, Roles de Plataforma, Membresías Comerciales (N:M Sucursales) y RBAC  

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
└──────────────────┘                └─────────┬─────────┘                └───────────────────┘
                                              │ (1:N)
                                    ┌─────────▼──────────────────┐
                                    │business_member_locations   │
                                    │ (Scope N:M de Sucursales)  │
                                    └────────────────────────────┘
```

---

## 2. Membresías Comerciales y Alcance N:M de Sucursales (`business_member_locations`)

Para evitar ambigüedades en gerentes que administran múltiples sucursales, el alcance de permisos se modela mediante la tabla intermedia N:M **`public.business_member_locations`**:

* **`business_owner`:** Alcance global implícito sobre todas las sucursales pasadas, presentes y futuras del comercio.
* **`business_manager`:** Gerente de sucursal. Asociado a 1 o N sucursales en `business_member_locations`. Puede crear/cancelar entregas y gestionar personal dentro de sus sucursales asignadas.
* **`business_employee`:** Despachador de caja. Asociado a 1 o N sucursales específicas. Crea envíos y confirma la transferencia de custodia en sucursal.

---

## 3. Matriz Canónica de Permisos por Recurso (RBAC & RLS)

| Recurso / Operación | super_admin | admin | operator | verification_agent | business_owner | business_manager | business_employee | driver | Tracking Token Holder |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Gestionar Roles Admin** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Aprobar Documentos Driver** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Configurar Tarifas/Zonas** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Crear Cotización / Delivery** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ (Scope N:M) | ✅ (Scope N:M) | ❌ | ❌ |
| **Validar `PICKUP_CODE` (Custodia)**| ✅ | ✅ | ✅ | ❌ | ✅ | ✅ (Scope N:M) | ✅ (Scope N:M) | ❌ | ❌ |
| **Ver `DELIVERY_OTP` (Plano)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Endpoint Customer) |
| **Ingresar `DELIVERY_OTP`** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Aceptar Oferta Delivery** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Aprobar Controlled Handoff** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ver Documentos Cifrados** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ (Propios) | ❌ |
