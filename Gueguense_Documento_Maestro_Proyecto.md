# GÜEGÜENSE — Documento Maestro del Proyecto

**Versión:** 1.0  
**Tipo de documento:** Product Vision + Functional Specification + Technical Blueprint  
**Objetivo:** Servir como contexto maestro para una IA de desarrollo antes de comenzar a programar.

---

# 1. Resumen ejecutivo

**Güegüense** será una plataforma profesional de logística y delivery bajo demanda enfocada principalmente en **negocios que necesitan contratar motorizados verificados de forma rápida, segura y confiable**.

La plataforma no debe plantearse únicamente como una app tradicional para pedir comida. Su propuesta principal es convertirse en una **red de motorizados verificados bajo demanda para negocios**.

Un restaurante, farmacia, tienda, supermercado, emprendimiento, comercio electrónico o cualquier negocio podrá abrir Güegüense, indicar dónde recoger y dónde entregar, conocer el costo estimado, solicitar un motorizado y monitorear toda la entrega en tiempo real.

El negocio podrá utilizar Güegüense aunque el pedido se haya originado fuera de la plataforma, por ejemplo:

- WhatsApp.
- Llamada telefónica.
- Pedido presencial.
- Redes sociales.
- Página web propia.
- Marketplace externo.
- Sistema POS del negocio.

También podrá existir una modalidad adicional donde el negocio cargue su catálogo o menú y reciba pedidos directamente a través de Güegüense.

El producto debe comenzar priorizando la logística y posteriormente ampliar las funciones de comercio.

---

# 2. Visión del producto

La visión de Güegüense es:

> Crear una infraestructura digital de entregas que conecte negocios con motorizados verificados y disponibles en tiempo real.

La plataforma debe permitir que un negocio pase de:

**Necesito entregar algo**

a:

**Un motorizado verificado ya viene en camino**

en la menor cantidad de pasos posible.

Los pilares del producto serán:

1. Rapidez.
2. Seguridad.
3. Motorizados verificados.
4. Seguimiento en tiempo real.
5. Transparencia.
6. Facilidad de uso.
7. Control operativo.
8. Escalabilidad.
9. Trazabilidad.
10. Confianza entre negocio, motorizado y cliente.

---

# 3. Componentes principales de Güegüense

La plataforma estará compuesta inicialmente por **dos aplicaciones móviles**, un panel administrativo web y una interfaz web de tracking para clientes.

## 3.1 Güegüense Negocios

Aplicación móvil destinada a:

- Restaurantes.
- Farmacias.
- Tiendas.
- Supermercados.
- Emprendimientos.
- Comercios electrónicos.
- Empresas.
- Negocios con sucursales.
- Cualquier comercio que necesite realizar entregas.

Su función principal será permitir solicitar un motorizado bajo demanda.

---

## 3.2 Güegüense Motorizado

Aplicación móvil destinada a los trabajadores de delivery.

El motorizado podrá:

- Registrarse.
- Enviar documentos.
- Ser verificado.
- Registrar su motocicleta.
- Ponerse disponible o no disponible.
- Recibir solicitudes de entrega cercanas.
- Aceptar o rechazar servicios.
- Navegar hasta el negocio.
- Confirmar llegada.
- Confirmar recogida.
- Navegar al cliente.
- Completar la entrega.
- Consultar ganancias.
- Consultar historial.
- Consultar calificaciones.
- Contactar soporte.

El concepto ya establecido para esta aplicación es:

**Abrir aplicación → ponerse disponible → recibir servicio → aceptar → recoger → entregar → cobrar.**

---

## 3.3 Güegüense Admin

Panel web utilizado exclusivamente por el equipo administrativo y operativo de Güegüense.

Permitirá controlar:

- Negocios.
- Motorizados.
- Verificaciones.
- Documentos.
- Motocicletas.
- Entregas.
- Solicitudes.
- Asignaciones.
- Tracking.
- Tarifas.
- Comisiones.
- Pagos.
- Retiros.
- Incidencias.
- Cancelaciones.
- Disputas.
- Soporte.
- Zonas.
- Promociones.
- Auditoría.
- Configuración general.

---

## 3.4 Tracking web del cliente

No será necesario crear inicialmente una tercera app para consumidores.

Cuando una entrega se encuentre en curso, el cliente podrá recibir un enlace seguro mediante WhatsApp, SMS u otro canal.

Ejemplo conceptual:

`https://gueguense.app/t/XXXXXXXX`

Desde esa página podrá visualizar:

- Estado de la entrega.
- Nombre del negocio.
- Nombre del motorizado.
- Foto del motorizado.
- Calificación.
- Ubicación aproximada/en tiempo real cuando corresponda.
- Tiempo estimado de llegada.
- Mapa.
- Estado de recogida.
- Estado de entrega.
- PIN o método de confirmación.
- Soporte.

---

# 4. Modelo de servicio

Güegüense debe soportar dos modalidades principales.

## 4.1 Modalidad A — Solo envío

Esta modalidad será la prioridad del MVP.

El negocio ya tiene un pedido y solamente necesita el servicio logístico.

Ejemplo:

1. Un cliente compra por WhatsApp.
2. El negocio prepara el pedido.
3. El negocio abre Güegüense.
4. Introduce la dirección del cliente.
5. El sistema calcula precio y tiempo estimado.
6. El negocio solicita un motorizado.
7. Güegüense encuentra un motorizado disponible.
8. El motorizado acepta.
9. El negocio monitorea su llegada.
10. El motorizado recoge.
11. El cliente recibe tracking.
12. El motorizado entrega.
13. La entrega se confirma.
14. El servicio se registra y se liquida.

El negocio **no necesita crear productos o catálogo** para utilizar esta modalidad.

---

## 4.2 Modalidad B — Catálogo / menú

Esta modalidad deberá desarrollarse después de consolidar el sistema logístico.

El negocio podrá configurar:

- Categorías.
- Productos.
- Fotografías.
- Descripciones.
- Precios.
- Variantes.
- Extras.
- Disponibilidad.
- Inventario básico.
- Productos agotados.
- Horarios.
- Promociones.

