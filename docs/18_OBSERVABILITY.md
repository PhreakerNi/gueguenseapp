# 18 — OBSERVABILIDAD, LOGS Y PRIVACIDAD (OBSERVABILITY)

**Proyecto:** Güegüense  
**Versión:** 1.6.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Telemetría, Logs Estructurados, Redacción Recursiva de PII, Sanitización de URLs/Headers y Tracing

---

## 1. Política Estricta de Redacción y Sanitización de PII

Queda **ESTRICTAMENTE PROHIBIDO** registrar en consolas, servidores de logs o herramientas de analítica:

- `DELIVERY_OTP` (Plano, Digest o Ciphertext).
- Tokens JWT, API Secrets, Bearer Tokens de Tracking Web o Encabezados `Authorization` / `Cookie`.
- Tokens Bearer de Tracking Web en URLs/Query Strings (`tracking-web` omitirá el token de la URL en los logs de acceso web).
- Coordenadas GPS exactas en logs generales (se aplica reducción de precisión a 2 decimales en logs de telemetría).
- Cédulas de Identidad, Licencias o Fotografías.
- Cuerpos de respuestas sensibles en el registro de `idempotency_keys`.

---

## 2. Encabezados HTTP de Seguridad y Middleware de Sanitización

```text
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Referrer-Policy: no-referrer
```

```typescript
function sanitizeLogPayload(data: any): any {
  if (!data || typeof data !== "object") return data;
  const SENSITIVE_KEYS = [
    "otp",
    "token",
    "national_id",
    "license_number",
    "phone",
    "password",
    "jwt",
    "authorization",
    "secret",
    "pickup_code",
    "bearer",
  ];

  if (Array.isArray(data)) {
    return data.map(sanitizeLogPayload);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = sanitizeLogPayload(value);
    }
  }
  return sanitized;
}
```

### Correlation IDs Permitidos para Tracing:

`request_id`, `correlation_id`, `delivery_id`, `offer_id`, `business_id`, `driver_id`, `incident_id`, `transaction_id`.

---

## 3. Retención de Logs, Roles de Acceso y Routing de Alertas de Seguridad

- **Nivel de Log en Producción:** `INFO` (producción) / `WARN` / `ERROR`.
- **Retención de Telemetría:** 30 días para logs operativos generales; 365 días para `audit_logs` inmutables.
- **Acceso a Logs:** Restringido a roles `super_admin` e ingenieros de infraestructura autorizados.
- **Routing de Alertas de Seguridad:** Errores `42501 FORBIDDEN` masivos o fallas de integridad en `private.delivery_secrets` enrutan alertas de alta prioridad a canales de seguridad.
