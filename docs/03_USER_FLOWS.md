# 03 — FLUJOS DE USUARIO (USER FLOWS)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Diagramación UX y Experiencia de Usuario Alineada 100% con la Máquina de Estados  

---

## 1. Alineación Total con los Ciclos de Vida del Backend

Los flujos de interfaz de usuario (**UX Flows**) representan punto por punto las transiciones validadas por el backend, sin omitir pasos intermedios ni inventar estados.

### 1.1 Ciclo de Cotización (Quote Lifecycle UX)
```text
┌─────────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
│     Formulario App      │─────►│    Cálculo Backend      │─────►│   Cotización Activa     │
│ (Sucursal / Destinatario)│      │  (Quote Motor Tarifas)  │      │(QUOTED - Valida 5 min)  │
└─────────────────────────┘      └─────────────────────────┘      └────────────┬────────────┘
                                                                               │
                                                                               ▼ (Confirmar Envío)
                                                                  ┌─────────────────────────┐
                                                                  │   Quote Consumido       │
                                                                  │(CONSUMED - Crea Delivery│
                                                                  └─────────────────────────┘
```

### 1.2 Ciclo de Entrega (Delivery Lifecycle UX)
```text
┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│SEARCHING_DRIVER│───►│ DRIVER_ASSIGNED│───►│   TO_PICKUP    │───►│ ARRIVED_PICKUP │
│(Búsqueda Open) │    │(Lock Atómico)  │    │(Desplazamiento)│    │(En Sucursal)   │
└────────────────┘    └────────────────┘    └────────────────┘    └───────┬────────┘
                                                                          │ (Transferencia Custodia
                                                                          │  con PICKUP_CODE)
┌────────────────┐    ┌────────────────┐    ┌────────────────┐            │
│   DELIVERED    │◄───│ARRIVED_DROPOFF │◄───│   TO_DROPOFF   │◄───────────┘
│(Valida OTP)    │    │(En Cliente)    │    │(En Camino)     │
└────────────────┘    └────────────────┘    └────────────────┘
```

---

## 2. Flujo de Transferencia de Custodia en Sucursal (Pickup Protocol)

1. **Llegada:** El conductor arriba a la sucursal y presiona "Llegué al Negocio". El backend pasa el viaje a `ARRIVED_PICKUP`.
2. **Generación de Código:** El backend genera el `PICKUP_CODE` (o QR temporal) en la pantalla de la App Driver.
3. **Validación:** El despachador del negocio (`business_employee`) escanea o digita el `PICKUP_CODE` en su App Business.
4. **Confirmación:** El backend valida la coincidencia y la membresía del empleado, registrando el evento `CUSTODY_TRANSFERRED` y cambiando la entrega a `PICKED_UP`.
5. **Invariante:** El conductor no puede autopromoverse a `PICKED_UP` por sí solo.

---

## 3. Flujo de Confirmación al Cliente Final (Delivery OTP Protocol)

1. **Llegada:** El conductor arriba al domicilio y presiona "Llegué al Destino". El viaje pasa a `ARRIVED_DROPOFF`.
2. **Notificación:** El cliente recibe la alerta SMS/WhatsApp con el aviso de llegada y visualiza su **`DELIVERY_OTP` de 6 dígitos** en su pantalla de Tracking Web.
3. **Verificación:** El cliente dicta verbalmente el OTP al conductor. El conductor lo ingresa en su App Driver.
4. **Resguardo Backend:** El backend compara el hash del intento contra `private.delivery_secrets.otp_digest`. Si coincide, la entrega cambia a `DELIVERED` y la ganancia se acredita.

---

## 4. Flujo de Devolución de Custodia (Return Sub-flow UX)

```text
  [Incapacidad de entrega en ARRIVED_DROPOFF / Incidencia Post-Pickup]
                                  │
                                  ▼
                       ┌────────────────────┐
                       │  RETURN_REQUIRED   │ (Operador/Backend ordena devolución)
                       └──────────┬─────────┘
                                  │ (Driver inicia retorno)
                       ┌──────────▼─────────┐
                       │     RETURNING      │ (Navegación de regreso a sucursal)
                       └──────────┬─────────┘
                                  │ (Comercio recibe paquete y firma)
                       ┌──────────▼─────────┐
                       │      RETURNED      │ (Custodia cerrada exitosamente)
                       └────────────────────┘
```

---

## 5. Cancela pre-pickup vs Custodia post-pickup

* **Cancelación Pre-Pickup (`DRIVER_ASSIGNED` / `TO_PICKUP`):** El conductor presiona "Cancelar Aceptación". El `driver_id` se vuelve `NULL`, el estado regresa a `SEARCHING_DRIVER` y se emite la búsqueda a otro motorizado.
* **Incidencia Post-Pickup (`PICKED_UP` / `TO_DROPOFF`):** Prohibida la desasignación simple. El conductor debe iniciar la ruta de devolución (`RETURNING`) o entregar el paquete presencialmente a otro conductor bajo la supervisión de un operador (`RESOLVED_HANDOFF`).
