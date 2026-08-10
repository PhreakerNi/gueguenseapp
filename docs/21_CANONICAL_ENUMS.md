# 21 — MATRIZ CANÓNICA DE ENUMS Y DICCIONARIO DE ESTADOS (CANONICAL ENUMS)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Matriz Canónica de Estados, Tipos y Enumeradores de Dominio Nombres Completos Sin Abreviaciones  

---

## 1. Propósito

Este documento centraliza la totalidad de los valores enumerados (`ENUMS`) utilizados en la base de datos, APIs, lógica de negocio y aplicaciones clientes de Güegüense, garantizando 0% de contradicciones y **CERO ABREVIACIONES EN LOS VALORES DE ENUM**.

---

## 2. Diccionario Canónico de Enumeradores (Valores Nombres Completos)

```text
┌────────────────────────────────────────────────────────────────────────┐
│ 1. QUOTE_STATUS (Ciclo de Cotización)                                  │
├─────────────────┬──────────────────────────────────────────────────────┤
│ `DRAFT`         │ Formulario de cotización en edición                  │
│ `QUOTED`        │ Cotización activa calculada con precio y expiración  │
│ `CONSUMED`      │ Cotización confirmada utilizada para crear delivery  │
│ `EXPIRED`       │ Cotización vencida tras 5 minutos sin confirmar      │
│ `CANCELED`      │ Cotización invalidada                                │
└─────────────────┴──────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 2. DELIVERY_STATUS (Ciclo de Entrega - Nombres Completos Sin Abreviar)  │
├─────────────────┬──────────────────────────────────────────────────────┤
│ `SEARCHING_DRIVER` │ Solicitud buscando motorizados elegibles            │
│ `DRIVER_ASSIGNED` │ Conductor adjudicado atómicamente a la entrega      │
│ `TO_PICKUP`     │ Conductor desplazándose a la sucursal del comercio   │
│ `ARRIVED_PICKUP`│ Conductor presente en la sucursal del comercio       │
│ `PICKED_UP`     │ Custodia transferida y confirmada por PICKUP_CODE    │
│ `TO_DROPOFF`    │ Conductor en ruta hacia el cliente final             │
│ `ARRIVED_DROPOFF`│ Conductor en la puerta del destinatario             │
│ `DELIVERED`     │ Entrega completada mediante validación de OTP (Term.)│
│ `RETURN_REQUIRED`│ Devolución de paquete ordenada por operador/sistema │
│ `RETURNING`     │ Conductor en ruta de regreso a la sucursal           │
│ `RETURNED`      │ Paquete devuelto al negocio y custodia cerrada (Term)│
│ `CANCELED`      │ Operación cancelada autorizadamente pre-pickup (Term)│
│ `FAILED`        │ Operación fallida irrecuperable sin retorno (Term.)  │
└─────────────────┴──────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 3. INCIDENT_STATUS (Estado del Incidente Desacoplado - Nombres Comp.)  │
├───────────────────────┬────────────────────────────────────────────────┤
│ `OPEN`                │ Incidente registrado recién reportado          │
│ `UNDER_INVESTIGATION` │ Incidente en revisión por un operador de Admin │
│ `RESOLVED_CONTINUE`   │ Incidente resuelto permitiendo continuar       │
│ `RESOLVED_RETURN`     │ Incidente resuelto ordenando devolución        │
│ `RESOLVED_HANDOFF`    │ Incidente resuelto mediante traspaso presencial│
│ `CLOSED`              │ Incidente formalmente cerrado                  │
└───────────────────────┴────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 4. INCIDENT_TYPE (Tipos de Incidentes Operativos)                      │
├────────────────────────────────────────────────────────────────────────┤
│ `VEHICLE_BREAKDOWN`, `ACCIDENT`, `GPS_LOST`, `NETWORK_LOST`,           │
│ `PACKAGE_DAMAGED`, `BUSINESS_CLOSED`, `PACKAGE_NOT_READY`,             │
│ `CUSTOMER_UNREACHABLE`, `RECIPIENT_REFUSED`, `ADDRESS_PROBLEM`,        │
│ `PAYMENT_PROBLEM`, `CASH_MISMATCH`, `SAFETY_ISSUE`, `OTHER`.           │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 5. OFFER_STATUS (Oferta de Viaje emitida por Dispatch)                 │
├─────────────────┬──────────────────────────────────────────────────────┤
│ `OPEN`          │ Oferta emitida y vigente                             │
│ `ACCEPTED`      │ Oferta aceptada por el conductor                     │
│ `REJECTED`      │ Oferta rechazada explícitamente por el conductor     │
│ `EXPIRED`       │ Oferta expirada tras 15 segundos sin respuesta       │
│ `CANCELED`      │ Oferta cancelada porque otra oferta ganó o expiró    │
└─────────────────┴──────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 6. DRIVER_VERIFICATION_STATUS | 7. DRIVER_ACCOUNT_STATUS               │
├─────────────────────────────────┬──────────────────────────────────────┤
│ `PENDING`, `UNDER_REVIEW`,      │ `REGISTERED`, `ACTIVE`, `SUSPENDED`, │
│ `VERIFIED`, `REJECTED`, `EXPIRED│ `BLOCKED`, `CLOSED`.                 │
└─────────────────────────────────┴──────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 8. DRIVER_OPERATIONAL_STATE (Presencia Geoespacial)                    │
├────────────────────────────────────────────────────────────────────────┤
│ `OFFLINE`, `AVAILABLE`, `OFFERED`, `BUSY`, `PAUSED`.                   │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 9. BUSINESS_VERIFICATION_STATUS | 10. BUSINESS_ACCOUNT_STATUS          │
├─────────────────────────────────┬──────────────────────────────────────┤
│ `NOT_REQUIRED`, `PENDING`,      │ `ACTIVE`, `SUSPENDED`, `BLOCKED`,    │
│ `UNDER_REVIEW`, `VERIFIED`,     │ `CLOSED`.                            │
│ `REJECTED`.                     │                                      │
└─────────────────────────────────┴──────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 11. BUSINESS_MEMBER_ROLE | 12. PLATFORM_ROLE                           │
├──────────────────────────┬─────────────────────────────────────────────┤
│ `business_owner`,        │ `super_admin`, `admin`, `operator`,         │
│ `business_manager`,      │ `verification_agent`, `none`.               │
│ `business_employee`.     │                                             │
└──────────────────────────┴─────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 13. PRICING_ADJUSTMENT_TYPE (Estandarizado)                            │
├────────────────────────────────────────────────────────────────────────┤
│ `WAITING_FEE`, `RETURN_FEE`, `CANCEL_FEE`, `DISCOUNT`, `SUBSIDY`,      │
│ `MANUAL_ADJUSTMENT`.                                                   │
└────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────┐
│ 14. EVENT_TYPE (Nombres Completos Canónicos)                           │
├────────────────────────────────────────────────────────────────────────┤
│ `DELIVERY_CREATED`, `SEARCH_STARTED`, `OFFER_CREATED`, `OFFER_ACCEPTED`,│
│ `DRIVER_ASSIGNED`, `TO_PICKUP_STARTED`, `ARRIVED_PICKUP`,              │
│ `CUSTODY_TRANSFERRED`, `TO_DROPOFF_STARTED`, `ARRIVED_DROPOFF`,        │
│ `OTP_VERIFIED`, `DELIVERY_COMPLETED`, `RETURN_REQUIRED`,               │
│ `RETURN_STARTED`, `RETURN_COMPLETED`, `HANDOFF_STARTED`,               │
│ `HANDOFF_COMPLETED`, `INCIDENT_OPENED`, `INCIDENT_RESOLVED`,           │
│ `DRIVER_UNASSIGNED`, `DELIVERY_CANCELED`, `DELIVERY_FAILED`,           │
│ `QUOTE_CALCULATED`, `QUOTE_CONSUMED`, `QUOTE_EXPIRED`, `QUOTE_CANCELED`,│
│ `OFFER_EXPIRED`, `OFFER_REJECTED`, `OFFER_CANCELED`,                   │
│ `SEARCH_EXPANDED`, `MAPS_FALLBACK_USED`, `WAITING_STARTED`,            │
│ `OTP_ATTEMPT_FAILED`, `OTP_LOCKED`, `PAYMENT_FAILED`,                  │
│ `DRIVER_SUSPENDED`, `BUSINESS_SUSPENDED`, `RETURN_AUTHORIZED`,         │
│ `CUSTODY_RETURNED`, `HANDOFF_ABORTED`.                                 │
└────────────────────────────────────────────────────────────────────────┘
```
