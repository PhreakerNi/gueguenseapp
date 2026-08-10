# 04 — MÁQUINA DE ESTADOS DE ENTREGA (DELIVERY STATE MACHINE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Lógica de Negocio Central, Estados Inmutables y Transiciones Validadas  

---

## 1. Definición Formal de la Máquina de Estados

La máquina de estados de entrega (**Delivery State Machine**) es la fuente de verdad técnica de Güegüense. Todas las aplicaciones clientes (Negocios, Driver, Admin, Web Tracking) son simples representaciones visuales; **únicamente el Backend autoriza y ejecuta las transiciones de estado**.

```text
               ┌──────────┐
               │  DRAFT   │
               └────┬─────┘
                    │ (Negocio llena formulario)
               ┌────▼─────┐
               │  QUOTED  │
               └────┬─────┘
                    │ (Negocio confirma "Solicitar Motorizado")
           ┌────────▼──────────┐
           │ SEARCHING_DRIVER  ├──────────────────────────────┐
           └────────┬──────────┘                              │
                    │ (Driver Acepta Oferta)                  │
           ┌────────▼──────────┐                              │
           │  DRIVER_ASSIGNED  │                              │ (Cancelado previo
           └────────┬──────────┘                              │  a asignación)
                    │ (Driver inicia ruta)                    │
           ┌────────▼──────────┐                              │
           │    TO_PICKUP      │                              │
           └────────┬──────────┘                              │
                    │ (Driver llega a sucursal)               │
           ┌────────▼──────────┐                              │
           │  ARRIVED_PICKUP   │                              │
           └────────┬──────────┘                              │
                    │ (Negocio entrega paquete)               │
           ┌────────▼──────────┐                              │
           │    PICKED_UP      │                              │
           └────────┬──────────┘                              │
                    │ (Driver inicia ruta cliente)            │
           ┌────────▼──────────┐                              │
           │    TO_DROPOFF     │                              │
           └────────┬──────────┘                              │
                    │ (Driver llega a destino)                │
           ┌────────▼──────────┐                              │
           │  ARRIVED_DROPOFF  │                              │
           └────────┬──────────┘                              │
                    │ (Ingreso y validación del PIN)          │
           ┌────────▼──────────┐                    ┌─────────▼────────┐
           │     DELIVERED     │                    │     CANCELED     │
           └───────────────────┘                    └──────────────────┘
```

---

## 2. Catálogo Oficial de Estados

### Estados Primarios (Flujo Exitoso):
1. **`DRAFT`:** Solicitud iniciada en la App Negocios, aún sin formulario completo.
2. **`QUOTED`:** Cotización calculada por el motor de precios (distancia, tiempo y tarifa fijados).
3. **`SEARCHING_DRIVER`:** Solicitud activa en el Dispatch Engine emitiendo ofertas a motorizados.
4. **`DRIVER_ASSIGNED`:** Motorizado verificado adjudicado atómicamente al viaje.
5. **`TO_PICKUP`:** Motorizado desplazándose hacia la sucursal del comercio.
6. **`ARRIVED_PICKUP`:** Motorizado presente físicamente en la sucursal.
7. **`PICKED_UP`:** Paquete recibido y verificado por el motorizado en la sucursal.
8. **`TO_DROPOFF`:** Motorizado en tránsito hacia la dirección del cliente final.
9. **`ARRIVED_DROPOFF`:** Motorizado presente fuera del domicilio del cliente.
10. **`DELIVERED`:** PIN validado con éxito. Entrega finalizada y cobro registrado.

### Estados Alternativos / Excepcionales:
* **`CANCELED`:** Entrega abortada por el negocio o admin (según políticas de cancelación).
* **`FAILED`:** Entrega fallida por cliente ausente, dirección inexistente o rechazo de paquete.
* **`DISPUTED`:** Estado de pausa operativa por accidente, pérdida de señal o desacuerdo. Requiere intervención de Admin/Operator.

---

