# 12 — ARQUITECTURA DE SEGURIDAD Y THREAT MODEL (SECURITY ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.8.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Hardened Security Definer (`SET search_path = ''`), Threat Model Evaluado (20 Amenazas) y Ciclo de Vida de Secretos  

---

## 1. Guía de Endurecimiento y Verificación de Estado de Cuenta en Vivo

1. **Ruta de Búsqueda Vacía (`SET search_path = ''`):** Previene hijacking de esquemas en Stored Procedures.
2. **Referencias Calificadas por Esquema:** Invocaciones explícitas (`public.deliveries`, `private.delivery_secrets`).
3. **Verificación de Estado de Cuenta y Custodia:**
   * Las funciones almacenadas verifican en vivo `drivers.account_status = 'ACTIVE'` y `businesses.account_status = 'ACTIVE'`.
   * Si la cuenta está suspendida, se bloquea la creación de nuevas entregas o la aceptación de nuevas ofertas (`42501 FORBIDDEN`).
   * **Excepción de Custodia Activa:** Si el motorizado ya posee un paquete en custodia física (`PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`), se permiten **exclusivamente las acciones de resolución de custodia** (`RETURN_REQUIRED` $\rightarrow$ `RETURNING` $\rightarrow$ `RETURNED` o `CONTROLLED_HANDOFF`) autorizadas por el operador.

---

## 2. Ciclo de Vida Completo de Secretos (`private.delivery_secrets`)

```text
 ┌────────────────┐
 │ ARRIVED_PICKUP │ `pickup_code_digest` activo en private.delivery_secrets.
 └───────┬────────┘ Campos de OTP (digest, ciphertext, expires_at) permanecen NULL.
         │
         ▼
 ┌────────────────┐
 │   PICKED_UP    │ `pickup_code_digest` se marca inactivo/usado.
 └───────┬────────┘ `otp_digest`, `otp_ciphertext` y `otp_expires_at` se generan.
         │
         ▼
 ┌────────────────┐
 │   DELIVERED    │ `otp_verified_at` registrado en private.delivery_secrets.
 └────────────────┘ OTP deja de ser retornable.

 ┌────────────────┐
 │RETURN_REQUIRED │ OTP invalidada/inaccesible.
 └────────────────┘
```

---

## 3. Threat Model Canónico Evaluado (20 Amenazas)

| Activo (Asset) | Amenaza (Threat) | Vector de Ataque | Control Preventivo | Control Detectivo | Respuesta | Riesgo Residual |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Cuenta User** | `ACCOUNT_TAKEOVER` | Credenciales robadas | MFA en Admins + Rate limit login. | Alerta por IP / dispositivo inusual. | Revocación de refresh tokens. | Medio |
| **Flota Driver** | `FAKE_DRIVER` | Identidad falsa de motorizado | Verificación documental sujeto a política legal. | Auditoría humana en Verification Queue. | Bloqueo `account_status = 'BLOCKED'`. | Bajo |
| **Ubicación GPS**| `FORGED_GPS` | App de GPS Falso | Validación de velocidad y `anomaly_flag`. | Monitoreo en `delivery_tracking_points`. | Inactivación de asignación automática. | Medio |
| **Recursos API** | `IDOR` | Modificar `delivery_id` ajeno | Políticas RLS por `auth.uid()` y membresía. | Logs 403 Forbidden. | Auditoría y deshabilitación de cuenta. | Bajo |
| **Tracking Web** | `TRACKING_TOKEN_LEAK` | URL compartida públicamente | Token hash SHA-256 + Expiración terminal. | Logs de acceso por User-Agent. | Revocación manual/automática del token. | Bajo |
| **Entrega** | `OTP_BRUTE_FORCE` | Fuerza bruta a 6 dígitos | OTP lock: 3 intentos / 2 min = initial default / configurable security policy. | Alerta por `otp_attempt_count >= 3`. | Bloqueo temporal de la entrega. | Bajo |
| **Custodia** | `PICKUP_CODE_ABUSE` | Conductor auto-confirma pickup | `pickup_code_digest` validado por Negocio. | Auditoría de tiempo `ARRIVED` a `PICKED`. | Inhabilitación del motorizado. | Bajo |
| **Documentos** | `DOCUMENT_EXPOSURE` | Lectura de cédula/licencia | Bucket 100% privado + Signed URL lifetime: 15 min = initial default / configurable security policy. | Audit log de URLs firmadas. | Revocación de clave de firma. | Bajo |
| **Cotización** | `PRICE_MANIPULATION` | Modificar precio en frontend | Cotización calculada 100% en backend (`QUOTED`). | Invariante `quoted_total` vs Quote. | Rechazo de consumo de la cotización. | Bajo |
| **Custodia** | `FAKE_PICKUP` | Marcar entrega sin paquete | Exigencia de validación por empleado negocio. | Reclamos del negocio en incidentes. | Retención de ganancias y suspensión. | Medio |
| **Custodia** | `FAKE_DELIVERY_COMPLETION`| Confirmar sin entregar | Exigencia estricta de `DELIVERY_OTP`. | Impugnación por cliente en tracking. | Devolución obligatoria o arbitraje. | Bajo |
| **Despacho** | `DISPATCH_RACE` | Dos conductores aceptan viaje | Stored procedure `FOR UPDATE` + Partial Index. | Logs de conflicto `409`. | Rechazo instantáneo de oferta perdedora. | Bajo |
| **Finanzas** | `PAYOUT_FRAUD` | Solicitud duplicada de retiro | Idempotencia obligatoria + Partida doble. | Auditoría de `cached_balance` vs postings. | Suspensión de transferencia. | Bajo |
| **Finanzas** | `CASH_FRAUD` | No entregar efectivo recaudado | Control en `ASSET_DRIVER_CASH_RECEIVABLE`. | Monitoreo en `cash_settlements`. | Suspensión de asignación de ofertas. | Medio |
| **Membresías** | `MALICIOUS_BUSINESS_MEMBER`| Empleado despedido crea envíos | Control de roles N:M y revocación `status`. | Auditoría de `business_members`. | Desactivación inmediata del miembro. | Bajo |
| **Plataforma** | `ADMIN_COMPROMISE` | Compromiso de cuenta operador | Step-up MFA + `audit_logs` inmutables. | Alerta por acción administrativa masiva. | Congelamiento de permisos globales. | Alto (TBD Audit) |
| **API REST** | `REPLAY_ATTACK` | Re-envío de peticiones POST | `Idempotency-Key` obligatoria. | Verificación de idempotencia en DB. | Respuesta en cache o `422 IDEMPOTENCY`. | Bajo |
| **Credenciales**| `LEAKED_API_KEY` | Fuga de Server Routes Key | Restricción de API Key a Google Routes API. | Alerta de consumo anormal de Google API. | Rotación inmediata de API Key. | Medio |
| **Enumeración** | `ABUSIVE_ENUMERATION` | Enumerar UUIDs de entregas | UUIDs v4 aleatorios + Rate limiting API. | WAF / Rate limiter por IP. | Bloqueo por WAF. | Bajo |
| **Integración** | `WEBHOOK_REPLAY` | Re-emisión de webhooks | Firma criptográfica HMAC + Timestamp. | Registro de `idempotency_keys`. | Descarte de webhook duplicado. | Bajo |
