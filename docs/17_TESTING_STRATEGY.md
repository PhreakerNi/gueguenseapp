# 17 — ESTRATEGIA DE PRUEBAS Y CALIDAD (TESTING STRATEGY)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Estrategia de Pruebas Ampliada, Concurrencia Dual, RLS, Custodia, Ledger y Resiliencia  

---

## 1. Cobertura Mínima Exigida

| Capa | Herramienta | Cobertura | Foco Principal |
| :--- | :--- | :--- | :--- |
| **Lógica de Dominio** | **Jest / Vitest** | **95%** | Máquina de estados, scoring, precios y ledger. |
| **Base de Datos & RLS** | **pgTAP (Supabase CLI)**| **90%** | Políticas RLS, aislamiento de membresías y esquemas `private`. |
| **Funciones Atómicas DB**| **pgTAP / PL/pgSQL Test** | **100%** | Test de Concurrencia Dual `accept_delivery_offer` con identidades autenticadas. |

---

## 2. Catálogo Ampliado de Casos de Prueba

### 2.1 Pruebas de Máquina de Estados y Despacho
* **Valid/Forbidden Transitions:** Verificar que una entrega en `TO_PICKUP` no pueda saltar directamente a `DELIVERED`.
* **Concurrencia Invariante A:** Dos `auth.uid()` distintos aceptan la misma oferta simultáneamente (`1 success`, `1 409 Conflict`).
* **Concurrencia Invariante B:** El mismo `auth.uid()` acepta dos ofertas simultáneas (`1 success`, `1 DRIVER_ALREADY_BUSY`).
* **Conductor Suspendido / GPS Stale:** Rechazo de adjudicación a conductores inactivos o con GPS no actualizado.

### 2.2 Pruebas de RLS & Esquemas Privados
* **Aislamiento Multi-Comercio:** Un usuario de Empresa A no puede leer entregas de Empresa B.
* **Inaccesibilidad de `private`:** Peticiones directas con token anon/authenticated a `private.delivery_secrets` son rebotadas por la API REST.
* **Scope de Sucursal:** `business_manager` solo accede a entregas de su `location_scope`.

### 2.3 Pruebas de Custodia, OTP y Ledger
* **Resguardo de OTP:** `GET /api/v1/tracking/{token}/otp` es el único endpoint que retorna el OTP. Verificación de bloqueo de 2 min tras 3 fallos en `verify-otp`.
* **Invariante Zero-Sum:** Validar que todo asiento contable cumpla $\sum \text{postings.amount} = 0$.
* **Reutilización de Idempotency Key:** Verificar error `422 IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD` al cambiar el payload.
