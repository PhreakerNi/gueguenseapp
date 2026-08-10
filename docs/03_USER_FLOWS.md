# 03 — FLUJOS DE USUARIO (USER FLOWS)

**Proyecto:** Güegüense  
**Versión:** 1.6.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Diagramación UX y Experiencia de Usuario Alineada 100% con la Máquina de Estados  

---

## 1. Alineación Total con los Ciclos de Vida del Backend

Los flujos de interfaz de usuario (**UX Flows**) representan punto por punto las transiciones validadas por el backend.

### 1.1 Ciclo de Vida de la Cotización (Quote Lifecycle UX)
```text
┌─────────────────────────┐      ┌─────────────────────────┐      ┌─────────────────────────┐
│     Formulario App      │─────►│    Cálculo Backend      │─────►│   Cotización Activa     │
│ (Sucursal / Destinatario)│      │  (Quote Motor Tarifas)  │      │(QUOTED - Policy Config) │
└─────────────────────────┘      └─────────────────────────┘      └────────────┬────────────┘
                                                                               │ (Confirmar Envío)
                                                                  ┌────────────▼────────────┐
                                                                  │   Quote Consumido       │
                                                                  │(CONSUMED - Crea Delivery│
                                                                  └─────────────────────────┘
```

### 1.2 Ciclo de Vida de la Entrega (Delivery Lifecycle UX Completo)
```text
┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│SEARCHING_DRIVER│───►│ DRIVER_ASSIGNED│───►│   TO_PICKUP    │───►│ ARRIVED_PICKUP │
│(Búsqueda Open) │    │(Lock Atómico)  │    │(Desplazamiento)│    │(En Sucursal)   │
└────────────────┘    └────────────────┘    └────────────────┘    └───────┬────────┘
                                                                          │ (Transferencia Custodia
                                                                          │  con PICKUP_CODE)
                                                                  ┌───────▼────────┐
                                                                  │   PICKED_UP    │
                                                                  │(Custodia Neg.) │
                                                                  └───────┬────────┘
                                                                          │ (Iniciar Ruta Cliente)
┌────────────────┐    ┌────────────────┐    ┌────────────────┐            │
│   DELIVERED    │◄───│ARRIVED_DROPOFF │◄───│   TO_DROPOFF   │◄───────────┘
│(Valida OTP)    │    │(En Cliente)    │    │(En Camino)     │
└────────────────┘    └────────────────┘    └────────────────┘
```

---

## 2. Detalle de Flujos de Interfaz por Perfil

### 2.1 Flujo Negocio (`apps/business-mobile`)
1. **Onboarding & Registro:** Registro de empresa, sucursales y miembros con asignación N:M en `business_member_locations`.
2. **Creación de Solicitud:** Selección de sucursal origen, dirección de destino, contacto y paquete.
3. **Cotización & Confirmación:** Visualización del desglose de `QUOTED`. Confirmación idempotente (`CONSUMED`) para iniciar la entrega en `SEARCHING_DRIVER`.
4. **Validación de Custodia en Pickup (Flujo Normal):** El despachador del negocio recibe al motorizado en `ARRIVED_PICKUP`, observa el `PICKUP_CODE` en la pantalla del motorizado y lo introduce en la App Business para pasar a `PICKED_UP`.
5. **Historial & Detalle:** Seguimiento en vivo de entregas activas y consulta del historial.

### 2.2 Flujo Conductor (`apps/driver-mobile`)
1. **Registro & Carga de Documentos:** Subida de cédula, licencia y circulación a URLs firmadas privadas (`driver_documents`).
2. **Disponibilidad & Ofertas:** Activación de estado `AVAILABLE`. Recepción atómica de ofertas entrantes en `driver:{id}:offers`.
3. **Ruta & Pickup:** Aceptación de oferta (`DRIVER_ASSIGNED`), desplazamiento (`TO_PICKUP`), aviso de llegada (`ARRIVED_PICKUP`) y despliegue del `PICKUP_CODE` en pantalla para ser escaneado/digitado por el comercio.
4. **Transporte & Entrega OTP:** Navegación a destino (`TO_DROPOFF`), aviso de llegada (`ARRIVED_DROPOFF`), ingreso del `DELIVERY_OTP` (6 dígitos) dictado verbalmente por el cliente final para confirmar `DELIVERED`.
5. **Incidencias & Devolución:** Registro de incidente en ruta o inicio de devolución (`RETURN_REQUIRED` $\rightarrow$ `RETURNING` $\rightarrow$ `RETURNED`).

### 2.3 Flujo Cliente Destinatario (`apps/tracking-web`)
1. **Acceso Seguro por Bearer Token:** Apertura de enlace con token de alta entropía (`https://gueguense.app/t/<TOKEN>`).
2. **Visualización de OTP:** El cliente observa en pantalla su **`DELIVERY_OTP` de 6 dígitos** para dictárselo al motorizado (visible únicamente en estados autorizados: `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`).
3. **Estado en Vivo:** Visualización del estado del paquete y posición del motorizado durante el tránsito vía short polling adaptativo.
4. **Cierre de Sesión:** Tras pasar a `DELIVERED`, la posición GPS se desvincula y solo se muestra la confirmación del servicio.

### 2.4 Flujo Administrador y Operaciones Extraordinarias (`apps/admin-web`)
1. **Mapa de Operaciones:** Monitoreo global de la flota en tiempo real.
2. **Intervención Extraordinaria en Pickup:** En situaciones excepcionales (fallo de dispositivo en comercio), un operador de Admin autoriza la confirmación de custodia tras verificación telefónica, registrando `reason` obligatorio y log de auditoría.
3. **Mesa de Incidentes & Devoluciones:** Autorización de retornos (`RETURN_REQUIRED`) o traspasos presenciales de custodia (`RESOLVED_HANDOFF`).
