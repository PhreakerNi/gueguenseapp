# 02 — MODELO DE ROLES Y MEMBRESÍAS (USER ROLES & PERMISSIONS)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Control de Acceso, Roles de Plataforma, Membresías Comerciales y Políticas RLS  

---

## 1. Rediseño de Arquitectura de Roles

Güegüense no limita a un usuario a un único rol global rígido en su perfil. La autenticación se desacopla mediante **Supabase Auth (`auth.users`)**, separando los **Roles de Plataforma** de las **Membresías Comerciales** y el **Perfil de Conductor**.

```text
                                  ┌────────────────────────┐
                                  │      auth.users        │
                                  └───────────┬────────────┘
                                              │
         ┌────────────────────────────────────┼────────────────────────────────────┐
         │ (1:1)                              │ (1:N)                              │ (1:1)
┌────────▼─────────┐                ┌─────────▼─────────┐                ┌─────────▼─────────┐
│ public.profiles  │                │ business_members  │                │  public.drivers   │
│ (Platform Roles) │                │(Business Roles)   │                │ (Driver Profile)  │
└──────────────────┘                └───────────────────┘                └───────────────────┘
```

Una misma persona (un mismo `auth.users.id`) puede ser legalmente propietario de un negocio en `business_members` y simultáneamente estar registrado como conductor en `drivers`.

---

## 2. Definición de Roles

### 2.1 Roles de Plataforma (`public.profiles.platform_role`)
Asignados exclusivamente al personal administrativo y operativo de Güegüense:

1. **`super_admin`:** Control total del sistema, infraestructura, variables globales y auditoría contable. Requiere MFA obligatorio.
2. **`admin`:** Gestión operativa diaria, aprobación de retiros, configuración de tarifas y disputas.
3. **`operator`:** Monitoreo en vivo de entregas, soporte directo e intervención/reasignación de incidencias.
4. **`verification_agent`:** Auditoría de la cola de revisión de documentos de conductores (`driver_documents`).

### 2.2 Roles de Membresía Comercial (`public.business_members.role`)
Asignados a los usuarios pertenecientes a una empresa cliente (`business_id`):

1. **`business_owner`:** Propietario legal del comercio. Acceso a facturación, gestión de sucursales y creación de empleados.
2. **`business_manager`:** Gerente de sucursal. Administra entregas y sucursales asignadas.
3. **`business_employee`:** Operador de caja / Despachador. Solicita envíos en el día a día y obtiene el `PICKUP_CODE` para la entrega al motorizado.

### 2.3 Perfil de Conductor (`public.drivers`)
1. **`driver`:** Conductor independiente. Gestiona disponibilidad, recibe ofertas, efectúa entregas y solicita retiros.

### 2.4 Destinatario / Cliente Final (`customer`)
* Acceso tokenizado sin login a la Web de Tracking mediante la verificación de hash de token (`token_hash`).

---

## 3. Reglas Críticas de Seguridad y Permisos de Códigos

1. **`PICKUP_CODE` (Código de Recogida):**
   * Visible para el `business_employee` / `business_manager` y transmitido al conductor al llegar a la sucursal para validar la cadena de custodia física.
   * **REGLA DE SEGURIDAD:** Este código NO confirma la entrega final ni cambia el estado a `DELIVERED`.
2. **`DELIVERY_OTP` (Código de Entrega al Cliente):**
   * Generado de forma segura y transmitido **exclusivamente al cliente final** vía SMS / WhatsApp / Web Tracking.
   * **NUNCA** se revela por API al conductor, negocio ni operadores.
   * El conductor en la App Driver **solo posee una caja de texto** para ingresar el código que el cliente le dicte verbalmente.

---

## 4. Matriz de Permisos por Recurso (RBAC & RLS Matrix)

| Recurso / Operación | super_admin | admin | operator | verification_agent | business_owner | business_employee | driver | customer (Token) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Gestionar Roles Admin** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Aprobar Documentos Driver** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Configurar Tarifas/Zonas** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Crear Solicitud Delivery** | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Ver `PICKUP_CODE`** | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| **Ver `DELIVERY_OTP` (Raw)** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (Público) |
| **Ingresar `DELIVERY_OTP`** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ (En App) | ❌ |
| **Aceptar Oferta Delivery** | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Reasignar Conductor** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ver Documentos Cifrados** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ (Propios) | ❌ |
