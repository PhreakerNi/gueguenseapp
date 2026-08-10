# 18 — OBSERVABILIDAD, LOGS Y PRIVACIDAD (OBSERVABILITY)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Telemetría, Logs Estructurados, Correlation IDs y Redacción de PII  

---

## 1. Política Estricta de Redacción de PII y Secretos

Queda **ESTRICTAMENTE PROHIBIDO** registrar en consolas o servicios de telemetría los siguientes datos:

* `DELIVERY_OTP` (Plano o Hash).
* Tokens JWT o Tokens de Tracking Web.
* Números de Cédula de Identidad y Licencias de Conducir.
* Fotografías de documentos o rostros.
* Número telefónico completo (Mascarar siempre: `+505 88****77`).
* Texto completo de direcciones de domicilio.

---

## 2. Sanitizador Recursivo de Logs

Los serializadores aplican sanitización recursiva profunda en headers, query params y bodies:

```typescript
function sanitizeRecursive(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const SENSITIVE_KEYS = ['otp', 'token', 'national_id', 'license_number', 'phone', 'password', 'jwt', 'authorization'];
  
  if (Array.isArray(data)) {
    return data.map(sanitizeRecursive);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeRecursive(value);
    }
  }
  return sanitized;
}
```

### IDs Permitidos para Correlación Tracing:
`request_id`, `correlation_id`, `delivery_id`, `offer_id`, `business_id`, `driver_id`, `incident_id`, `transaction_id`.
