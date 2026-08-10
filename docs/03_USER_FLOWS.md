# 03 — FLUJOS DE USUARIO (USER FLOWS)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Diagramación de Interacciones y Experiencia de Usuario (UX Flows)  

---

## 1. Flujos del Negocio (Business Flows)

```text
┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│   Registro /   │───►│  Configuración │───►│ Nueva Solicitud│───►│ Cotización en  │
│ Autenticación  │    │  de Sucursal   │    │  de Delivery   │    │  Tiempo Real   │
└────────────────┘    └────────────────┘    └────────────────┘    └───────┬────────┘
                                                                          │
┌────────────────┐    ┌────────────────┐    ┌────────────────┐            │
│ Entrega PIN &  │◄───│ Tracking de    │◄───│  Asignación de │◄───────────┘
│ Confirmación   │    │ Conductor      │    │  Motorizado    │
└────────────────┘    └────────────────┘    └────────────────┘
```

### 1.1 Flujo de Registro y Verificación de Empresa
1. **Inicio:** El propietario descarga Güegüense Negocios o ingresa a la app móvil.
2. **Autenticación:** Registra su número de teléfono / correo con código OTP de verificación.
3. **Perfil Comercial:** Completa nombre comercial, RUC/Identificación fiscal (opcional), teléfono corporativo y logo.
4. **Estado:** La cuenta pasa a estado `PENDING_VERIFICATION`. Tras validación automatizada o administrativa, cambia a `ACTIVE`.

### 1.2 Flujo de Creación de Solicitud "Solo Delivery" (Modalidad A - Enviando en < 1 min)
1. **Punto de Recogida:** Selecciona la sucursal activa (por defecto la ubicación GPS actual o dirección pre-configurada).
2. **Datos del Destinatario:** Ingresa nombre del cliente, teléfono, dirección textual y ubica el pin exacto en el mapa (autocompletado por Google Maps).
3. **Detalles del Paquete:** Selecciona categoría (Comida, Farmacia, Documentos, Paquete, Regalo) e indica si requiere cuidado especial.
4. **Parámetros de Cobro:**
   * *Opcion 1:* Delivery prepagado por el negocio (Cobro $0 al cliente).
   * *Opción 2:* Cobrar valor de mercadería + delivery en efectivo al cliente.
5. **Cotización:** El backend calcula y despliega inmediatamente: Distancia (km), ETA estimado (min) y Precio total del envío.
6. **Confirmación:** El negocio presiona **"SOLICITAR MOTORIZADO"**. La solicitud entra a la máquina de estados en `SEARCHING_DRIVER`.
7. **Monitoreo:** La app muestra un mapa interactivo con la aproximación del motorizado asignado, su foto y placa.

---

## 2. Flujos del Motorizado (Driver Flows)

```text
┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│ Registro / Subir│───►│ Verificación   │───►│ Conectarse     │───►│ Recibir Oferta │
│  Documentos    │    │ Administrativa │    │ ("AVAILABLE")  │    │  (Timer 15s)   │
└────────────────┘    └────────────────┘    └────────────────┘    └───────┬────────┘
                                                                          │
┌────────────────┐    ┌────────────────┐    ┌────────────────┐            │
│ Validar PIN &  │◄───│ Navegar al     │◄───│ Confirmar      │◄───────────┘
│ Completar Viaje│    │ Cliente Final  │    │ Recogida       │
└────────────────┘    └────────────────┘    └────────────────┘
```

### 2.1 Flujo de Onboarding y Verificación Documental
1. **Registro:** El conductor instala Güegüense Driver, autentica su número móvil con OTP e ingresa datos personales.
2. **Carga de Documentación Sensible:** Captura y sube mediante la cámara:
   * Foto de Cédula de Identidad (frente y reverso).
   * Foto de Licencia de Conducir vigente.
   * Circulación / Matrícula de la motocicleta.
   * Datos del vehículo (Marca, Modelo, Placa, Color, Foto de la moto).