Podrá disponer de una página pública donde sus clientes hagan pedidos.

Ejemplo conceptual:

`https://gueguense.app/negocio/la-familia`

Flujo:

Cliente → realiza pedido → negocio confirma/prepara → sistema busca motorizado → recogida → entrega.

---

# 5. Tipos de usuarios

## 5.1 Administrador

Permisos globales.

Puede administrar toda la plataforma.

## 5.2 Operador

Puede monitorear operaciones activas, ayudar en entregas, gestionar incidencias y reasignaciones.

## 5.3 Personal de verificación

Puede revisar documentos de motorizados y aprobar/rechazar solicitudes.

## 5.4 Propietario del negocio

Control total de su empresa dentro de Güegüense.

## 5.5 Empleado del negocio

Puede crear y gestionar entregas según permisos.

## 5.6 Motorizado

Puede recibir y completar servicios.

## 5.7 Cliente final

No necesita cuenta obligatoria para recibir un pedido y visualizar tracking.

---

# 6. Registro de negocios

El proceso debe permitir registrar:

- Nombre comercial.
- Razón social, si aplica.
- Nombre del responsable.
- Teléfono.
- Correo.
- Dirección.
- Ubicación GPS.
- Tipo de negocio.
- Logo.
- Horarios.
- Sucursales.
- Información de facturación.
- Método de pago.
- Documentación requerida por la operación.

Estados posibles:

- Registro iniciado.
- Pendiente de verificación.
- En revisión.
- Activo.
- Rechazado.
- Suspendido.
- Bloqueado.

---

# 7. Sucursales

Un negocio podrá tener una o múltiples sucursales.

Cada sucursal debe tener:

- Nombre.
- Dirección.
- Coordenadas.
- Horario.
- Teléfono.
- Estado.
- Instrucciones de recogida.
- Personal asignado.

Al solicitar una entrega, el punto de recogida podrá seleccionarse automáticamente según la sucursal activa.

---

# 8. App Güegüense Negocios

## 8.1 Pantalla principal

Debe funcionar como un pequeño centro de operaciones logísticas.

Debe mostrar:

- Nombre del negocio o sucursal.
- Estado de operación.
- Cantidad aproximada de motorizados disponibles cercanos.
- Botón principal **Solicitar delivery**.
- Entregas activas.
- Solicitudes buscando motorizado.
- Entregas del día.
- Tiempo promedio.
- Gasto o costo del día.
- Alertas importantes.

La acción principal siempre debe ser claramente visible.

---

# 9. Crear una solicitud de delivery

El flujo debe ser rápido.

## Paso 1 — Punto de recogida

Por defecto:

- Sucursal actual.

Opcional:

- Cambiar sucursal.
- Definir otro punto autorizado.

---

## Paso 2 — Destinatario

Campos:

- Nombre.
- Teléfono.
- Dirección.
- Punto exacto en mapa.
- Referencia.
- Instrucciones.
- Coordenadas.

Debe permitir buscar dirección y ajustar un pin manualmente.

---

## Paso 3 — Información del envío

Tipos posibles:

- Comida.
- Farmacia.
- Documentos.
- Paquete.
- Compra.
- Regalo.
- Producto frágil.
- Otro.

Campos opcionales:

- Descripción.
- Peso aproximado.
- Tamaño.
- Valor declarado.
- Requiere cuidado especial.
- Imagen del paquete.

---

## Paso 4 — Cobro

Opciones:

- Pedido ya pagado.
- Cobrar al cliente.
- Negocio paga delivery.
- Cliente paga delivery.
- Pago digital.
- Pago en efectivo.

Si existe cobro en efectivo:

- Monto a cobrar.
- Monto del delivery.
- Quién debe recibir el efectivo.
- Registro de liquidación.

---

## Paso 5 — Cotización

Antes de confirmar, mostrar:

- Distancia hasta el destino.
- Distancia total estimada.
- Tiempo aproximado.
- Precio del delivery.
- Recargos, si existen.
- Total.
- Método de pago.

---

## Paso 6 — Confirmar solicitud

Botón principal:

**BUSCAR MOTORIZADO**

Al tocarlo se crea una solicitud y comienza el proceso de dispatch.

---

# 10. Motorizados disponibles cerca

El negocio podrá visualizar motorizados disponibles en el área de manera informativa.

Sin embargo, la asignación no deberá realizarse únicamente por distancia en línea recta.

El motor de dispatch debe considerar:

- Disponibilidad real.
- Estado de verificación.
- Estado de cuenta.
- Ubicación GPS reciente.
- Tiempo estimado de llegada.
- Distancia hasta recogida.
- Zona.
- Tipo de vehículo.
- Capacidad.
- Entregas actuales.
- Tasa de aceptación.
- Tasa de finalización.
- Calificación.
- Historial de cancelaciones.
- Distribución justa de oportunidades.
- Reglas configuradas por administración.

---

# 11. Motor de asignación / Dispatch Engine

Esta será una de las piezas más importantes del sistema.

## Flujo conceptual

1. Negocio crea entrega.
2. Backend valida información.
3. Motor calcula precio.
4. Se crea solicitud.
5. Sistema identifica candidatos.
6. Candidatos son clasificados.
7. Se envía oferta a uno o varios según estrategia.
8. El motorizado recibe una cuenta regresiva.
9. Puede aceptar o rechazar.
10. La primera aceptación válida se procesa de forma atómica.
11. La entrega queda asignada a un único motorizado.
12. Las demás ofertas se cancelan.
13. El negocio recibe confirmación.
14. Comienza navegación hacia recogida.

---

## 11.1 Tiempo de aceptación

El documento inicial contempla un tiempo limitado, por ejemplo **15 segundos**.

Este valor debe ser configurable desde administración.

---

## 11.2 Si nadie acepta

El sistema podrá:

1. Aumentar radio.
2. Contactar siguiente grupo.
3. Ajustar estrategia.
4. Aumentar incentivo si las reglas lo permiten.
5. Mantener informado al negocio.
6. Permitir cancelación.
7. Escalar a un operador.

