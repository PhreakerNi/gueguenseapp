# 13 — SISTEMA DE NOTIFICACIONES Y EVENTOS (NOTIFICATIONS ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Notificaciones Push, SMS, WhatsApp y Canales In-App  

---

## 1. Arquitectura de Eventos y Broadcast

Güegüense implementa una arquitectura basada en eventos (**Event-Driven Architecture**). Cada cambio de estado de la entrega dispara notificaciones dirigidas a los diferentes actores a través de múltiples canales según la prioridad operativa.

```text
 ┌───────────────────────────┐
 │ Evento en Base de Datos   │ Ejemplo: Status cambia a ARRIVED_PICKUP.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Notification Dispatcher   │ Evalúa reglas y destinatarios por rol.
 └───────┬───────────────┬───┘
         │               │
         ▼               ▼
┌──────────────────┐  ┌──────────────────┐
│ Push Notification│  │ SMS / WhatsApp   │
│ (FCM / Expo APNs)│  │ (Twilio / Webhook│
└──────────────────┘  └──────────────────┘
```

---

## 2. Matriz de Eventos y Destinatarios

| Evento del Sistema | Destinatario | Canal Principal | Canal Secundario | Prioridad | Mensaje / Payload Ejemplo |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`NEW_DISPATCH_OFFER`** | Motorizado | Push Notification | Tono Sonoro Nativo | **MÁXIMA (High)** | *"¡Nueva oferta de entrega cerca de ti! Ganancia: C$ 65.00. Toca para aceptar."* |
| **`DRIVER_ASSIGNED`** | Negocio | In-App Realtime | Push Notification | **ALTA** | *"Motorizado verificado asignado. Juan Pérez viene en camino a tu sucursal."* |
| **`ARRIVED_PICKUP`** | Negocio | In-App Realtime | Push Notification | **ALTA** | *"El motorizado ha llegado a tu local. Ten listo el pedido."* |
| **`PICKED_UP`** | Cliente Final | SMS / WhatsApp | Link Tracking Web | **ALTA** | *"Tu pedido de Farmacia La Buena Salud va en camino. Síguelo aquí: https://gueguense.app/t/sec123"* |
| **`ARRIVED_DROPOFF`** | Cliente Final | SMS / WhatsApp | Web Notice | **ALTA** | *"Tu motorizado está afuera de tu casa. Ten a mano tu PIN de entrega: 4829"* |
| **`DELIVERY_COMPLETED`**| Negocio & Driver| In-App Realtime | Push Notification | **MEDIA** | *"Entrega completada con éxito. PIN verificado."* |
| **`INCIDENT_REPORTED`** | Admin / Operator| Panel Realtime | Alerta Sonora Admin | **MÁXIMA** | *"ALERTA: Motorizado reportó avería mecánica en entrega #1092. Se requiere intervención."* |
| **`ACCOUNT_VERIFIED`** | Motorizado | Push Notification | Email | **MEDIA** | *"¡Felicidades! Tu cuenta ha sido verificada. Ya puedes conectarte y ganar."* |

---

## 3. Especificación de Canales Técnicos

1. **Push Notifications (FCM / Expo Push API):**
   * Canales de notificación Android con prioridad alta (`importance: max`) para despertar el dispositivo en modo ahorro de energía cuando llega una oferta de viaje.
2. **WebSockets In-App (Supabase Realtime):**
   * Utilizado cuando las aplicaciones del negocio o del conductor están abiertas en primer plano para actualización instantánea sin consumo de saldo SMS.
3. **SMS / WhatsApp Gateway:**
   * Utilizado exclusivamente para el cliente final que no posee la app instalada, enviando el enlace de tracking web seguro al recoger el paquete.
