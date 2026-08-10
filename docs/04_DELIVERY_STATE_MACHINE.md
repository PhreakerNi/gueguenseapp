# 04 — MÁQUINA DE ESTADOS Y SUBSISTEMAS DE ENTREGA (DELIVERY STATE MACHINE)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Máquina de Estados Canónica, Separación Quote/Delivery, Sub-ciclo de Incidentes y Devoluciones  

---

## 1. Separación Estricta: Quote Lifecycle vs. Delivery Lifecycle

Güegüense no mezcla la cotización inicial con la máquina de estados de la entrega.

### 1.1 Ciclo de Vida de la Cotización (`QUOTE_STATUS`)
1. **`DRAFT`:** Formulario de cotización en preparación en la app.
2. **`QUOTED`:** Cotización calculada con `quoted_total` y expiración (`expires_at` de 5 minutos).
3. **`CONSUMED`:** La cotización fue confirmada y dio origen a una entrega activa.
4. **`EXPIRED`:** Venció el tiempo de 5 minutos sin ser confirmada.
5. **`CANCELED`:** Invalidad por el negocio o sistema.

---

## 2. Ciclo de Vida de la Entrega (`DELIVERY_STATUS`)

Una entrega solo nace cuando una cotización en estado `QUOTED` es consumida.

```text
               ┌───────────────────┐
               │ SEARCHING_DRIVER  │◄──────────────────┐
               └─────────┬─────────┘                   │
                         │ (Aceptar Lock)              │ (Cancelación pre-pickup:
               ┌─────────▼─────────┐                   │  Desasignar e iniciar
               │  DRIVER_ASSIGNED  ├───────────────────┤  nueva búsqueda)
               └─────────┬─────────┘                   │
                         │ (Iniciar Ruta)              │
               ┌─────────▼─────────┐                   │
               │    TO_PICKUP      ├───────────────────┘
               └─────────┬─────────┘
                         │ (Llegada)
               ┌─────────▼─────────┐
               │  ARRIVED_PICKUP   │
               └─────────┬─────────┘
                         │ (Verificar PICKUP_CODE en Negocio)
               ┌─────────▼─────────┐
               │    PICKED_UP      │
               └─────────┬─────────┘
                         │ (Iniciar Ruta Cliente)
               ┌─────────▼─────────┐
               │    TO_DROPOFF     │
               └─────────┬─────────┘
                         │ (Llegada a Cliente)
               ┌─────────▼─────────┐
               │  ARRIVED_DROPOFF  │
               └─────────┬─────────┘
                         │ (Validar DELIVERY_OTP Digest Hash)
               ┌─────────▼─────────┐                    ┌───────────────────┐
               │     DELIVERED     │                    │     CANCELED      │
               └───────────────────┘                    └───────────────────┘

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
                       │ (Comercio recibe paquete y valida custodia)
             ┌─────────▼─────────┐
             │     RETURNED      │ (Custodia cerrada exitosamente)
             └───────────────────┘
```

---

## 3. Catálogo Canónico de Estados de Entrega

### Estados Activos Primarios:
* **`SEARCHING_DRIVER`:** Solicitud activa emitiendo ofertas en el Dispatch Engine.
* **`DRIVER_ASSIGNED`:** Conductor adjudicado atómicamente al viaje.
* **`TO_PICKUP`:** Conductor desplazándose a la sucursal.
* **`ARRIVED_PICKUP`:** Conductor presente en la sucursal.
* **`PICKED_UP`:** Custodia del paquete transferida y validada por `PICKUP_CODE`.
* **`TO_DROPOFF`:** Conductor en tránsito hacia el cliente final.
* **`ARRIVED_DROPOFF`:** Conductor presente en el domicilio del destinatario.

### Sub-ciclo de Devolución de Custodia:
* **`RETURN_REQUIRED`:** Devolución ordenada por operador/sistema (cliente ausente, paquete rechazado).
* **`RETURNING`:** Conductor en ruta de regreso a la sucursal origen.

### Estados Terminales de la Entrega:
* **`DELIVERED`:** Entrega completada mediante validación exitosa del `DELIVERY_OTP`.
* **`RETURNED`:** Paquete devuelto al negocio y custodia física cerrada.
* **`CANCELED`:** Operación abortada antes de la recogida conforme a reglas autorizadas.
* **`FAILED`:** Operación no completable sin flujo operativo de custodia pendiente.

---

## 4. Sub-sistema Independiente de Incidentes (`incidents`)

Los imprevistos en ruta **NO** alteran el enum `DELIVERY_STATUS` a valores ambiguos. Se registran en la entidad `incidents`:

### `INCIDENT_TYPE` Canónico:
`VEHICLE_BREAKDOWN`, `ACCIDENT`, `GPS_LOST`, `NETWORK_LOST`, `PACKAGE_DAMAGED`, `BUSINESS_CLOSED`, `PACKAGE_NOT_READY`, `CUSTOMER_UNREACHABLE`, `RECIPIENT_REFUSED`, `ADDRESS_PROBLEM`, `PAYMENT_PROBLEM`, `CASH_MISMATCH`, `SAFETY_ISSUE`, `OTHER`.

### `INCIDENT_STATUS` Canónico:
`OPEN`, `UNDER_INVESTIGATION`, `RESOLVED_CONTINUE`, `RESOLVED_RETURN`, `RESOLVED_HANDOFF`, `CLOSED`.

Una entrega puede estar en `TO_DROPOFF` y tener un incidente asociado en `OPEN`.
