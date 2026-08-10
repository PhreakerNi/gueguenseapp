# 12 — ARQUITECTURA DE SEGURIDAD Y THREAT MODEL (SECURITY ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Hardened Security Definer (`SET search_path = ''`), Threat Model, OTP Secrets y RLS  

---

## 1. Guía de Endurecimiento de Funciones `SECURITY DEFINER`

Toda función almacenada en PostgreSQL que utilice `SECURITY DEFINER` debe cumplir obligatoriamente los siguientes 5 requisitos de seguridad:

1. **Ruta de Búsqueda Vacía (`SET search_path = ''`):** Previene ataques de hijacking de esquemas.
2. **Referencias Calificadas por Esquema:** Todas las tablas se invocan calificadas (ej: `public.deliveries`, `private.delivery_secrets`).
3. **Revocación de Permisos por Defecto:** Se ejecuta `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;` inmediatamente.
4. **Concesión Granular:** Se otorga permiso únicamente al rol autenticado (`GRANT EXECUTE ON FUNCTION ... TO authenticated;`).
5. **Validación de Identidad por Sesión:** La función verifica la identidad real mediante `auth.uid()` y **NUNCA** confía en IDs de usuario/conductor pasados como argumentos por el cliente.

---

## 2. Resguardo de OTP de Entrega (`private.delivery_secrets`)

El `DELIVERY_OTP` (6 dígitos) se resguarda bajo estándares criptográficos estrictos:

* **Hash Criptográfico (`otp_digest`):** Almacenado exclusivamente en `private.delivery_secrets` mediante Bcrypt/Argon2 con pepper de servidor.
* **Prohibición de Exposición por API:** El backend NUNCA retorna el OTP plano ni su hash a la app del conductor, negocio u operadores.
* **Bloqueo por Intentos Fallidos:** Límite estricto de 3 intentos (`otp_attempt_count`). Al tercer fallo se activa `otp_locked_until` por 2 minutos.

---

## 3. Threat Model Canónico de Güegüense

| Activo (Asset) | Amenaza (Threat) | Vector de Ataque (Attack Path) | Control Preventivo | Control Detectivo | Respuesta | Riesgo Residual |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Despacho** | Asignación Doble | Dos clicks simultáneos en app driver. | Función PL/pgSQL atómica `FOR UPDATE` + Partial Unique Index. | Monitoreo de logs de conflicto `409`. | Rechazo instantáneo de la segunda solicitud. | Bajo |
| **Entrega** | Fuerza Bruta a `DELIVERY_OTP` | Script automatizado probando dígitos de OTP. | `otp_digest` + Rate Limit + Lockout tras 3 fallos. | Alerta por `otp_attempt_count >= 3`. | Bloqueo temporal de la entrega por 2 min. | Bajo |
| **Tracking** | Fuga de Ubicación GPS | Scrapeo de URLs de tracking web. | Token bearer de alta entropía (`token_hash`) + Revocación post-DELIVERED. | Logs de acceso a `/api/v1/tracking/`. | Invalidación inmediata del token al concluir el servicio. | Bajo |
| **Auth** | Bypass por Token JWT Suspendido | Conductor suspendido utiliza token JWT antes de expirar. | Verificación en vivo de `drivers.account_status = 'ACTIVE'` en Stored Procedures. | Auditoría de llamadas rechazadas por estado. | Excepción `42501 FORBIDDEN` instantánea. | Bajo |
| **Documentos**| Exposición de Cédula/Licencia | Acceso a imágenes privadas de conductores. | Bucket 100% privado + URLs firmadas temporales (15 min). | Audit log de generación de Signed URLs. | Revocación de clave de firmador si hay brecha. | Bajo |
