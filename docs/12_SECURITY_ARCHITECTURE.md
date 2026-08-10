# 12 — ARQUITECTURA DE SEGURIDAD Y THREAT MODEL (SECURITY ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Hardened Security Definer, Resguardo de OTP, Revocación de Sesiones y Web Auth  

---

## 1. Guía de Endurecimiento de Funciones `SECURITY DEFINER`

Toda función almacenada en PostgreSQL que utilice `SECURITY DEFINER` debe cumplir obligatoriamente los siguientes 5 requisitos de seguridad:

1. **Ruta de Búsqueda Fija (`search_path`):** Declarar explícitamente `SET search_path = public, pg_temp;` para evitar ataques de hijacking de esquema.
2. **Referencias Calificadas por Esquema:** Todas las tablas se invocan calificadas (ej: `public.deliveries`).
3. **Revocación de Permisos por Defecto:** Se ejecuta `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC;` inmediatamente después de la creación.
4. **Concesión Granular de Permisos:** Se otorga permiso únicamente a los roles necesarios (ej: `GRANT EXECUTE ... TO authenticated;`).
5. **Validación de Identidad por Sesión:** La función verifica la identidad real mediante `auth.uid()` y nunca confía en IDs de usuario o conductor enviados en los argumentos por el cliente.

---

## 2. Protección y Resguardo del `DELIVERY_OTP`

El `DELIVERY_OTP` (Código de Entrega al Cliente) se protege bajo estándares criptográficos equivalentes a una contraseña de usuario:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        REGLAS DE SEGURIDAD DEL OTP                     │
├─────────────────┬──────────────────────────────────────────────────────┤
│ Almacenamiento  │ NUNCA en texto plano. Se guarda como `otp_hash`      │
│                 │ utilizando algoritmos Bcrypt / Argon2.               │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Transmisión     │ Exclusiva al cliente final vía SMS / Web Tracking.   │
│                 │ NUNCA se retorna en endpoints de API para el driver. │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Intentos        │ Límite estricto de 3 intentos (`otp_attempt_count`). │
│                 │ Al tercer fallo se activa `otp_locked_until` (2 min).│
├─────────────────┼──────────────────────────────────────────────────────┤
│ Expiración      │ Campo `otp_expires_at` (12 horas máximo).            │
└─────────────────┴──────────────────────────────────────────────────────┘
```

---

## 3. Validación de Estado de Cuenta y Revocación de Sesiones

Para mitigar el riesgo de tokens JWT que permanecen válidos hasta su hora de expiración (1 hora), **todas las peticiones mutativas críticas evalúan en base de datos el estado actual de la cuenta**:

```sql
-- Validación de seguridad en Edge Function / Stored Procedure
IF (SELECT account_status FROM public.drivers WHERE id = auth.uid()) != 'ACTIVE' THEN
    RAISE EXCEPTION 'FORBIDDEN: La cuenta del conductor se encuentra suspendida o bloqueada.' USING ERRCODE = '42501';
END IF;
```

---

## 4. Estrategia de Autenticación Web (Supabase SSR)

Para el portal Web (`admin-web` y `tracking-web`), se implementa la arquitectura oficial **Supabase SSR** para Next.js App Router, gestionando la creación y refresco de tokens mediante cookies de servidor seguras (`@supabase/ssr`).