3. **Revisión:** El perfil queda en estado `UNDER_REVIEW`. El agente de verificación audita las fotos en Admin. Al ser aprobado, el estado pasa a `VERIFIED`.

### 2.2 Flujo de Recepción y Ejecución de Delivery
1. **Ponerse Disponible:** El motorizado activa el switch principal **"ESTOY DISPONIBLE"**. Su presencia cambia a `AVAILABLE` y comienza a transmitir GPS.
2. **Oferta Entrante:** Suena un tono de alta prioridad. Aparece la tarjeta modal con:
   * Nombre del negocio y distancia a la sucursal.
   * Zona de entrega y distancia total.
   * **Ganancia neta del motorizado** destacada.
   * Cuenta regresiva visual (15 segundos).
3. **Aceptación:** Presiona **"ACEPTAR SERVICIO"**. El backend procesa la asignación atómica. Si la gana, el estado del viaje cambia a `DRIVER_ASSIGNED`.
4. **Navegación a Sucursal:** Presiona "NAVEGAR A SUCURSAL" (abre Google Maps / Waze). Al llegar, presiona **"LLEGUÉ AL NEGOCIO"** (`ARRIVED_PICKUP`).
5. **Recogida:** Muestra la referencia al comercio, verifica el paquete y presiona **"PEDIDO RECOGIDO"** (`PICKED_UP`).
6. **Navegación al Cliente:** La app cambia automáticamente la ruta hacia el destino (`TO_DROPOFF`). Al arribar, presiona **"LLEGUÉ AL DESTINO"** (`ARRIVED_DROPOFF`).
7. **Confirmación con PIN:** Solicita el PIN de 4 dígitos al cliente final, lo digita en la app. El backend valida el código.
8. **Finalización:** La entrega pasa a `DELIVERED`, se acredita la ganancia en su saldo y la app queda disponible para la siguiente oferta.

---

## 3. Flujo del Cliente Final (Customer Tracking Flow)

1. **Recepción del Enlace:** Al ser recogido el paquete, el cliente recibe un mensaje SMS/WhatsApp con el enlace de tracking (ej: `https://gueguense.app/t/sec-token-123`).
2. **Acceso Web Instantáneo:** Abre la web en su navegador móvil (sin instalar nada).
3. **Visualización en Vivo:**
   * Mapa interactivo mostrando el icono del motorizado avanzando hacia su casa.
   * Nombre de la tienda emisora.
   * Nombre, foto y calificación del motorizado verificado.
   * Tiempo Estimado de Llegada (ETA dinámico).
   * **PIN de Entrega:** Muestra de forma destacada su código de 4 dígitos (ej: `4829`) que deberá dictar al motorizado.
4. **Cierre de Entrega:** Al validar el PIN, la pantalla se actualiza automáticamente a "¡Pedido Entregado con Éxito!". El token web expira.

---

## 4. Flujos Administrativos (Admin & Incidencias Flow)

### 4.1 Flujo de Verificación de Conductor por Agente
1. El agente ingresa a `/admin/verifications`.
2. Selecciona un candidato en la cola `UNDER_REVIEW`.
3. Inspecciona las imágenes privadas en el visor seguro (URLs firmadas de 15 min).
4. Si los documentos coinciden y están vigentes, presiona **"APROBAR MOTORIZADO"**. Se envía una notificación push de bienvenida al conductor.

### 4.2 Flujo de Manejo de Incidencias Operativas (Reasignación de Emergencia)
1. **Disparo:** El motorizado presiona "Reportar Problema" -> *Avería Mecánica / Accidente*.
2. **Alerta Admin:** En el panel de operaciones (`/admin/dispatch`) salta una alerta roja. La entrega pasa a `DISPUTED` / `PAUSED`.
3. **Intervención del Operador:** El operador llama al motorizado para confirmar su estado de salud y la integridad del paquete.
4. **Acción de Reasignación:** El operador selecciona "Reasignar Conductor". El sistema libera la entrega, busca al motorizado verificado más cercano y le envía la oferta directa para completar el trayecto.
