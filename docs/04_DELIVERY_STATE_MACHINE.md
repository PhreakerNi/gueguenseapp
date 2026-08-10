# 04 — MÁQUINA DE ESTADOS Y SUBSISTEMAS DE ENTREGA (DELIVERY STATE MACHINE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Lógica de Negocio Central, Ciclos de Vida, Sub-ciclos de Incidentes y Devoluciones  

---

## 1. Desacoplamiento de Ciclos de Vida

Güegüense separa estrictamente el **Ciclo de Vida de la Entrega** de la gestión de **Incidentes Operativos** y del **Flujo de Devolución de Custodia**.

```text
                               ┌──────────┐
                               │  DRAFT   │
                               └────┬─────┘
                                    │ (Cotizar)
                               ┌────▼─────┐
                               │  QUOTED  │
                               └────┬─────┘
                                    │ (Solicitar)
                           ┌────────▼──────────┐
                           │ SEARCHING_DRIVER  │◄──────────────────┐
                           └────────┬──────────┘                   │
                                    │ (Aceptar Lock)               │ (Cancelación pre-pickup:
                           ┌────────▼──────────┐                   │  Desasignar e iniciar
                           │  DRIVER_ASSIGNED  ├───────────────────┤  nueva búsqueda)
                           └────────┬──────────┘                   │
                                    │ (Iniciar Ruta)               │
                           ┌────────▼──────────┐                   │
                           │    TO_PICKUP      ├───────────────────┘
                           └────────┬──────────┘
                                    │ (Llegada)
                           ┌────────▼──────────┐
                           │  ARRIVED_PICKUP   │
                           └────────┬──────────┘
                                    │ (Verificar PICKUP_CODE)
                           ┌────────▼──────────┐
                           │    PICKED_UP      │
                           └────────┬──────────┘
                                    │ (Iniciar Ruta Cliente)
                           ┌────────▼──────────┐
                           │    TO_DROPOFF     │
                           └────────┬──────────┘
                                    │ (Llegada a Cliente)
                           ┌────────▼──────────┐
                           │  ARRIVED_DROPOFF  │
                           └────────┬──────────┘
                                    │ (Validar DELIVERY_OTP Hash)
                           ┌────────▼──────────┐
                           │     DELIVERED     │
                           └───────────────────┘

─────────────────────────────────────────────────────────────────────────────────
SUBSISTEMA DE DEVOLUCIÓN DE CUSTODIA (POST-PICKUP INCIDENT / FAILED)
─────────────────────────────────────────────────────────────────────────────────
   [ARRIVED_DROPOFF / Incidencia Post-Pickup]
                       │
                       ▼
             ┌───────────────────┐
             │  RETURN_REQUIRED  │ (Se exige retornar paquete al comercio)
             └─────────┬─────────┘
                       │ (Motorizado inicia retorno)
             ┌─────────▼─────────┐
             │     RETURNING     │ (Navegación de regreso a sucursal)
             └─────────┬─────────┘
                       │ (Comercio recibe paquete y firma/valida)
             ┌─────────▼─────────┐
             │     RETURNED      │ (Custodia cerrada exitosamente)
             └───────────────────┘
```

---

## 2. Definición del Sub-sistema de Incidentes (`incidents`)

Los problemas operativos (avería mecánica, accidente, GPS perdido, desacuerdo) **NO** son estados finales de la entrega ni alteran el enum principal de la entrega a valores ambiguos.

Se manejan en una entidad independiente `incidents`:
* **`incident_type`:** `VEHICLE_BREAKDOWN`, `ACCIDENT`, `WEATHER_ALERT`, `ADDRESS_UNREACHABLE`, `RECIPIENT_REFUSED`, `PACKAGE_DAMAGED`, `GPS_LOST`.
* **`incident_status`:** `OPEN`, `UNDER_INVESTIGATION`, `RESOLVED_CONTINUE`, `RESOLVED_RETURN`, `RESOLVED_REASSIGNED`.

Una entrega puede permanecer en estado `TO_DROPOFF` y tener simultáneamente un registro de incidente `OPEN`.

---

## 3. Matriz Estricta de Transiciones de la Entrega

| Estado Origen | Estado Destino | Actor | Condición / Validación Previa | Evento Inmutable Generado |
| :--- | :--- | :--- | :--- | :--- |
| `DRAFT` | `QUOTED` | `business` | Formulario válido con sucursal y destino. | `DELIVERY_QUOTED` |
| `QUOTED` | `SEARCHING_DRIVER` | `business` | Cotización vigente (<5 min). | `SEARCH_STARTED` |
| `SEARCHING_DRIVER` | `DRIVER_ASSIGNED` | `driver` / `system` | Transacción atómica `accept_delivery_offer` con verificaciones duales. | `DRIVER_ASSIGNED` |
| `DRIVER_ASSIGNED` | `TO_PICKUP` | `driver` | Driver inicia desplazamiento en app. | `EN_ROUTE_TO_PICKUP` |
| `DRIVER_ASSIGNED` / `TO_PICKUP` | `SEARCHING_DRIVER` | `driver` / `system` | Cancelación ANTES del pickup. Driver desasignado, paquete sigue en comercio. | `DRIVER_UNASSIGNED_RESEARCHING` |
| `TO_PICKUP` | `ARRIVED_PICKUP` | `driver` | Geofence <50m o confirmación manual. | `ARRIVED_AT_PICKUP` |
| `ARRIVED_PICKUP` | `PICKED_UP` | `driver` / `business` | Transferencia de paquete y validación opcional de `PICKUP_CODE`. | `PACKAGE_PICKED_UP` |
| `PICKED_UP` | `TO_DROPOFF` | `driver` | Driver inicia ruta al destinatario. | `EN_ROUTE_TO_DROPOFF` |
| `TO_DROPOFF` | `ARRIVED_DROPOFF` | `driver` | Geofence <50m del destino. | `ARRIVED_AT_DROPOFF` |
| `ARRIVED_DROPOFF` | `DELIVERED` | `driver` | Validación exitosa del `DELIVERY_OTP` contra `otp_hash` en backend. | `DELIVERY_COMPLETED` |
| `ARRIVED_DROPOFF` / `TO_DROPOFF` | `RETURN_REQUIRED` | `operator` / `system` | Cliente ausente (después de 10 min de gracia) o paquete rechazado. | `RETURN_INITIATED` |
| `RETURN_REQUIRED` | `RETURNING` | `driver` | Driver inicia desplazamiento de regreso al comercio. | `EN_ROUTE_TO_RETURN` |
| `RETURNING` | `RETURNED` | `business` / `driver` | Comercio confirma recepción del paquete devuelto. | `RETURN_COMPLETED` |

---

## 4. Invariantes Absolutos del Sistema

1. **Custodia Protegida:** Un conductor que ya ejecutó la transición a `PICKED_UP` NO puede ser simplemente "desasignado" de la entrega sin activar la cadena de custodia `RETURN_REQUIRED` o un protocolo de traspaso físico supervisado por `operator`.
2. **Resguardo de OTP:** El `DELIVERY_OTP` se almacena exclusivamente como hash bcrypt/argon2 (`otp_hash`). La verificación se realiza server-side.
