# 14 — OPERACIONES ADMINISTRATIVAS (ADMIN OPERATIONS)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Panel de Control Administrativo, Gestión de Incidentes y Devoluciones  

---

## 1. Misión del Panel Güegüense Admin

El panel **Güegüense Admin** (`/apps/admin-web`) es el centro de control web para la gestión operativa, verificación de documentos cifrados, intervención de incidentes desacoplados y supervisión financiera.

---

## 2. Gestión de Incidentes Operativos y Devoluciones

### 2.1 Monitor de Incidentes (`/admin/incidents`)
El operador supervisa los incidentes reportados en la tabla `incidents` sin alterar arbitrariamente la máquina de estados principal:
* **Incidentes de Tipo `VEHICLE_BREAKDOWN` / `ACCIDENT`:** Permite autorizar la desasignación con protocolo de custodia o la transferencia física del paquete a otro conductor mediante firma digital.
* **Incidentes de Tipo `RECIPIENT_REFUSED` / `ADDRESS_UNREACHABLE`:** Permite autorizar el paso del viaje al sub-ciclo de devolución (`RETURN_REQUIRED`), notificando a la sucursal del comercio.

### 2.2 Auditoría de Códigos y Seguridad
* El panel permite a un `super_admin` auditar el estado del `otp_hash` (sin revelar el código plano) y verificar el historial de intentos fallidos (`otp_attempt_count`).
