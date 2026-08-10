# 15 — CATÁLOGO DE CASOS LÍMITE Y MANEJO DE ERRORES (ERROR & EDGE CASES)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Resiliencia, Casos Límite Operativos, Manejo de Fallas y Protocolos de Mitigación  

---

## 1. Filosofía de Resiliencia

Los sistemas de entrega en el mundo real están expuestos a imprevistos físicos y de conectividad (baterías agotadas, pérdida de señal en zonas oscuras, doble click por impaciencia, negocios cerrados, clientes que no responden).

Güegüense contempla desde la arquitectura cada caso límite con un **protocolo de mitigación explícito** para evitar bloqueos del sistema o pérdidas financieras.

---

## 2. Catálogo Detallado de Casos Límite y Protocolos

### 2.1 Dominio: Despacho y Asignación

#### Caso 1: No hay motorizados disponibles cerca
* **Síntoma:** El negocio presiona "Solicitar" pero no hay conductores en el radio de $3.0 \text{ km}$.
* **Protocolo:**
  1. El Dispatch Engine activa de inmediato la **Ronda 2 (Expansión a 5.0 km)**.
  2. Si tras 60 segundos sigue sin encontrar motorizado, la app del negocio despliega: *"Buscando en un área más amplia (ETA estimado +5 min)..."*.
  3. Si tras 3 rondas (2 min) nadie acepta, la solicitud pasa a estado de espera y alerta al panel Admin/Operator para llamada directa. El negocio puede cancelar libremente sin cobro.

#### Caso 2: Oferta expira sin respuesta (Timer 15s)
* **Síntoma:** El motorizado recibe la notificación sonora pero no presiona Aceptar ni Rechazar.
* **Protocolo:**
  1. Transcurridos los 15 segundos, la oferta cambia a `EXPIRED`.
  2. Se cierra la pantalla modal en la app del motorizado sin penalización monetaria, pero reduciendo temporalmente su score de prioridad por inactividad.
  3. El Dispatch Engine emite la oferta inmediatamente al segundo mejor candidato.

#### Caso 3: Asignación Simultánea (Race Condition de dos clicks)
* **Síntoma:** Dos conductores presionan ACEPTAR al mismo tiempo.
* **Protocolo:**
  1. La función PL/pgSQL `accept_delivery_offer` ejecuta `FOR UPDATE` en PostgreSQL (Ver `08_DISPATCH_ENGINE.md`).
  2. El primer conductor recibe `200 OK` con asignación exitosa.
  3. El segundo conductor recibe un diálogo amigable `409 Conflict`: *"¡Ups! Otro conductor acaba de aceptar esta entrega. Mantente disponible para la siguiente."*

---

### 2.2 Dominio: Operación en Ruta y Hardware

#### Caso 4: Pérdida de conexión a Internet o Batería Agotada del Motorizado
* **Síntoma:** El conductor está en ruta `TO_DROPOFF` y su teléfono se apaga o pierde señal 4G.
* **Protocolo:**
  1. El backend detecta la ausencia de pings GPS por más de 2 minutos y cambia el estado visual en Admin a `UNAVAILABLE` (Alerta Naranja).
  2. La app del conductor guarda localmente en `AsyncStorage / SQLite` los eventos de ruta con timestamp.
  3. Al reconectarse la red, la app reenvía automáticamente en lote (*Batch Flush*) los pings retenidos con encabezado de idempotencia.

#### Caso 5: Negocio Cerrado o Pedido No Preparado
* **Síntoma:** El motorizado llega a la sucursal (`ARRIVED_PICKUP`) y el local está cerrado o la comida tardará 45 minutos.
* **Protocolo:**
  1. El motorizado presiona "Reportar Problema" -> *Negocio Cerrado / Demora Excesiva*.
  2. Se requiere tomar una foto de evidencia de la fachada cerrada.
  3. El operador revisa la foto en Admin. Al cancelar la entrega, el sistema acredita una tarifa de desplazamiento mínimo (ej: C$ 25.00) al motorizado, cargada a la cuenta del negocio por información incorrecta.

#### Caso 6: Cliente No Responde en el Domicilio
* **Síntoma:** El motorizado llega al destino (`ARRIVED_DROPOFF`), llama por teléfono al cliente y no obtiene respuesta.
* **Protocolo:**
  1. La app inicia un temporizador visible de **10 minutos de gracia**.
  2. El sistema envía una notificación Push y SMS de alta prioridad al cliente: *"Tu motorizado está afuera. Por favor recíbelo para evitar la cancelación del pedido."*
  3. Transcurridos los 10 minutos, se habilita el botón **"DECLARAR CLIENTE AUSENTE"**. La entrega pasa a `FAILED` y se le indica al motorizado devolver el paquete a la sucursal origen, cobrando tarifa de retorno.

---

### 2.3 Dominio: Entrega y Confirmación con PIN

#### Caso 7: PIN Ingresado Incorrectamente
* **Síntoma:** El motorizado digita el código otorgado por el cliente y no coincide con el backend.
* **Protocolo:**
  1. La API retorna error `PIN_INVALID`.
  2. La app permite hasta **3 intentos fallidos**.
  3. Al tercer intento fallido, el campo se bloquea temporalmente por 2 minutos para evitar ataques de fuerza bruta y se ofrece el botón: *"Llamar a Soporte para Validación Manual"*.

#### Caso 8: Cliente Rechaza el Paquete (Producto Dañado)
* **Síntoma:** El recipiente del paquete llega abierto o roto durante el trayecto.
* **Protocolo:**
  1. El motorizado o cliente reportan la falla en el momento de la entrega.
  2. La entrega pasa al estado `DISPUTED`.
  3. Se congela el cobro en el Ledger y se abre un ticket de soporte inmediato para arbitraje administrativo con fotos del paquete.

---

### 2.4 Dominio: Webhooks y Red

#### Caso 9: Webhook o Request Duplicado
* **Síntoma:** Un problema de latencia de red hace que el cliente re-envíe la misma petición `POST /api/v1/deliveries`.
* **Protocolo:**
  1. El backend verifica el encabezado `Idempotency-Key`.
  2. Si la clave ya existe en Redis/PostgreSQL dentro de las últimas 24 horas, no procesa la creación de nuevo ni genera un segundo cobro; retorna la misma respuesta almacenada en la primera llamada.
