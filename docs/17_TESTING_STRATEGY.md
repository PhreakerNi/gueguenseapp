# 17 — ESTRATEGIA DE PRUEBAS Y CALIDAD (TESTING STRATEGY)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Pruebas de Concurrencia Dual, RLS con Supabase CLI y Validación de OTP Hash  

---

## 1. Cobertura Mínima y Herramientas

| Capa de Software | Herramienta | Cobertura Mínima | Foco Principal de Prueba |
| :--- | :--- | :--- | :--- |
| **Lógica de Dominio** | **Jest / Vitest** | **95%** | Máquina de estados, algoritmos de scoring, fórmulas de precios y ledger. |
| **Base de Datos & RLS** | **pgTAP (Supabase CLI)**| **90%** | Políticas Row Level Security, permisos de `auth.users` y miembros comerciales. |
| **Funciones Atómicas DB**| **pgTAP / PL/pgSQL Test** | **100%** | Test de Concurrencia Dual `accept_delivery_offer` (Invariantes A y B). |

---

## 2. Pruebas de Concurrencia Dual (Test Cases Requeridos)

1. **Test Invariante A (1 Delivery $\rightarrow$ 1 Driver):**
   * Dos llamadas simultáneas `Promise.all()` con diferentes `driver_id` para el mismo `delivery_id`.
   * **Resultado esperado:** 1 respuesta exitosa (`200 OK`) y 1 respuesta de conflicto (`409 Conflict`).
2. **Test Invariante B (1 Driver $\rightarrow$ 1 Delivery):**
   * Dos llamadas simultáneas para diferentes entregas desde el mismo `driver_id`.
   * **Resultado esperado:** El conductor solo logra adjudicarse la primera entrega; la segunda falla por `DRIVER_ALREADY_BUSY`.
3. **Test de Resguardo de OTP (`otp_hash`):**
   * Verificar que la base de datos no contenga el OTP en texto plano y que tras 3 intentos fallidos la entrega se bloquee temporalmente.
