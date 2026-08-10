# 17 — ESTRATEGIA DE PRUEBAS Y CALIDAD (TESTING STRATEGY)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Pruebas de Concurrencia Dual con Identidades Autenticadas, RLS con Supabase CLI y Custodia  

---

## 1. Cobertura Mínima Exigida

| Capa | Herramienta | Cobertura | Foco Principal |
| :--- | :--- | :--- | :--- |
| **Lógica de Dominio** | **Jest / Vitest** | **95%** | Máquina de estados, scoring, precios y ledger. |
| **Base de Datos & RLS** | **pgTAP (Supabase CLI)**| **90%** | Políticas RLS, aislamiento de membresías y aislamiento de esquemas privados. |
| **Funciones Atómicas DB**| **pgTAP / PL/pgSQL Test** | **100%** | Test de Concurrencia Dual `accept_delivery_offer` con identidades autenticadas. |

---

## 2. Pruebas Críticas de Concurrencia e Identidad

1. **Test Invariante A (1 Delivery $\rightarrow$ 1 Driver):**
   * Dos peticiones simultáneas `Promise.all()` autenticadas con diferentes `auth.uid()` para el mismo `delivery_id`.
   * **Resultado:** 1 `200 OK` y 1 `409 Conflict`.
2. **Test Invariante B (1 Driver $\rightarrow$ 1 Delivery):**
   * El **MISMO** `auth.uid()` intenta aceptar dos entregas distintas en paralelo.
   * **Resultado:** La primera triunfa; la segunda falla por `DRIVER_ALREADY_BUSY`.
3. **Test de Resguardo de OTP (`otp_hash`):**
   * Verificar que la API no retorne el OTP plano y que tras 3 intentos fallidos la entrega active `otp_locked_until`.
