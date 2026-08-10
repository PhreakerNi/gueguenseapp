# 12 — ARQUITECTURA DE SEGURIDAD Y THREAT MODEL (SECURITY ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Hardened Security Definer (`SET search_path = ''`), Threat Model Completo (20 Amenazas) y Secretos Cifrados  

---

## 1. Resguardo Criptográfico en `private.delivery_secrets`

1. **`DELIVERY_OTP` (6 dígitos):** Resguardado mediante dos representaciones:
   * **`otp_digest`:** Hash Bcrypt/Argon2 con pepper para comparar intentos del conductor.
   * **`otp_ciphertext`:** Cifrado a nivel de servidor con una clave server-only (KMS). **NUNCA se retorna a Driver, Business ni Admin.** Solamente se descifra para el cliente en `GET /api/v1/tracking/{token}/otp`.
2. **`PICKUP_CODE`:** Eliminado de `public.deliveries`. Almacenado exclusivamente en `private.delivery_secrets.pickup_code_digest`. El código se muestra al Driver y el despachador del negocio lo introduce para confirmar custodia.

---

## 2. Threat Model Canónico Completo (20 Amenazas)

| Activo (Asset) | Amenaza (Threat) | Vector de Ataque | Control Preventivo | Control Detectivo | Respuesta | Riesgo Residual |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Cuenta User** | `ACCOUNT_TAKEOVER` | Credenciales robadas | MFA en Admins + Rate limit login. | Alerta por IP / dispositivo inusual. | Revocación instantánea de sesión. | Bajo |
| **Flota Driver** | `FAKE_DRIVER` | Identidad falsa de motorizado | Verificación de antecedentes y fotos. | Auditoría humana en Verification Queue. | Bloqueo `account_status = 'BLOCKED'`. | Bajo |
| **Ubicación GPS**| `FORGED_GPS` | App de GPS Falso | Validación de velocidad y `anomaly_flag`. | Monitoreo en `delivery_tracking_points`. | Inactivación de asignación automática. | Bajo |
| **Recursos API** | `IDOR` | Modificar `delivery_id` ajeno | Políticas RLS por `auth.uid()` y membresía. | Logs 403 Forbidden. | Bloqueo automático de IP/JWT. | Bajo |
| **Tracking Web** | `TRACKING_TOKEN_LEAK` | URL compartida públicamente | Token hash SHA-256 + Expiración terminal. | Logs de acceso por User-Agent. | Revocación manual/automática del token. | Bajo |
| **Entrega** | `OTP_BRUTE_FORCE` | Fuerza bruta a 6 dígitos | Lockout de 2 min tras 3 fallos (`otp_digest`). | Alerta por `otp_attempt_count >= 3`. | Bloqueo temporal de la entrega. | Bajo |
| **Custodia** | `PICKUP_CODE_ABUSE` | Conductor auto-confirma pickup | `pickup_code_digest` validado por Negocio. | Auditoría de tiempo `ARRIVED` a `PICKED`. | Inhabilitación del motorizado. | Bajo |
| **Documentos** | `DOCUMENT_EXPOSURE` | Lectura de cédula/licencia | Bucket 100% privado + Signed URLs 15m. | Audit log de URLs firmadas. | Revocación de clave de firma. | Bajo |
| **Cotización** | `PRICE_MANIPULATION` | Modificar precio en frontend | Cotización calculada 100% en backend (`QUOTED`). | Invariante `quoted_total` vs Quote. | Rechazo de consumo de la cotización. | Bajo |
| **Custodia** | `FAKE_PICKUP` | Marcar entrega sin paquete | Exigencia de validación por empleado negocio. | Reclamos del negocio en incidentes. | Retención de ganancias y suspensión. | Bajo |
| **Custodia** | `FAKE_DELIVERY_COMP.` | Confirmar sin entregar | Exigencia estricta de `DELIVERY_OTP`. | Impugnación por cliente en tracking. | Devolución obligatoria o arbitraje. | Bajo |
| **Despacho** | `DISPATCH_RACE` | Dos conductores aceptan viaje | Stored procedure `FOR UPDATE` + Partial Index. | Logs de conflicto `409`. | Rechazo instantáneo de oferta perdedora. | Bajo |
| **Finanzas** | `PAYOUT_FRAUD` | Solicitud duplicada de retiro | Idempotencia obligatoria + Partida doble. | Auditoría de `cached_balance` vs postings. | Suspensión de transferencia. | Bajo |
| **Finanzas** | `CASH_FRAUD` | No entregar efectivo recaudado | Control en `ASSET_CASH_HELD` + Bloqueo. | Monitoreo en `cash_settlements`. | Suspensión de asignación de ofertas. | Bajo |
| **Membresías** | `MALICIOUS_BUSINESS_MEMBER`| Empleado despedido crea envíos | Control de roles y revocación `status`. | Auditoría de `business_members`. | Desactivación inmediata del miembro. | Bajo |
| **Plataforma** | `ADMIN_COMPROMISE` | Compromiso de cuenta operador | Step-up MFA + `audit_logs` inmutables. | Alerta por acción administrativa masiva. | Congelamiento de permisos globales. | Bajo |
| **API REST** | `REPLAY_ATTACK` | Re-envío de peticiones POST | `Idempotency-Key` obligatoria. | Verificación de idempotencia en DB. | Respuesta en cache o `422 IDEMPOTENCY`. | Bajo |
| **Credenciales**| `LEAKED_API_KEY` | Fuga de Server Routes Key | Restricción por IP fija de Edge Functions. | Alerta de consumo anormal de Google API. | Rotación inmediata de API Key. | Bajo |
| **Enumeración** | `ABUSIVE_ENUMERATION` | Enumerar UUIDs de entregas | UUIDs v4 aleatorios + Rate limiting API. | WAF / Rate limiter por IP. | Bloqueo por WAF. | Bajo |
| **Integración** | `WEBHOOK_REPLAY` | Re-emisión de webhooks | Firma criptográfica HMAC + Timestamp. | Registro de `idempotency_keys`. | Descarte de webhook duplicado. | Bajo |
