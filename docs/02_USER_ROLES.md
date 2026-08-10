# 02 — MODELO DE ROLES Y PERMISOS (USER ROLES & PERMISSIONS)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Control de Acceso, Roles, Permisos y Visibilidad de Datos  

---

## 1. Definición Global de Roles

Güegüense implementa un modelo de control de acceso jerárquico y granular basado en roles (**RBAC**). El sistema distingue estrictamente entre los roles administrativos de la plataforma, los usuarios del negocio, los conductores y los consumidores finales.

```text
                               ┌─────────────────────────┐
                               │       SUPER_ADMIN       │
                               └────────────┬────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               │                            │                            │
     ┌─────────▼─────────┐        ┌─────────▼─────────┐        ┌─────────▼─────────┐
     │       ADMIN       │        │     OPERATOR      │        │VERIFICATION_AGENT │
     └───────────────────┘        └───────────────────┘        └───────────────────┘

               ┌────────────────────────────┬────────────────────────────┐
               │                            │                            │
     ┌─────────▼─────────┐        ┌─────────▼─────────┐        ┌─────────▼─────────┐
     │  BUSINESS_OWNER   │        │ BUSINESS_MANAGER  │        │ BUSINESS_EMPLOYEE │
     └───────────────────┘        └───────────────────┘        └───────────────────┘

               ┌────────────────────────────┬────────────────────────────┐
               │                            │                            │
     ┌─────────▼─────────┐                                     ┌─────────▼─────────┐
     │      DRIVER       │                                     │     CUSTOMER      │
     └───────────────────┘                                     └───────────────────┘
```

---

## 2. Especificación Detallada por Rol

### 2.1 Rol: `super_admin` (Super Administrador del Sistema)
* **Responsabilidad:** Control total de la infraestructura, configuraciones globales, gestión de administradores y acceso a registros de auditoría financiera profunda.
* **Permisos Clave:**
  * Crear, suspender o degradar cuentas de `admin`, `operator` y `verification_agent`.
  * Modificar parámetros críticos del sistema (comisiones globales, claves secretas de pasarelas, reglas del Dispatch Engine).
  * Ejecutar ajustes contables manuales de alto nivel en el Ledger Financiero.
  * Acceso irrestricto a todos los recursos y tablas de la base de datos via políticas RLS de bypass/admin.
* **Restricciones:** Ninguna técnica; requiere autenticación de dos factores (**MFA**) obligatoria.

### 2.2 Rol: `admin` (Administrador de Operaciones)
* **Responsabilidad:** Gestión diaria de la plataforma, supervisión general de negocios y conductores, configuración de tarifas y resolución de escalaciones operativas.
* **Permisos Clave:**
  * Aprobar o suspender cuentas de negocios (`businesses`) y motorizados (`drivers`).
  * Configurar zonas de precios, precios por kilómetro, tarifas base y reglas de horario.
  * Ver el mapa general de flota activa y entregas globales en tiempo real.
  * Aprobar o rechazar retiros financieros (`payouts`) solicitados por motorizados.
  * Intervenir y cancelar entregas en disputa con reasignación autorizada.
* **Restricciones:** No puede modificar configuraciones globales del sistema ni crear usuarios `super_admin`.

