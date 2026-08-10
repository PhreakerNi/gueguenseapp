# 14 — OPERACIONES ADMINISTRATIVAS (ADMIN OPERATIONS)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Panel de Control Administrativo (17 Módulos), Auditoría y Cuatro Ojos  

---

## 1. Misión del Panel Güegüense Admin

El panel **Güegüense Admin** (`/apps/admin-web`) es la consola operativa para la supervisión global, resolución de incidencias, control de devoluciones, traspasos de custodia y auditoría financiera.

---

## 2. Catálogo Canónico de Módulos Operativos (17 Módulos)

1. **Dashboard KPIs (`/admin/dashboard`):** Métricas en tiempo real de asignación, tasa de éxito y volumen.
2. **Live Operations Map (`/admin/map`):** Mapa interactivo de presencia de conductores (`AVAILABLE`, `BUSY`, `PAUSED`).
3. **Gestión de Entregas (`/admin/deliveries`):** Vista en detalle de entregas activas, filtros y trazabilidad de eventos.
4. **Gestión de Conductores (`/admin/drivers`):** Control de expediente, estado de verificación y estado de cuenta.
5. **Gestión de Comercios (`/admin/businesses`):** Administración de empresas, sucursales y miembros.
6. **Verification Queue (`/admin/verifications`):** Auditoría de documentos presentados con URLs firmadas temporales (15 min).
7. **Incident Queue (`/admin/incidents`):** Mesa de control para atender e investigar registros en `incidents`.
8. **Control de Devoluciones (`/admin/returns`):** Supervisión de paquetes en ruta de retorno (`RETURNING`) a la sucursal.
9. **Controlled Handoffs (`/admin/handoffs`):** Autorización de traspasos presenciales de custodia entre motorizados (`custody_handoffs`).
10. **Centro de Soporte (`/admin/support`):** Atención de tickets operativos de comercios y motorizados (`support_tickets`).
11. **Pricing & Zonas (`/admin/pricing`):** Configuración de tarifas base, recargos y polígonos geoespaciales PostGIS.
12. **Gestión de Pagos (`/admin/payments`):** Control de recargas de saldo prepagado de negocios.
13. **Vistas de Ledger (`/admin/ledger`):** Inspección de partida doble (`ledger_transactions` y `ledger_postings`).
14. **Aprobación de Payouts (`/admin/payouts`):** Autorización de retiros de ganancias de conductores con regla de **Cuatro Ojos** para montos elevados.
15. **Cash Settlements (`/admin/cash`):** Rendición de cuentas de efectivo recaudado en mano (`cash_settlements`).
16. **Módulo de Suspensiones (`/admin/suspensions`):** Bloqueo/desbloqueo justificado de cuentas con requisito de motivo (`reason`).
17. **Logs de Auditoría (`/admin/audit`):** Log inmutable de acciones administrativas registradas en `audit_logs`.

---

## 3. Protocolo de Seguridad para Acciones Sensibles

* **Justificación Obligatoria (`reason`):** Toda acción destructiva o de modificación de estado requiere ingresar una justificación escrita guardada en `audit_logs`.
* **Aprobación de Cuatro Ojos (Four-Eyes Approval):** Ajustes financieros manuales (`MANUAL_ADJUSTMENT`) o Payouts mayores a C$ 5,000.00 NIO requieren la aprobación de un segundo administrador.
* **Autenticación Step-Up (MFA):** Requerida para cambios de configuración de tarifas globales o suspensiones de comercios.
