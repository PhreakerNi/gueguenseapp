# 03 — FLUJOS DE USUARIO (USER FLOWS)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Diagramación de Interacciones y Experiencia de Usuario Alineada con la Máquina de Estados  

---

## 1. Alineación Total con la Máquina de Estados

Los flujos de interfaz de usuario (**UX Flows**) reflejan punto por punto cada estado y transición del backend sin omitir pasos intermedios.

```text
┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│   DRAFT        │───►│   QUOTED       │───►│SEARCHING_DRIVER│───►│ DRIVER_ASSIGNED│
│(Llenar Datos)  │    │(Cotización 5m) │    │(Dispatch Timer)│    │(Lock Atómico)  │
└────────────────┘    └────────────────┘    └────────────────┘    └───────┬────────┘
                                                                          │
┌────────────────┐    ┌────────────────┐    ┌────────────────┐            │
│ ARRIVED_PICKUP │◄───│   TO_PICKUP    │◄───│  Confirmar     │◄───────────┘
│(En Sucursal)   │    │(Desplazamiento)│    │  Inicio Ruta   │
└───────┬────────┘    └────────────────┘    └────────────────┘
        │
        ▼
┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│   PICKED_UP    │───►│   TO_DROPOFF   │───►│ARRIVED_DROPOFF │───►│   DELIVERED    │
│(Transfer Cust.)│    │(Desplazamiento)│    │(En Cliente)    │    │(Valida OTP)    │
└────────────────┘    └────────────────┘    └────────────────┘    └────────────────┘
```

---

## 2. Flujos del Negocio (Business Flows)

### 2.1 Flujo de Solicitud "Solo Delivery" (Modalidad A)
1. **Punto de Recogida (`DRAFT`):** Selecciona la sucursal activa.
2. **Destinatario e Información:** Ingresa cliente, teléfono, dirección y marca pin en el mapa.
3. **Cotización (`QUOTED`):** El backend calcula y congela el precio por 5 minutos.
4. **Solicitar:** Presiona **"SOLICITAR MOTORIZADO"**. El backend pasa el viaje a `SEARCHING_DRIVER`.
5. **Asignación (`DRIVER_ASSIGNED`):** Al ganar la oferta un conductor, el negocio ve su nombre, foto, vehículo y ETA de llegada a la sucursal.
6. **Entrega del Paquete en Sucursal:** Al llegar el conductor (`ARRIVED_PICKUP`), el despadachador verifica la identidad, entrega el paquete y opcionalmente valida el `PICKUP_CODE` de transferencia de custodia. El viaje cambia a `PICKED_UP`.

---

## 3. Flujos del Motorizado (Driver Flows)

### 3.1 Flujo Completo de Ejecución de Servicio
1. **Ponerse Disponible:** Activa el switch **"ESTOY DISPONIBLE"** (`AVAILABLE`).
2. **Oferta Entrante:** Tono sonoro y modal con temporizador atómico de 15s mostrando ganancia neta.
3. **Aceptación (`DRIVER_ASSIGNED`):** Presiona **"ACEPTAR"**. El backend ejecuta la función atómica.
4. **Inicio de Ruta a Sucursal (`TO_PICKUP`):** Presiona "INICIAR NAVEGACIÓN A NEGOCIO".
5. **Llegada a Sucursal (`ARRIVED_PICKUP`):** Al estar a <50m o presionar el botón, se notifica al negocio.
6. **Recogida y Custodia (`PICKED_UP`):** Recibe el paquete y presiona **"CONFIRMAR RECOGIDA"**.
7. **Navegación al Cliente (`TO_DROPOFF`):** Inicia desplazamiento hacia el destino.
8. **Llegada a Destino (`ARRIVED_DROPOFF`):** Presiona "LLEGUÉ AL DESTINO". Se notifica al cliente.
9. **Confirmación con OTP (`DELIVERED`):** Pide el `DELIVERY_OTP` de 4-6 dígitos al cliente, lo digita en su app. El backend valida el hash. Al tener éxito, la ganancia se acredita y el viaje finaliza.

---

## 4. Cancelaciones y Custodia Controlada

### 4.1 Cancelación ANTES de la Recogida (`TO_PICKUP` / `ARRIVED_PICKUP`)
* **Acción:** Si el conductor sufre una ponchadura antes de recoger el paquete, presiona "Cancelar Viaje".
* **Resultado:** El conductor queda desasignado (`driver_id = NULL`). El delivery regresa automáticamente a `SEARCHING_DRIVER` para que otro motorizado cercano lo recoja sin afectar al negocio.

### 4.2 Incidencia DESPUÉS de la Recogida (`PICKED_UP` / `TO_DROPOFF`)
* **REGLA DE CUSTODIA:** El conductor ya tiene el paquete físico. **NUNCA** se realiza una desasignación simple.
* **Resultado:**
  1. El conductor presiona "Reportar Incidencia" -> *Accidente / Avería*.
  2. Se abre una entidad `incidents` en estado `OPEN`. El delivery entra en protocolo de devolución o traspaso controlado (`RETURN_REQUIRED` / Hand-off presencial supervisado por Operator).
  3. No se libera la entrega hasta registrar la prueba de firma/foto de traspaso o retorno al comercio.

---

## 5. Flujo del Cliente y Confirmación por OTP (Customer Flow)

1. **Recepción del Enlace:** SMS / WhatsApp automático enviado al estado `PICKED_UP`.
2. **Portal Web de Tracking:** Abre la web pública. Visualiza mapa con posición adaptativa, datos del motorizado y su **`DELIVERY_OTP` en pantalla destacado**.
3. **Entrega del Código:** Dicta verbalmente su OTP al motorizado al recibir el paquete. El motorizado lo ingresa en su app y la entrega concluye exitosamente.