### 2.3 Rol: `operator` (Operador de Despacho e Incidencias)
* **Responsabilidad:** Monitoreo activo de la flota en ruta, soporte directo a negocios y drivers, y resolución de incidencias en entregas activas.
* **Permisos Clave:**
  * Visualizar entregas en estado `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `TO_PICKUP`, `TO_DROPOFF`.
  * Reasignar manualmente una entrega a un nuevo motorizado verificado si el conductor actual sufre una avería o retraso crítico.
  * Contactar por canal interno a negocio, motorizado o cliente para destrabar una entrega.
  * Registrar notas operativas e incidencias en el historial de un delivery.
* **Restricciones:** No puede modificar tarifas globales, aprobar documentos de verificación ni autorizar desembolsos de dinero.

### 2.4 Rol: `verification_agent` (Agente de Verificación Documental)
* **Responsabilidad:** Auditar la legalidad e integridad de la documentación presentada por los candidatos a motorizados.
* **Permisos Clave:**
  * Acceder a la cola de revisión de documentos (`driver_documents`): Cédula de identidad, Licencia de conducir, Matrícula de motocicleta, Seguro vehicular.
  * Visualizar imágenes y archivos privados en almacenamiento seguro mediante URLs firmadas de corta duración.
  * Aprobar o rechazar documentos con motivo justificado.
  * Cambiar el estado del motorizado de `UNDER_REVIEW` a `VERIFIED` o `REJECTED`.
* **Restricciones:** Acceso exclusivo al módulo de verificación. No puede intervenir en operaciones de entrega ni modificar datos financieros.

### 2.5 Rol: `business_owner` (Propietario del Comercio)
* **Responsabilidad:** Representante legal y administrativo del negocio en Güegüense.
* **Permisos Clave:**
  * Crear y administrar sucursales (`business_locations`).
  * Registrar empleados del negocio (`business_employee`, `business_manager`).
  * Configurar métodos de pago corporativos y consultar estados de cuenta/facturación.
  * Crear, consultar y cancelar solicitudes de delivery para cualquiera de sus sucursales.
* **Restricciones:** Solo puede ver datos pertenecientes a su propio negocio (`business_id`). Prohibido acceder a datos de otros comercios o motorizados no asignados a su entrega.

### 2.6 Rol: `business_manager` (Gerente de Sucursal)
* **Responsabilidad:** Administrar la operación logística de una o varias sucursales específicas.
* **Permisos Clave:**
  * Crear solicitudes de delivery en nombre de la sucursal asignada.
  * Monitorear entregas activas y rastrear al motorizado en camino.
  * Calificar al motorizado una vez completado el servicio.
* **Restricciones:** No puede alterar configuraciones de facturación corporativa ni eliminar el negocio.

### 2.7 Rol: `business_employee` (Operador de Caja / Despachador de Negocio)
* **Responsabilidad:** Solicitar motorizados en el día a día para entregas rápidas.
* **Permisos Clave:**
  * Cotizar y presionar "Solicitar Delivery".
  * Ver el estado del motorizado entrante (*En camino a la sucursal*).
  * Obtener el PIN o código de entrega para entregárselo al motorizado junto con el paquete.
* **Restricciones:** No puede acceder a reportes financieros avanzados ni modificar datos de la empresa.

### 2.8 Rol: `driver` (Motorizado / Conductor)
* **Responsabilidad:** Transportar el paquete desde la sucursal del negocio hasta la dirección del cliente final de forma segura y puntual.
* **Permisos Clave:**
  * Alternar su estado operativo (`AVAILABLE` / `OFFLINE`).
  * Recibir ofertas de entregas cercanas en un radio de acción autorizado.
  * Aceptar o rechazar ofertas dentro del temporizador atómico (15 segundos).
  * Actualizar hitos operativos (*Llegué a sucursal*, *Pedido recogido*, *Llegué a cliente*, *Confirmar entrega con PIN*).
  * Transmitir coordenadas GPS periódicas durante el servicio activo.
  * Consultar su billetera virtual, historial de ganancias y solicitar retiros (`payouts`).
* **Restricciones:** Solo puede ver datos del negocio y del cliente estrictamente vinculados a la entrega que tiene asignada activamente. No puede ver documentos privados de otros drivers.

### 2.9 Rol: `customer` (Cliente Final / Destinatario)
* **Responsabilidad:** Receptáculo del paquete enviado por el negocio.
* **Permisos Clave:**
  * Acceder al portal de tracking público vía URL firmada tokenizada (ej: `https://gueguense.app/t/UUID-TOKEN`).
  * Visualizar la ubicación GPS en tiempo real del motorizado asignado únicamente mientras la entrega está en curso (`TO_DROPOFF`).
  * Consultar ETA estimado de llegada, nombre y foto de perfil del motorizado.
  * Visualizar su PIN de 4 dígitos de confirmación de entrega.
* **Restricciones:** Sin cuenta obligatoria ni autenticación JWT. El acceso está tokenizado y expira automáticamente al pasar la entrega a estado `DELIVERED` o `CANCELED`.

---

## 3. Matriz de Permisos por Recurso (RBAC Matrix)

| Recurso / Operación | super_admin | admin | operator | verification_agent | business_owner | driver | customer (Token) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Gestionar Roles Admin** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Aprobar Documentos Driver** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Configurar Tarifas/Zonas** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Crear Solicitud Delivery** | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **Aceptar Oferta Delivery** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| **Ver Tracking GPS en Vivo** | ✅ | ✅ | ✅ | ❌ | ✅ (Propiado) | ✅ (Asignado) | ✅ (Con Token) |
| **Reasignar Conductor** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Ver Documentos Privados** | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ (Solo propios) | ❌ |
| **Aprobar Retiros (Payouts)**| ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Ingresar PIN de Entrega** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