---

## 11.3 Regla crítica

**Una entrega nunca puede tener dos motorizados asignados simultáneamente.**

La aceptación debe resolverse mediante una operación transaccional o mecanismo equivalente de exclusión/locking.

---

# 12. Registro del motorizado

El motorizado debe poder registrarse desde su aplicación.

Información:

- Nombre completo.
- Número telefónico.
- Correo.
- Fecha de nacimiento cuando sea legal y operativamente necesario.
- Fotografía.
- Dirección general.
- Contacto de emergencia cuando se defina.
- Documento de identidad.
- Licencia/documentación aplicable.
- Información de motocicleta.
- Marca.
- Modelo.
- Año.
- Color.
- Placa.
- Fotografías de la motocicleta.
- Otros documentos exigidos.

Los requisitos legales exactos deben configurarse según el país y operación.

---

# 13. Estados del motorizado

Estados de cuenta:

- REGISTERED.
- PENDING_VERIFICATION.
- UNDER_REVIEW.
- VERIFIED.
- ACTIVE.
- SUSPENDED.
- REJECTED.
- BLOCKED.

Estados operativos:

- OFFLINE.
- AVAILABLE.
- OFFERED.
- ASSIGNED.
- TO_PICKUP.
- WAITING_PICKUP.
- DELIVERING.
- PAUSED.

---

# 14. Verificación

La verificación es uno de los principales elementos diferenciadores.

El negocio debe poder visualizar indicadores como:

- Identidad verificada.
- Vehículo verificado.
- Documentación verificada.
- Calificación.
- Número de entregas.
- Porcentaje de finalización.

Los documentos privados **no deben mostrarse al negocio**.

Solo personal administrativo autorizado podrá acceder a ellos.

---

# 15. Inicio del motorizado

La pantalla principal debe ser extremadamente sencilla.

Información principal:

- Foto.
- Nombre.
- Calificación.
- Estado.
- Botón/toggle de disponibilidad.
- Ganancias del día.
- Entregas del día.
- Tiempo conectado.

Acciones secundarias:

- Entregas.
- Ganancias.
- Soporte.
- Cuenta.

La disponibilidad debe dominar visualmente la pantalla.

---

# 16. Disponibilidad

Control principal:

**ESTOY DISPONIBLE**

Cuando se activa:

- Se valida que la cuenta esté habilitada.
- Se valida documentación vigente si corresponde.
- Se activa ubicación.
- Se actualiza presencia.
- Puede comenzar a recibir servicios cercanos.

Cuando se desactiva:

- No recibe nuevas ofertas.
- Si existe una entrega activa, no debe afectar su finalización.

---

# 17. Nueva solicitud para el motorizado

La tarjeta de solicitud debe responder inmediatamente:

1. ¿Dónde recojo?
2. ¿Dónde entrego?
3. ¿Cuánto recorreré?
4. ¿Cuánto ganaré?

Mostrar:

- Nombre del negocio.
- Distancia hasta recogida.
- Área del destino.
- Distancia estimada.
- Tiempo estimado.
- Tipo de paquete.
- Cobro en destino, si aplica.
- Ganancia del motorizado.
- Cuenta regresiva.

Acciones:

**RECHAZAR**  
**ACEPTAR**

La ganancia no debe ocultarse.

---

# 18. Flujo operativo del motorizado

## Estado 1 — Solicitud aceptada

Mostrar:

- Negocio.
- Dirección.
- Navegación.
- ETA.
- Información necesaria.

Acción principal:

**NAVEGAR AL NEGOCIO**

---

## Estado 2 — En camino al negocio

Mapa predominante.

Mostrar:

- Ruta.
- Distancia restante.
- Tiempo estimado.
- Nombre del negocio.

Acción:

**LLEGUÉ AL NEGOCIO**

---

## Estado 3 — Esperando recogida

Mostrar:

- Datos del pedido.
- Código o referencia.
- Tiempo de espera.
- Contacto con negocio.
- Reportar problema.

Acción:

**PEDIDO RECOGIDO**

Podrá requerirse código de recogida.

---

## Estado 4 — Pedido recogido

El sistema cambia la ruta automáticamente al cliente.

Acción:

**NAVEGAR AL CLIENTE**

---

## Estado 5 — En camino al cliente

Mostrar:

- Mapa.
- Ruta.
- ETA.
- Información limitada del cliente.
- Instrucciones de entrega.
- Contacto protegido.

Acción:

**LLEGUÉ AL DESTINO**

---

## Estado 6 — Confirmación de entrega

Métodos disponibles:

- PIN.
- Fotografía.
- Firma.
- Código QR.
- Confirmación manual autorizada.
- Otro método configurable.

Método recomendado por defecto:

**PIN**

---

## Estado 7 — Entrega completada

Mostrar:

- Confirmación.
- Pago por el servicio.
- Ganancia.
- Tiempo.
- Distancia.
- Resumen.
- Opción de calificación cuando corresponda.

El servicio pasa al historial.

---

# 19. Máquina de estados de delivery

La máquina de estados debe definirse centralmente y no inventarse de forma independiente en cada interfaz.

Estados principales:

```text
DRAFT
↓
QUOTED
↓
SEARCHING_DRIVER
↓
DRIVER_ASSIGNED
↓
TO_PICKUP
↓
ARRIVED_PICKUP
↓
PICKED_UP
↓
TO_DROPOFF
↓
ARRIVED_DROPOFF
↓
DELIVERED
```

Estados alternativos:

```text
CANCELED
FAILED
DISPUTED
```

Para pedidos originados desde catálogo:

```text
ORDER_CREATED
↓
ORDER_CONFIRMED
↓
PREPARING
↓
READY_FOR_PICKUP
↓
SEARCHING_DRIVER
```

Cada transición debe ser validada por backend.

---

# 20. Eventos de una entrega

Toda acción importante debe generar un evento inmutable.

Ejemplo:

