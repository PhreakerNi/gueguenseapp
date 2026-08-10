# 12 — ARQUITECTURA DE SEGURIDAD Y THREAT MODEL (SECURITY ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Seguridad, Cifrado, Control de Acceso RLS, Protección de Archivos y Threat Modeling  

---

## 1. Principios de Seguridad del Sistema

1. **Zero-Trust Client:** Ninguna entrada enviada desde las aplicaciones móviles o web se considera válida sin sanitización y verificación estricta en el servidor.
2. **Defensa en Profundidad (Defense in Depth):** Seguridad a nivel de red (HTTPS/TLS), autenticación (JWT/MFA), autorización (RBAC), base de datos (RLS) y almacenamiento (Signed URLs).
3. **Privacidad de Documentos Sensibles:** Cero almacenamiento de cédulas o licencias en buckets públicos o accesibles vía URLs permanentes.

---

## 2. Estrategia de Autenticación y Sesiones

* **Tokens JWT:** Emitidos por Supabase Auth con expiración corta (1 hora) y tokens de refresco seguros (*Refresh Tokens*) almacenados en `SecureStore` (móvil) y `HttpOnly Cookies` (web).
* **Autenticación en Dos Pasos (MFA):** Obligatoria para roles administrativos (`super_admin`, `admin`, `operator`) utilizando aplicaciones TOTP (Google Authenticator / Authy).
* **Revocación Instantánea:** Posibilidad de invalidar todas las sesiones activas de un conductor o negocio inmediatamente al ser suspendido.

---

## 3. Seguridad de Documentos de Verificación

Los documentos personales de los motorizados (Cédula de Identidad, Licencia de Conducir, Matrícula) son datos de alto riesgo.

```text
┌────────────────────────┐
│  App Driver (Camara)   │ Subida cifrada multipart/form-data.
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Bucket Supabase Privado│ Access Control: NINGÚN ACCESO PÚBLICO (Public READ: FALSE).
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│ Admin API / Visor      │ Genera URL Firmada con expiración de 15 minutos (HMAC-SHA256).
└────────────────────────┘
```

1. **Bucket Privado:** `driver-documents-private`.
2. **Acceso Autorizado Exclusivo:** Solamente los roles `super_admin`, `admin` y `verification_agent` pueden solicitar la generación de una URL firmada de corta duración mediante la función:
```typescript
const { data, error } = await supabase
  .storage
  .from('driver-documents-private')
  .createSignedUrl('drivers/doc_123.jpg', 900); // Expiración en 15 minutos (900 segundos)
```

---

## 4. Threat Model Inicial (Modelo de Amenazas)

| Amenaza | Vector de Ataque | Gravedad | Mitigación Arquitectónica |
| :--- | :--- | :--- | :--- |
| **Asignación Doble de Delivery** | Dos clicks simultáneos en app driver. | **CRÍTICA** | Transacción pesimista atómica `FOR UPDATE` en PL/pgSQL (Ver `08_DISPATCH_ENGINE.md`). |
| **Ataque Man-in-the-Middle (MitM)** | Intercepción de tráfico GPS o PIN. | **ALTA** | SSL/TLS 1.3 obligatorio con Certificate Pinning en aplicaciones móviles. |
| **Inyección SQL / Bypassing UI** | Alteración de precios enviando payloads manipulados desde cliente. | **ALTA** | Backend como fuente de verdad. La API no acepta precios del cliente; los calcula internamente. |
| **Spoofing / Falsificación GPS** | App modificada reporta ubicación falsa para ganar ofertas. | **ALTA** | Validación de velocidad imposible entre pings consecutivos y verificación de timestamps del SO. |
| **Robo de Credenciales Admin** | Brute-force a login administrativo. | **ALTA** | MFA obligatorio + Rate Limiting en API (máximo 5 intentos por minuto por IP). |
| **Acceso Indebido a Documentos** | Extracción de URLs directas de licencias. | **ALTA** | Bucket 100% privado + Auditoría de creación de Signed URLs. |
