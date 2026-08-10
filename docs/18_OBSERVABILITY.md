# 18 — OBSERVABILIDAD, LOGS Y PRIVACIDAD (OBSERVABILITY)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Telemetría, Logs Estructurados y Política Estricta de Redacción de PII  

---

## 1. Política Estricta de Redacción de PII (Log Privacy Policy)

Queda **ESTRICTAMENTE PROHIBIDO** registrar en archivos de logs, consolas o servicios de telemetría de terceros (Sentry, PostHog, Logtail) la siguiente información confidencial o de identificación personal (PII):

```text
┌────────────────────────────────────────────────────────────────────────┐
│                    CAMPOS DE REDACCIÓN OBLIGATORIA (PII)               │
├─────────────────┬──────────────────────────────────────────────────────┤
│ `DELIVERY_OTP`  │ Jamás registrar el OTP plano ni el hash Bcrypt.      │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Tokens          │ Jamás registrar tokens JWT ni tokens de tracking web.│
├─────────────────┼──────────────────────────────────────────────────────┤
│ Documentos      │ Cédula de identidad y número de licencia de conducir.│
├─────────────────┼──────────────────────────────────────────────────────┤
│ Teléfonos       │ Mascarar siempre: `+505 88****77`.                   │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Direcciones     │ Nombres de clientes y texto de dirección de casa.    │
└─────────────────┴──────────────────────────────────────────────────────┘
```

---

## 2. Esquema de Redacción Automática en Logger

Todos los serializadores de logs utilizan un middleware de sanitización:

```typescript
function sanitizeLogPayload(data: Record<string, any>): Record<string, any> {
  const SENSITIVE_KEYS = ['otp', 'token', 'national_id', 'license_number', 'phone', 'password'];
  const sanitized = { ...data };
  for (const key of Object.keys(sanitized)) {
    if (SENSITIVE_KEYS.some(k => key.toLowerCase().includes(k))) {
      sanitized[key] = '[REDACTED]';
    }
  }
  return sanitized;
}
```