```text
13:42 DELIVERY_CREATED
13:42 QUOTE_CONFIRMED
13:42 SEARCH_STARTED
13:43 DRIVER_OFFERED
13:43 DRIVER_ACCEPTED
13:47 ARRIVED_PICKUP
13:50 PICKED_UP
14:05 ARRIVED_DROPOFF
14:06 DELIVERY_VERIFIED
14:06 DELIVERED
```

Cada evento debe guardar cuando corresponda:

- ID.
- Delivery ID.
- Usuario.
- Rol.
- Fecha.
- Hora.
- Ubicación.
- Datos adicionales.
- IP/contexto si aplica.
- Dispositivo si aplica.

---

# 21. Tracking en tiempo real

Durante una entrega activa:

**Motorizado → Backend → Negocio / Cliente / Admin**

La aplicación del motorizado envía actualizaciones periódicas.

El backend guarda y distribuye las necesarias.

Mostrar:

- Motorizado.
- Negocio.
- Cliente/destino.
- Ruta.
- ETA.
- Distancia.
- Estado.

---

# 22. Estado de ubicación

Nunca debe fingirse una ubicación actual cuando los datos estén desactualizados.

Guardar:

- Latitude.
- Longitude.
- Accuracy.
- Heading.
- Speed cuando esté disponible.
- Timestamp.
- Source.
- Battery cuando sea útil y permitido.

Estados visuales:

- GPS actualizado.
- Última ubicación hace X segundos.
- Señal débil.
- Ubicación temporalmente perdida.

---

# 23. Privacidad de ubicación

El sistema deberá establecer reglas claras.

Ejemplo:

- Negocio puede ver al motorizado después de asignación.
- Cliente puede verlo cuando la entrega sea relevante para su trayecto.
- Administradores autorizados pueden monitorear operaciones activas.
- No mostrar historial completo innecesario.
- No exponer ubicaciones fuera del contexto operativo.
- Aplicar retención de datos configurada.

---

# 24. Navegación y mapas

La plataforma requerirá:

- Geocodificación.
- Autocomplete de direcciones.
- Selección mediante mapa.
- Cálculo de distancia.
- ETA.
- Rutas.
- Navegación.
- Posición en tiempo real.
- Zonas geográficas.
- Geofencing opcional.
- Detección de llegada aproximada.

El sistema debe abstraer el proveedor de mapas en la medida de lo posible para evitar acoplamiento innecesario.

---

# 25. Motor de precios

Nunca se debe dejar el cálculo oficial del precio solamente en la aplicación cliente.

El backend debe ser la fuente de verdad.

Modelo conceptual:

```text
tarifa_base
+ distancia
+ tiempo
+ zona
+ espera
+ tamaño/peso
+ condiciones especiales
+ demanda
+ recargos
- promociones
= precio_final
```

Los componentes deben ser configurables.

---

# 26. Separación financiera

Deben existir tres conceptos separados:

1. Precio que paga el negocio o cliente.
2. Ganancia del motorizado.
3. Ingreso/comisión de Güegüense.

Nunca mezclar los tres en un único campo.

---

# 27. Ganancias del motorizado

La app deberá mostrar:

- Ganancias de hoy.
- Ganancias semanales.
- Ganancias mensuales.
- Entregas.
- Promedio por entrega.
- Bonificaciones.
- Ajustes.
- Retiros.
- Saldo disponible.
- Saldo pendiente.
- Historial.

---

# 28. Ledger financiero

No manejar el dinero únicamente recalculando totales desde las entregas.

Crear un ledger.

Ejemplo:

```text
+ C$52   DELIVERY_EARNING
+ C$65   DELIVERY_EARNING
+ C$15   BONUS
- C$500  PAYOUT
- C$20   ADJUSTMENT
```

Cada movimiento deberá almacenar:

- ID.
- Cuenta.
- Tipo.
- Monto.
- Moneda.
- Referencia.
- Estado.
- Fecha.
- Actor.
- Metadata.

---

# 29. Efectivo

Si el motorizado cobra efectivo al cliente, debe existir control del dinero.

Registrar:

- Monto del pedido.
- Monto del delivery.
- Monto esperado.
- Monto recibido.
- A quién pertenece el efectivo.
- Balance pendiente con el negocio/plataforma.
- Liquidación.
- Diferencias.
- Incidencias.

Nunca tratar efectivo y ganancias como el mismo concepto.

---

# 30. Pagos y retiros

La arquitectura debe permitir integrar proveedores de pago sin acoplar todo el sistema a uno solo.

Crear una capa de pagos.

Estados posibles:

- PENDING.
- AUTHORIZED.
- PAID.
- FAILED.
- REFUNDED.
- PARTIALLY_REFUNDED.
- CANCELED.

Retiros:

- REQUESTED.
- UNDER_REVIEW.
- APPROVED.
- PROCESSING.
- PAID.
- REJECTED.
- FAILED.

---

# 31. Entregas programadas

Aunque no sea requisito del primer MVP, la arquitectura debe permitir:

- Entrega inmediata.
- Entrega programada.
- Franja horaria.
- Reserva futura.

---

# 32. Múltiples paradas

Diseñar la arquitectura para que posteriormente puedan existir:

- Un origen → varios destinos.
- Varios orígenes → un destino.
- Rutas empresariales.
- Entregas por lote.

No es necesario implementar esta función en el MVP inicial.

---

# 33. Historial del negocio

Mostrar:

- Entregas activas.
- Completadas.
- Canceladas.
- Fallidas.
- En disputa.

Filtros:

- Fecha.
- Sucursal.
- Motorizado.
- Estado.
- Cliente.
- Código de pedido.

---

# 34. Detalle de entrega

Debe incluir:

- Número de entrega.
- Estado.
- Negocio.
- Sucursal.
- Cliente.
- Motorizado.
- Origen.
- Destino.
- Ruta.
- Fechas.
- Precio.
- Ganancia.
- Método de pago.
- Eventos.
- Confirmación de entrega.
- Incidencias.
- Soporte.

---

# 35. Calificaciones

Después de una entrega puede existir valoración mutua.

Negocio puede valorar al motorizado.

Opcionalmente el motorizado puede reportar experiencia/incidencias.

Categorías:

