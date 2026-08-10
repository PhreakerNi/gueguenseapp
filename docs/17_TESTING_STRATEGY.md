# 17 — ESTRATEGIA DE PRUEBAS Y CALIDAD (TESTING STRATEGY)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Calidad de Software, Pruebas Unitarias, Integración, RLS, Concurrencia y E2E  

---

## 1. Pirámide de Pruebas y Prioridad

En una plataforma logística donde hay movimiento de dinero y despacho físico, un error de código se traduce en pérdida de dinero real. La estrategia de pruebas de Güegüense prioriza la cobertura en los módulos financieros, la máquina de estados y las pruebas de concurrencia.

```text
                 / \
                /   \     E2E Tests (Playwright / Detox) - Flujo Completo
               /-----\
              /   I   \    Integration Tests (API Endpoints + RLS)
             /---------\
            /     U     \   Unit Tests (State Machine, Pricing, Ledger, PIN)
           /-------------\
```

---

## 2. Cobertura Mínima Exigida por Capa

| Capa de Software | Herramienta | Cobertura Mínima | Foco Principal de Prueba |
| :--- | :--- | :--- | :--- |
| **Lógica de Dominio** | **Jest / Vitest** | **95%** | Máquina de estados, algoritmos de scoring, fórmulas de precios y cálculos de ledger. |
| **Base de Datos & RLS** | **pgTAP / Supabase CLI** | **90%** | Políticas Row Level Security, validación de roles y permisos de lectura/escritura. |
| **Funciones Atómicas DB**| **pgTAP / PL/pgSQL Test** | **100%** | Función `accept_delivery_offer` atómica contra asignación doble simultánea. |
| **Contratos API / DTOs** | **Supertest / Vitest** | **85%** | Validación de schemas Zod, códigos de error HTTP e idempotencia. |
| **Pruebas E2E** | **Detox (Mobile) / Playwright**| Flujos Críticos | Registro de negocio, solicitud de viaje, aceptación de driver y validación de PIN. |

---

## 3. Pruebas Críticas Obligatorias (Test Cases Requeridos)

### 3.1 Test Case: Prevención de Asignación Doble (Double Accept Concurrency)
* **Objetivo:** Garantizar que dos llamadas concurrentes a `accept_delivery_offer` para la misma entrega resulten en exactamente 1 éxito y 1 rechazo.
* **Estrategia:** Se ejecutan dos llamadas API paralelas utilizando `Promise.all()` apuntando al mismo `delivery_id` en una base de datos PostgreSQL real.

### 3.2 Test Case: Transiciones Inválidas de Estado
* **Objetivo:** Verificar que intentar cambiar el estado de una entrega de `SEARCHING_DRIVER` a `DELIVERED` directamente sea rechazado por el backend con un error `400 Bad Request`.

### 3.3 Test Case: Inmutabilidad Financiera del Ledger
* **Objetivo:** Verificar que no existan sentencias `UPDATE` o `DELETE` autorizadas en la tabla `ledger_entries` y que la suma de balance de partida doble siempre sea cero.

### 3.4 Test Case: Validación de PIN de Entrega
* **Objetivo:** Confirmar que ingresar un PIN erróneo no cambie el estado a `DELIVERED` y que al tercer intento fallido se active el bloqueo temporal.
* **Ejecución:** Automatizada en CI/CD vía GitHub Actions antes de autorizar cualquier Merge a `main`.
