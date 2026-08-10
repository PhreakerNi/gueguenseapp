# 18 — OBSERVABILIDAD, LOGS Y PRIVACIDAD (OBSERVABILITY)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Telemetría, Logs Estructurados, Redacción Recursiva de PII y Tracing  

---

## 1. Política Estricta de Redacción Recursiva de PII

Queda **ESTRICTAMENTE PROHIBIDO** registrar en consolas o servicios de telemetría:
* `DELIVERY_OTP` (Plano, Digest o Ciphertext).
* Tokens JWT, API Secrets o Tokens de Tracking Web.
* Coordenadas GPS exactas en logs generales (se aplica reducción de precisión a 2 decimales en logs de telemetría).
* Cédulas de Identidad, Licencias o Fotografías.
* Números telefónicos completos y direcciones de casa.

---

## 2. Middleware de Sanitización Recursiva y Allowlist

```typescript
function sanitizeLogPayload(data: any): any {
  if (!data || typeof data !== 'object') return data;
  const SENSITIVE_KEYS = ['otp', 'token', 'national_id', 'license_number', 'phone', 'password', 'jwt', 'authorization', 'secret', 'pickup_code'];
  
  if (Array.isArray(data)) {
    return data.map(sanitizeLogPayload);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeLogPayload(value);
    }
  }
  return sanitized;
}
```

### Correlation IDs Permitidos para Tracing:
`request_id`, `correlation_id`, `delivery_id`, `offer_id`, `business_id`, `driver_id`, `incident_id`, `transaction_id`.