- Puntualidad.
- Cuidado.
- Profesionalismo.
- Comunicación.

No permitir abuso del sistema de calificaciones.

---

# 36. Cancelaciones

Crear reglas según estado.

Ejemplos:

### Antes de asignar

Cancelación generalmente simple.

### Después de asignar

Puede existir cargo según reglas.

### Después de llegar al negocio

Puede existir tarifa de desplazamiento/espera.

### Después de recoger

No permitir cancelación normal; debe pasar a flujo de incidencia/devolución.

Todas las reglas deberán ser configurables.

---

# 37. Tiempo de espera

Registrar:

- Hora de llegada.
- Inicio de espera.
- Tiempo gratuito.
- Tiempo facturable.
- Tarifa adicional.
- Motivo.

El negocio debe visualizar el contador cuando corresponda.

---

# 38. Incidencias

Tipos:

- Negocio cerrado.
- Pedido no listo.
- Cliente no responde.
- Dirección incorrecta.
- Cliente rechazó.
- Producto dañado.
- Accidente.
- Problema mecánico.
- Problema de pago.
- Problema de GPS.
- Motorizado no llegó.
- Otro.

Cada incidencia debe generar seguimiento.

---

# 39. Soporte

Soporte deberá estar disponible para:

- Negocios.
- Motorizados.
- Operadores.

Canales potenciales:

- Chat.
- Ticket.
- Teléfono.
- WhatsApp.
- Centro de ayuda.

Cada ticket debe poder relacionarse con:

- Delivery.
- Pedido.
- Negocio.
- Motorizado.
- Pago.

---

# 40. Notificaciones

Eventos importantes deben generar notificaciones.

## Motorizado

- Nueva solicitud.
- Solicitud cancelada.
- Cambio importante.
- Pago.
- Documento por vencer.
- Cuenta aprobada.
- Cuenta suspendida.

## Negocio

- Motorizado encontrado.
- Motorizado en camino.
- Motorizado llegó.
- Pedido recogido.
- Entrega próxima.
- Entrega completada.
- Incidencia.

## Cliente

- Pedido recogido.
- Motorizado en camino.
- Motorizado próximo.
- Entrega completada.

---

# 41. Panel Admin — Dashboard

Mostrar:

- Motorizados online.
- Motorizados disponibles.
- Motorizados ocupados.
- Solicitudes buscando.
- Entregas activas.
- Entregas retrasadas.
- Incidencias.
- Cancelaciones.
- Volumen del día.
- Ingresos.
- Zonas de demanda.

Mapa principal con estados.

---

# 42. Panel Admin — Motorizados

Funciones:

- Buscar.
- Filtrar.
- Revisar perfil.
- Revisar documentos.
- Aprobar.
- Rechazar.
- Suspender.
- Reactivar.
- Ver vehículo.
- Ver calificación.
- Ver historial.
- Ver ganancias.
- Ver incidencias.
- Ver actividad.
- Agregar notas internas.

---

# 43. Panel Admin — Negocios

Funciones:

- Revisar registro.
- Activar/suspender.
- Administrar sucursales.
- Ver pedidos.
- Ver entregas.
- Ver pagos.
- Ver facturación.
- Ver incidencias.
- Configurar condiciones comerciales.
- Agregar notas internas.

---

# 44. Panel Admin — Operaciones

Vista en tiempo real.

Permitir:

- Ver entregas activas.
- Ver ruta.
- Ver última ubicación.
- Contactar partes.
- Intervenir.
- Reasignar cuando sea válido.
- Cancelar bajo permisos.
- Registrar incidencia.
- Aplicar ajustes autorizados.

---

# 45. Panel Admin — Precios

Configuración de:

- Tarifa base.
- Precio por km.
- Precio por minuto.
- Mínimo.
- Zonas.
- Horarios.
- Demanda.
- Espera.
- Peso.
- Tamaño.
- Tipo de servicio.
- Promociones.
- Comisión.
- Ganancia del conductor.

Todos los cambios deben auditarse.

---

# 46. Panel Admin — Verificación

Cola de revisión:

- Nuevos motorizados.
- Documentos vencidos.
- Documentos rechazados.
- Renovaciones.
- Cambios de vehículo.

Debe registrarse:

- Quién revisó.
- Cuándo.
- Resultado.
- Motivo.
- Observaciones.

---

# 47. Catálogo / menú

Fase posterior.

Entidades:

- Menús.
- Categorías.
- Productos.
- Variantes.
- Modificadores.
- Extras.
- Disponibilidad.
- Imágenes.
- Horarios.
- Impuestos.
- Promociones.

Los productos no pertenecen a la lógica del motorizado.

El motorizado transporta el pedido.

---

# 48. Pedido de catálogo

Estados conceptuales:

```text
ORDER_CREATED
PAYMENT_PENDING
ORDER_CONFIRMED
PREPARING
READY_FOR_PICKUP
SEARCHING_DRIVER
DRIVER_ASSIGNED
PICKED_UP
DELIVERED
CANCELED
REFUNDED
```

No confundir `order_status` con `delivery_status`.

Son dominios relacionados pero diferentes.

---

# 49. Arquitectura propuesta

Se recomienda una arquitectura modular.

Ejemplo:

```text
gueguense/
│
├── apps/
│   ├── business-mobile/
│   ├── driver-mobile/
│   └── admin-web/
│
├── packages/
│   ├── ui/
│   ├── types/
│   ├── schemas/
│   ├── validation/
│   ├── config/
│   └── domain/
│
├── backend/
│   ├── auth/
│   ├── businesses/
│   ├── drivers/
│   ├── deliveries/
│   ├── dispatch/
│   ├── pricing/
│   ├── tracking/
│   ├── notifications/
│   ├── finance/
│   ├── payments/
│   ├── support/
│   └── audit/
│
└── database/
    ├── migrations/
    ├── seeds/
    ├── policies/
    └── functions/
```

---

# 50. Stack técnico propuesto

La implementación final puede ajustarse, pero una opción adecuada para comenzar es:

## Aplicaciones móviles

- React Native.
- Expo.
- TypeScript.

