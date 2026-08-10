# 14 — OPERACIONES ADMINISTRATIVAS (ADMIN OPERATIONS)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Panel de Control Administrativo, Gestión de Incidentes, Devoluciones y Auditoría  

---

## 1. Misión del Panel Güegüense Admin

El panel **Güegüense Admin** (`/apps/admin-web`) es el centro de control web para la gestión operativa, verificación de documentos cifrados, intervención de incidentes desacoplados, control de devoluciones y supervisión financiera.

---

## 2. Descripción Completa de Módulos Operativos

1. **Dashboard en Vivo (`/admin/dashboard`):** Mapa interactivo global de la flota con marcadores por estado operativo (`AVAILABLE`, `BUSY`, `PAUSED`).
2. **Cola de Verificación (`/admin/verifications`):** Auditoría de expedientes de conductores en `UNDER_REVIEW` con visor seguro de URLs firmadas temporales (15 min).
3. **Gestión de Incidentes (`/admin/incidents`):** Mesa de control para resolver incidentes desacoplados (`incidents`). Permite autorizar retornos (`RETURN_REQUIRED`) o traspasos físicos de custodia supervisados (`RESOLVED_HANDOFF`).
4. **Control de Devoluciones (`/admin/returns`):** Monitoreo de paquetes en retorno a sucursales de origen (`RETURNING`) y cierre de custodia (`RETURNED`).
5. **Configuración de Tarifas y Zonas (`/admin/pricing`):** Editor de polígonos geoespaciales PostGIS y reglas de recargo por zona/horario.
6. **Finanzas y Payouts (`/admin/finance`):** Aprobación de solicitudes de retiro de conductores, conciliación de efectivo cobrado en mano (`cash_settlements`) y consulta del Ledger de partida doble.
7. **Logs de Auditoría (`/admin/audit`):** Historial inmutable de acciones administrativas registradas en `audit_logs`.
