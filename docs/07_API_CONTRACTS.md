# 07 — CONTRATOS DE API Y ENDPOINTS (API CONTRACTS)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Especificación de Interfaces REST, Endpoints por Dominio, DTOs e Idempotencia  

---

## 1. Estándares Globales de la API

* **Autenticación:** `Authorization: Bearer <SUPABASE_JWT_TOKEN>`.
* **Idempotencia Obligatoria:** Encabezado `Idempotency-Key: <UUID-V4>` en todas las mutaciones críticas. La reutilización de una llave con payload distinto produce `422 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD`.
* **Regla Canónica de OTP:** El `DELIVERY_OTP` **NUNCA se retorna a Driver, Negocio ni Admin.** Solamente se expone al destinatario en `GET /api/v1/tracking/{token}/otp` descifrando `otp_ciphertext` durante estados de entrega autorizados (`PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`).

---

## 2. Matriz Completa de Endpoints por Dominio

### 2.1 Dominio: Conductor (`apps/driver-mobile`)
* `POST /api/v1/driver/onboarding`: Registro de expediente del conductor.
* `POST /api/v1/driver/documents/upload-authorization`: Solicitud de URL firmada para subida de cédula/licencia.
* `POST /api/v1/driver/documents`: Registro de metadata de documento subido.
* `POST /api/v1/driver/vehicles`: Registro de motocicleta.
* `POST /api/v1/driver/availability`: Alternar disponibilidad (`AVAILABLE` / `OFFLINE`).
* `GET  /api/v1/driver/state`: Consulta de presencia y estado operativo.
* `GET  /api/v1/driver/offers/active`: Sincronización de ofertas activas en re-conexión.
* `POST /api/v1/driver/offers/{id}/accept`: Aceptación atómica de oferta (Idempotente, Stored Procedure).
* `POST /api/v1/driver/offers/{id}/reject`: Rechazo de oferta de viaje.
* `GET  /api/v1/driver/deliveries/active`: Consulta de entrega comprometida en curso.
* `POST /api/v1/driver/deliveries/{id}/arrived-pickup`: Notificación de llegada a sucursal origen.
* `POST /api/v1/driver/deliveries/{id}/arrived-dropoff`: Notificación de llegada a domicilio destinatario.
* `POST /api/v1/driver/deliveries/{id}/verify-otp`: Validación de OTP (Idempotente, 3 intentos max).
* `POST /api/v1/driver/deliveries/{id}/incidents`: Reporte de incidencia en ruta.
* `POST /api/v1/driver/deliveries/{id}/return/start`: Iniciar ruta de retorno a sucursal.
* `POST /api/v1/driver/location`: Ingesta de coordenadas GPS autenticadas.
* `GET  /api/v1/driver/earnings`: Consulta de acumulado de ganancias.
* `POST /api/v1/driver/payouts`: Solicitud de retiro de fondos (Idempotente).

### 2.2 Dominio: Negocio (`apps/business-mobile`)
* `POST /api/v1/businesses`: Creación de registro comercial.
* `PATCH /api/v1/businesses/{id}`: Actualización de datos de empresa.
* `POST /api/v1/businesses/{id}/locations`: Alta de sucursales de recolección.
* `POST /api/v1/businesses/{id}/members`: Invitación de miembros con asignación N:M de sucursales.
* `POST /api/v1/quotes`: Solicitud de cálculo de cotización (`QUOTED`).
* `POST /api/v1/deliveries`: Consumir quote e iniciar entrega (`SEARCHING_DRIVER`, Idempotente).
* `GET  /api/v1/deliveries/{id}`: Detalle y estado en vivo de la entrega.
* `POST /api/v1/business/deliveries/{id}/confirm-pickup-custody`: Validar `PICKUP_CODE` y pasar a `PICKED_UP`.
* `POST /api/v1/deliveries/{id}/cancel`: Cancelación autorizada pre-pickup (Idempotente).
* `GET  /api/v1/businesses/{id}/deliveries`: Historial de entregas del negocio.
* `POST /api/v1/support/tickets`: Apertura de ticket de soporte.

### 2.3 Dominio: Tracking Web Destinatario (`apps/tracking-web`)
* `GET /api/v1/tracking/{token}`: Obtener snapshot de la entrega vía Bearer Tracking Token.
* `GET /api/v1/tracking/{token}/otp`: Endpoint customer-scoped para descifrar y visualizar el `DELIVERY_OTP` (6 dígitos).

### 2.4 Dominio: Administración y Finanzas (`apps/admin-web`)
* `GET  /api/v1/admin/verifications`: Cola de auditoría de documentos de conductores.
* `POST /api/v1/admin/drivers/{id}/approve`: Aprobar verificación de conductor.
* `POST /api/v1/admin/drivers/{id}/suspend`: Suspender conductor con justificación `reason`.
* `POST /api/v1/admin/businesses/{id}/suspend`: Suspender comercio con justificación `reason`.
* `GET  /api/v1/admin/deliveries/live`: Mapa y lista de entregas activas.
* `POST /api/v1/admin/incidents/{id}/resolve`: Resolución de incidente (`RESOLVED_CONTINUE`, `RESOLVED_RETURN`, `RESOLVED_HANDOFF`).
* `POST /api/v1/admin/returns/{id}/authorize`: Autorización administrativa de devolución.
* `POST /api/v1/admin/handoffs`: Autorización de traspaso presencial de custodia (`custody_handoffs`).
* `POST /api/v1/admin/pricing/zones`: Crear/modificar polígonos geoespaciales de tarifa.
* `POST /api/v1/admin/payouts/{id}/approve`: Aprobación de retiro (Cuatro Ojos para montos elevados).
* `POST /api/v1/admin/cash-settlements`: Registro de rendición de cuentas de efectivo cobrado en mano.
* `GET  /api/v1/admin/audit-logs`: Consulta de log inmutable de auditoría.