## Panel web

- Next.js.
- TypeScript.

## Backend / datos

- PostgreSQL.
- Supabase.
- PostGIS.
- Realtime.
- Storage privado.
- Edge/server functions o backend dedicado según necesidades.

## Mapas

- Google Maps Platform u otro proveedor compatible.

## Notificaciones

- Push notifications.
- FCM/APNs mediante capa apropiada.

## Observabilidad

- Logs estructurados.
- Error tracking.
- Métricas.
- Alertas.

El sistema debe mantener abstracciones suficientes para poder cambiar servicios externos importantes cuando sea necesario.

---

# 51. Base de datos conceptual

Tablas/entidades principales:

```text
users
profiles

businesses
business_members
business_locations

drivers
driver_documents
vehicles
driver_presence
driver_locations

customers
customer_addresses

delivery_requests
delivery_quotes
delivery_offers
deliveries
delivery_events
delivery_tracking_points
delivery_proofs

orders
order_items

menus
categories
products
product_options

ratings

wallet_accounts
ledger_entries
payouts
payments
cash_settlements

pricing_zones
pricing_rules

notifications

support_tickets
incidents
disputes

audit_logs
```

---

# 52. Principios de modelado

1. Usar UUID u otro identificador robusto.
2. Mantener timestamps.
3. Utilizar migraciones.
4. Evitar lógica crítica únicamente en frontend.
5. Separar pedidos de entregas.
6. Separar pagos de ledger.
7. Registrar eventos.
8. Crear índices geoespaciales.
9. Aplicar constraints.
10. Utilizar estados bien definidos.
11. No depender de strings libres para estados críticos.
12. Mantener integridad referencial.

---

# 53. API / Backend

El backend será la autoridad para:

- Crear cotización.
- Crear entrega.
- Calcular precio.
- Validar negocio.
- Buscar motorizados.
- Generar ofertas.
- Asignar conductor.
- Cambiar estado.
- Confirmar recogida.
- Confirmar entrega.
- Procesar PIN.
- Registrar movimientos financieros.
- Procesar cancelaciones.
- Procesar reembolsos.
- Aplicar comisiones.
- Crear eventos.
- Generar notificaciones.
- Aplicar permisos.

---

# 54. Acciones críticas idempotentes

Deben diseñarse para evitar duplicados:

- Crear delivery.
- Aceptar delivery.
- Confirmar pickup.
- Confirmar delivery.
- Cobrar.
- Reembolsar.
- Registrar payout.
- Crear transacción financiera.

---

# 55. Seguridad

La seguridad debe implementarse desde la primera fase.

## Requisitos mínimos

- Autenticación segura.
- Roles.
- Permisos.
- Row Level Security cuando aplique.
- Validación server-side.
- Secrets únicamente en servidor.
- Tokens seguros.
- Rate limiting.
- Protección contra abuso.
- Auditoría.
- Cifrado en tránsito.
- Archivos privados.
- URLs firmadas/temporales.
- MFA para administradores.
- Gestión de sesiones.
- Revocación.
- Detección de actividad anómala.
- Sanitización.
- Validación de payloads.
- Protección de endpoints.
- Backups.
- Recuperación.
- Logs.

---

# 56. Seguridad de documentos

Los documentos de motorizados son información sensible.

Reglas:

- Bucket/almacenamiento privado.
- No URL pública permanente.
- Acceso exclusivamente autorizado.
- Auditoría de visualización cuando sea necesario.
- Políticas de retención.
- Eliminación segura.
- Separar thumbnail de documento original si se utiliza.

---

# 57. Seguridad de ubicación

- Validar timestamps.
- Rechazar ubicaciones absurdamente antiguas cuando corresponda.
- Detectar saltos imposibles.
- Registrar precisión.
- No exponer datos innecesarios.
- Controlar acceso por delivery.
- Desactivar tracking cuando termina el contexto operacional.

---

# 58. Prevención de doble asignación

Caso crítico:

Dos motorizados presionan **Aceptar** casi simultáneamente.

Resultado correcto:

- Uno recibe la asignación.
- El otro recibe "servicio ya no disponible".

Nunca:

- Dos conductores para una entrega.

Implementar mediante transacción, lock o mecanismo equivalente.

---

# 59. Recuperación de red

Las apps móviles deben funcionar correctamente ante conexiones inestables.

Necesitan:

- Retry controlado.
- Timeout.
- Estado de sincronización.
- Cache local.
- Prevención de acciones duplicadas.
- Reconexión de realtime.
- Estado offline.
- Reenvío seguro.
- Idempotency keys.

---

# 60. Casos límite obligatorios

La IA debe contemplar desde diseño:

- No hay motorizados.
- Ninguno acepta.
- Oferta expira.
- Motorizado acepta y cancela.
- Negocio cancela.
- Cliente cancela.
- Pedido no está listo.
- Negocio cerrado.
- Tiempo de espera excesivo.
- Cliente no responde.
- Dirección incorrecta.
- Cliente cambia dirección.
- GPS perdido.
- Internet perdido.
- Aplicación cerrada.
- Teléfono apagado.
- Batería baja.
- Dos motorizados aceptan simultáneamente.
- PIN incorrecto.
- Cliente rechaza paquete.
- Producto dañado.
- Problema con efectivo.
- Pago fallido.
- Disputa.
- Motorizado suspendido.
- Cuenta de negocio suspendida.
- Error del proveedor de mapas.
- Error de notificaciones.
- Reintento de webhook.
- Operación duplicada.
- Hora del dispositivo incorrecta.

---

# 61. Diseño UX/UI

La identidad visual de Güegüense debe sentirse:

- Profesional.
- Moderna.
- Robusta.
- Confiable.
- Rápida.
- Premium.
- Simple.

El concepto actual utiliza negro/grafito y naranja.

Debe conservarse como base de identidad, refinándolo.

---

# 62. Sistema de colores

## Naranja Güegüense

Usar principalmente para:

- CTA principal.
- Acciones importantes.
- Elementos de marca.
- Estado de búsqueda.

## Verde

Usar para:

