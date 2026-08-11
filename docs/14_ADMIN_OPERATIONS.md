# 14 — OPERACIONES ADMINISTRATIVAS (ADMIN OPERATIONS)

**Proyecto:** Güegüense  
**Versión:** 1.6.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Panel de Control Administrativo (17 Módulos Especificados), Permisos e Intervención Extraordinaria

---

## 1. Misión del Panel Güegüense Admin

El panel **Güegüense Admin** (`apps/admin-web`) es la consola operativa para la supervisión global, resolución de incidencias, control de devoluciones, traspasos de custodia y auditoría financiera.

---

## 2. Especificación Completa por Módulo Operativo (17 Módulos)

1. **Dashboard KPIs (`/admin/dashboard`):** Rol Mínimo: `operator`. Acciones: Lectura de métricas. Audit: N/A.
2. **Live Operations Map (`/admin/map`):** Rol Mínimo: `operator`. Acciones: Monitoreo de presencia (`AVAILABLE`, `BUSY`, `PAUSED`). Audit: N/A.
3. **Gestión de Entregas (`/admin/deliveries`):** Rol Mínimo: `operator`. Acciones: Ver detalle y eventos. Destructiva: Cancelación forzada pre-custodia (`reason` obligatorio, Audit log).
4. **Gestión de Conductores (`/admin/drivers`):** Rol Mínimo: `operator`. Acciones: Ver perfil. Destructiva: Suspensión (`reason` obligatorio, Audit log; custodia activa preserva flujo de devolución/handoff).
5. **Gestión de Comercios (`/admin/businesses`):** Rol Mínimo: `admin`. Acciones: Ver empresas/sucursales. Destructiva: Suspensión comercial (`reason` obligatorio, MFA).
6. **Verification Queue (`/admin/verifications`):** Rol Mínimo: `verification_agent`. Acciones: Aprobar/Rechazar expedientes con URLs firmadas (15 min initial default / configurable policy). Audit log.
7. **Incident Queue (`/admin/incidents`):** Rol Mínimo: `operator`. Acciones: Resolver incidentes (`RESOLVED_CONTINUE`, `RESOLVED_RETURN`, `RESOLVED_HANDOFF`). Audit log.
8. **Control de Devoluciones (`/admin/returns`):** Rol Mínimo: `operator`. Acciones: Autorizar y supervisar devoluciones (`RETURN_REQUIRED`). Audit log.
9. **Controlled Handoffs (`/admin/handoffs`):** Rol Mínimo: `operator`. Acciones: Autorizar traspasos presenciales (`custody_handoffs`). Audit log.
10. **Centro de Soporte (`/admin/support`):** Rol Mínimo: `operator`. Acciones: Responder tickets de soporte. Audit log.
11. **Pricing & Zonas (`/admin/pricing`):** Rol Mínimo: `admin`. Acciones: Configurar matrices y polígonos PostGIS. MFA requerido. Audit log.
12. **Gestión de Pagos (`/admin/payments`):** Rol Mínimo: `admin`. Acciones: Aprobar saldo prepagado. Audit log.
13. **Vistas de Ledger (`/admin/ledger`):** Rol Mínimo: `admin`. Acciones: Consulta de partida doble. Audit log.
14. **Aprobación de Payouts (`/admin/payouts`):** Rol Mínimo: `admin`. Acciones: Aprobar retiros (`REQUESTED` $\rightarrow$ `APPROVED`). Requisito de **Cuatro Ojos Configurable** para montos elevados (`initial default / configurable policy`, ej: > C$ 5,000.00 NIO). Audit log.
15. **Cash Settlements (`/admin/cash`):** Rol Mínimo: `admin`. Acciones: Rendición de cuentas de efectivo cobrado en mano. Audit log.
16. **Módulo de Suspensiones (`/admin/suspensions`):** Rol Mínimo: `admin`. Acciones: Bloqueo/desbloqueo de cuentas. Requisito estricto de `reason` y MFA. Audit log.
17. **Logs de Auditoría (`/admin/audit`):** Rol Mínimo: `super_admin`. Acciones: Lectura inmutable de `audit_logs`.