## 3. Matriz Estricta de Transiciones

| Estado Origen | Estado Destino | Actor Autorizado | Condición / Validación Previa | Evento Inmutable Generado | Efectos Secundarios (Side Effects) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `DRAFT` | `QUOTED` | `business` | Formulario con sucursal y destino válidos. | `DELIVERY_QUOTED` | Se genera tarifa e ID de cotización firmado con expira de 5 min. |
| `QUOTED` | `SEARCHING_DRIVER` | `business` | Cotización vigente, saldo/pago autorizado. | `SEARCH_STARTED` | Dispara el Dispatch Engine. Inicia búsqueda en radio inicial. |
| `SEARCHING_DRIVER` | `DRIVER_ASSIGNED` | `system` / `driver` | Primer click de "Aceptar" que obtiene el lock atómico en DB. | `DRIVER_ASSIGNED` | Cancela ofertas pendientes a otros conductores. Notifica al negocio. |
| `DRIVER_ASSIGNED` | `TO_PICKUP` | `driver` | El driver confirma inicio de desplazamiento en app. | `EN_ROUTE_TO_PICKUP` | Activa frecuencia alta de rastreo GPS (cada 5s). |
| `TO_PICKUP` | `ARRIVED_PICKUP` | `driver` | Geofence GPS < 50m de la sucursal o confirmación manual. | `ARRIVED_AT_PICKUP` | Notifica al negocio: "El motorizado ha llegado a tu local". |
| `ARRIVED_PICKUP` | `PICKED_UP` | `driver` / `business` | Confirmación de paquete entregado al driver. | `PACKAGE_PICKED_UP` | Genera token firmado y SMS de Tracking Web para el cliente final. |
| `PICKED_UP` | `TO_DROPOFF` | `driver` | Inicia ruta hacia el cliente final. | `EN_ROUTE_TO_DROPOFF` | Cambia la vista del mapa en el tracking web del cliente a "En camino". |
| `TO_DROPOFF` | `ARRIVED_DROPOFF` | `driver` | Geofence GPS < 50m del destino del cliente. | `ARRIVED_AT_DROPOFF` | Notifica al cliente: "Tu motorizado está en la puerta". |
| `ARRIVED_DROPOFF` | `DELIVERED` | `driver` | Input del PIN de 4 dígitos exacto otorgado al cliente. | `DELIVERY_COMPLETED` | Procesa asientos contables en Ledger. Desactiva tracking en vivo. |
| *Cualquiera previo a PICKED_UP* | `CANCELED` | `business` / `admin` | Reglas de cancelación vigentes (si ya había driver, aplica penalización). | `DELIVERY_CANCELED` | Libera al motorizado. Procesa reembolso o cargo parcial. |
| `ARRIVED_DROPOFF` | `FAILED` | `driver` / `operator` | Expiró tiempo de espera (10 min) y cliente no respondió. | `DELIVERY_FAILED` | Inicia protocolo de retorno de paquete a la sucursal origen. |
| *Cualquier estado activo* | `DISPUTED` | `driver` / `operator` | Reporte de accidente, avería o pérdida de contacto GPS. | `DELIVERY_DISPUTED` | Congela temporizadores. Alerta en vivo al panel Admin/Operator. |

---

## 4. Operaciones Prohibidas (Invariants)

1. **Sin saltos de estado:** Es imposible pasar de `SEARCHING_DRIVER` a `PICKED_UP` sin pasar por `DRIVER_ASSIGNED` y `TO_PICKUP`.
2. **Imposibilidad de alteración directa de PIN:** Ningún usuario (ni siquiera el Admin) puede alterar el estado a `DELIVERED` sin registrar la llamada a la función de validación de PIN o un comando de sobreescritura de auditoría firmado por un `super_admin`.
3. **Inmutabilidad del historial:** Una vez que una entrega alcanza `DELIVERED` o `CANCELED`, su estado no puede ser modificado por ningún endpoint API bajo ninguna circunstancia.