- Disponible.
- Confirmado.
- Completado.
- Éxito.

## Rojo

Usar para:

- Error.
- Cancelación.
- Riesgo.
- Acción destructiva.

## Grafito / negro

Usar como identidad principal y superficies.

## Grises

Contenido secundario.

No saturar la interfaz con demasiados colores.

---

# 63. UX del motorizado

El conductor puede estar trabajando en movilidad.

Por ello:

- Botones grandes.
- Alto contraste.
- Poco texto.
- Una acción primaria por estado.
- Información importante arriba.
- Mapa predominante durante trayecto.
- Acciones siempre accesibles.
- No llenar pantalla de tarjetas innecesarias.
- Minimizar pasos.
- Confirmaciones para acciones irreversibles.
- Feedback visual/háptico cuando sea apropiado.

---

# 64. UX del negocio

Debe priorizar velocidad.

Objetivo:

**Solicitar delivery en menos de un minuto cuando la información habitual ya está guardada.**

Funciones para acelerar:

- Direcciones frecuentes.
- Clientes recientes.
- Duplicar entrega.
- Plantillas.
- Sucursal predeterminada.
- Contactos recientes.
- Autocomplete.
- Valores recordados cuando sea seguro.
- Historial rápido.

---

# 65. Navegación propuesta — Negocio

Barra inferior:

1. Inicio.
2. Entregas.
3. Solicitar.
4. Actividad/estadísticas.
5. Cuenta.

El botón Solicitar puede destacarse.

---

# 66. Navegación propuesta — Motorizado

Barra inferior:

1. Inicio.
2. Mapa.
3. Entregas.
4. Ganancias.
5. Cuenta.

Soporte accesible fácilmente.

Durante una entrega activa, la interfaz puede cambiar a un modo de operación enfocado en el mapa y estado actual.

---

# 67. Accesibilidad

- Contraste adecuado.
- Tamaños táctiles amplios.
- Tipografía legible.
- Estados no dependientes únicamente del color.
- Compatibilidad con escalado de fuente cuando sea posible.
- Mensajes claros.
- Errores accionables.

---

# 68. Observabilidad

La plataforma debe poder explicar qué ocurrió cuando algo falla.

Implementar:

- Logs estructurados.
- Request IDs.
- Delivery IDs.
- User IDs.
- Error tracking.
- Métricas.
- Logs del dispatch.
- Logs financieros.
- Logs de webhook.
- Alertas.
- Auditoría administrativa.

---

# 69. Métricas principales

## Operación

- Solicitudes creadas.
- Tiempo hasta asignación.
- Tasa de aceptación.
- Tiempo a pickup.
- Tiempo de espera.
- Tiempo a entrega.
- Distancia.
- Tasa de cancelación.
- Tasa de finalización.

## Motorizados

- Horas disponibles.
- Servicios ofrecidos.
- Aceptados.
- Rechazados.
- Cancelados.
- Completados.
- Ganancias.
- Rating.

## Negocios

- Solicitudes.
- Entregas.
- Ticket logístico promedio.
- Tiempo promedio.
- Cancelaciones.
- Frecuencia de uso.

---

# 70. Fases de desarrollo

## Fase 0 — Especificación

Antes de escribir funcionalidades:

Crear:

- PRODUCT_SPEC.md
- USER_FLOWS.md
- STATE_MACHINE.md
- ARCHITECTURE.md
- DATABASE.md
- API_CONTRACTS.md
- DISPATCH_ENGINE.md
- TRACKING.md
- FINANCE.md
- SECURITY.md
- DESIGN_SYSTEM.md
- TESTING_STRATEGY.md

---

## Fase 1 — Fundación

- Monorepo.
- Configuración.
- TypeScript.
- Auth.
- Roles.
- Base de datos.
- Migraciones.
- RLS/permisos.
- Design system.
- Logging.
- Entornos.
- CI/CD básico.

---

## Fase 2 — Motorizado

- Registro.
- Perfil.
- Documentos.
- Vehículo.
- Revisión.
- Disponibilidad.
- Ubicación.
- Estado online.
- Push notifications.

---

## Fase 3 — Negocio

- Registro.
- Perfil.
- Sucursales.
- Personal.
- Crear delivery.
- Cliente.
- Dirección.
- Cotización.

---

## Fase 4 — Dispatch

- Candidatos.
- Ranking.
- Oferta.
- Temporizador.
- Aceptar.
- Rechazar.
- Expirar.
- Asignación atómica.
- Reintentos.
- Escalamiento.

---

## Fase 5 — Operación de entrega

- Navegación a recogida.
- Llegada.
- Espera.
- Recogida.
- Navegación a cliente.
- Llegada.
- PIN.
- Evidencia.
- Completar.

---

## Fase 6 — Tracking

- Ubicación en vivo.
- ETA.
- Mapa negocio.
- Tracking cliente.
- Eventos.
- GPS stale.
- Reconexión.

---

## Fase 7 — Finanzas

- Precio.
- Ganancia.
- Comisión.
- Ledger.
- Efectivo.
- Pagos.
- Retiros.
- Ajustes.

---

## Fase 8 — Admin

- Dashboard.
- Mapa.
- Motorizados.
- Negocios.
- Verificación.
- Operaciones.
- Incidencias.
- Tarifas.
- Finanzas.
- Auditoría.

---

## Fase 9 — Catálogo

- Menús.
- Categorías.
- Productos.
- Opciones.
- Página pública.
- Carrito.
- Checkout.
- Pedido.
- Integración con delivery.

---

## Fase 10 — Funciones avanzadas

- Entregas programadas.
- Múltiples paradas.
- API para comercios.
- Webhooks empresariales.
- Integración POS.
- Integración e-commerce.
- Suscripciones.
- Planes empresariales.
- Rutas.
- Flotas.
- Analítica avanzada.

---

# 71. MVP recomendado

El primer producto comercial debe resolver perfectamente este recorrido:

```text
NEGOCIO
↓
abre Güegüense
↓
ingresa cliente/destino
↓
obtiene cotización
↓
solicita delivery
↓
sistema busca motorizado verificado
↓
motorizado acepta
↓
negocio ve llegada en tiempo real
↓
motorizado recoge
↓
cliente recibe tracking
↓
motorizado llega
↓
cliente confirma mediante PIN
↓
entrega completada
↓
ganancia y cobro registrados
```

Si este flujo funciona de manera excelente, Güegüense ya tiene un producto útil.

---

# 72. Funciones que NO deben bloquear el MVP

Estas pueden desarrollarse después:

- Marketplace completo.
- Miles de productos.
- Recomendaciones al consumidor.
- Programa de fidelidad.
- Publicidad.
- Gamificación avanzada.
- Multi-stop.
- Optimización de flotas compleja.
- Suscripciones sofisticadas.
- Inteligencia artificial de demanda.

Primero debe ser excelente la logística básica.

---

# 73. Principios de programación para la IA

La IA que desarrolle Güegüense debe respetar:

1. No programar todo de una sola vez.
2. Trabajar por fases.
3. Documentar antes de implementar módulos críticos.
4. No inventar estados.
5. No duplicar lógica.
6. Centralizar tipos.
7. Centralizar validaciones.
8. Separar UI, dominio y acceso a datos.
9. Backend como fuente de verdad.
10. No usar mocks como solución final.
11. No hardcodear precios.
12. No hardcodear permisos.
13. No exponer secrets.
14. Implementar migraciones.
15. Implementar tests.
16. Manejar errores.
17. Manejar loading.
18. Manejar empty states.
19. Manejar offline.
20. Mantener auditoría.
21. Validar reglas de negocio en servidor.
22. Diseñar para observabilidad.
23. No continuar una fase crítica si la anterior está incompleta.

---

# 74. Reglas de calidad

Cada módulo deberá incluir cuando aplique:

- Especificación.
- Tipos.
- Schemas.
- Migraciones.
- Policies.
- Servicios.
- API.
- UI.
- Manejo de errores.
- Logs.
- Tests.
- Documentación.

No considerar una funcionalidad finalizada solo porque la pantalla se vea correctamente.

---

# 75. Definición de terminado

Una funcionalidad estará terminada únicamente si:

- Funciona visualmente.
- Funciona en backend.
- Tiene validación.
- Tiene permisos.
- Tiene manejo de error.
- Tiene estados de carga.
- Tiene estados vacíos.
- Tiene logs.
- Está probada.
- No rompe flujos anteriores.
- Está documentada.
- Respeta seguridad.
- Respeta reglas de negocio.

---

# 76. Identidad conceptual de Güegüense

**Nombre:** Güegüense

Concepto inicial:

> Delivery verificado cuando tu negocio lo necesita.

Alternativas posibles de comunicación:

> Tu negocio vende. Güegüense lo lleva.

> Tu entrega, en buenas manos.

> Motorizados verificados, cuando los necesitas.

Para motorizados puede mantenerse el concepto existente:

> Tu ruta, tu ingreso.

---

# 77. Diferenciadores estratégicos

Güegüense debe intentar diferenciarse por:

- Enfoque B2B.
- Motorizados verificados.
- Disponibilidad bajo demanda.
- Tracking.
- Transparencia.
- Seguridad.
- Sin necesidad de catálogo.
- Integración futura con sistemas del negocio.
- Operación local adaptada al mercado.
- Panel administrativo fuerte.
- Control de efectivo.
- Historial y trazabilidad.

---

# 78. Principio central

Güegüense no debe obligar a un negocio a convertirse en un marketplace para utilizar la plataforma.

El producto principal debe poder resumirse así:

> **Tengo un paquete listo. Necesito un motorizado confiable para entregarlo.**

Güegüense resuelve el resto:

- búsqueda,
- asignación,
- tracking,
- seguridad,
- prueba de entrega,
- registro financiero,
- soporte.

---

# 79. Fuente conceptual existente

El proyecto parte de un diseño inicial ya definido para la **App del Motorizado**, donde se establecieron como funciones principales:

- Disponibilidad.
- Solicitudes cercanas.
- Aceptar/rechazar.
- Navegar hacia el comercio.
- Confirmar llegada.
- Confirmar recogida.
- Navegar al cliente.
- Confirmar entrega.
- Ganancias.
- Historial.
- Calificaciones.
- Cuenta.
- Soporte.

Ese concepto debe conservarse y ampliarse dentro de la plataforma integral descrita en este documento.

---

# 80. Instrucción para cualquier IA que reciba este documento

Este archivo representa la **visión maestra del proyecto Güegüense**.

Antes de escribir código:

1. Leer el documento completo.
2. No reducir el proyecto a una app de comida.
3. Entender que el producto principal es logística B2B bajo demanda.
4. Mantener separadas:
   - App Negocios.
   - App Motorizado.
   - Admin Web.
   - Tracking Web.
5. Mantener separados:
   - Order.
   - Delivery.
   - Payment.
   - Ledger.
6. Diseñar primero arquitectura y estados.
7. Identificar decisiones pendientes.
8. No inventar requisitos contradictorios.
9. Marcar claramente cualquier recomendación técnica adicional.
10. Implementar por fases.
11. Priorizar seguridad, confiabilidad y trazabilidad sobre velocidad de desarrollo.
12. Tratar el MVP como un producto real y no como una demostración.

---

# 81. Resultado esperado del producto

La experiencia ideal será:

### Para un negocio

> "Tengo una entrega → la registro → conozco el precio → Güegüense encuentra un motorizado verificado → lo sigo en tiempo real → se entrega → queda todo registrado."

### Para un motorizado

> "Me pongo disponible → recibo una entrega → conozco distancia y ganancia → acepto → recojo → entrego → cobro."

### Para administración

> "Puedo observar, controlar, auditar y resolver toda la operación desde un solo lugar."

### Para el cliente

> "Recibo un enlace → veo quién trae mi pedido → sigo su llegada → confirmo la entrega."

---

# FIN DEL DOCUMENTO MAESTRO

Este documento debe utilizarse como contexto base del proyecto antes de generar código, arquitectura definitiva o interfaces.
