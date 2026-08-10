# GÜEGÜENSE — DIRECTIVA DEL CEREBRO PARA CIERRE DE FASE 0

**Versión:** 1.2  
**Estado:** DIRECTIVA ARQUITECTÓNICA VIGENTE — FASE 0 EN REVISIÓN  
**Proyecto:** Güegüense  
**Repositorio:** `https://github.com/PhreakerNi/gueguenseapp.git`  
**Propósito:** Este archivo contiene las decisiones, correcciones e invariantes que el agente de desarrollo debe aplicar a la documentación técnica antes de comenzar la Fase 1.

---

# 0. Cómo debe interpretarse este documento

El usuario trabajará con dos IAs:

- **Cerebro / Arquitecto:** ChatGPT. Define producto, arquitectura, invariantes, revisa riesgos y aprueba cada fase.
- **Agente de ejecución:** La otra IA conectada al repositorio. Lee las directivas, modifica archivos, implementa y ejecuta pruebas cuando reciba autorización.

El agente **NO debe sustituir decisiones arquitectónicas de este archivo por preferencias propias**.

Si encuentra una incompatibilidad real, debe:

1. No improvisar.
2. Documentar el conflicto.
3. Proponer opciones A/B.
4. Esperar decisión del Cerebro/usuario si el cambio afecta arquitectura, seguridad, dinero, datos o experiencia principal.

## Jerarquía de autoridad

En caso de contradicción:

1. Decisiones explícitas posteriores del usuario.
2. Este archivo `Gueguense_Directiva_Cerebro_Fase0_v1_2.md`.
3. `Gueguense_Documento_Maestro_Proyecto.md`.
4. Documentación actual en `/docs`.
5. Preferencias o inferencias del agente.

Este archivo **no reemplaza la visión del Documento Maestro**. La corrige y la convierte en reglas técnicas canónicas donde existían ambigüedades.

---

# 1. Estado actual de la Fase 0

La documentación actual es una buena base, pero **FASE 0 NO ESTÁ APROBADA**.

Debe permanecer:

```text
FASE 0 — EN REVISIÓN
```

Queda prohibido comenzar Fase 1 hasta aprobación explícita.

Durante este cierre de Fase 0, el agente solo puede modificar:

```text
README.md
/docs/*.md
```

No debe crear todavía:

```text
apps/
packages/
supabase/
```

No debe:

- instalar dependencias;
- inicializar Expo;
- inicializar Next.js;
- inicializar Supabase;
- crear migrations;
- crear Edge Functions;
- crear SQL ejecutable;
- programar interfaces;
- comenzar autenticación real;
- comenzar Dispatch real.

---

# 2. Producto canónico

Güegüense es una plataforma logística B2B bajo demanda.

El núcleo del MVP es:

```text
NEGOCIO
→ solicita una entrega
→ recibe cotización
→ confirma
→ sistema busca motorizado verificado
→ motorizado acepta
→ llega al negocio
→ se valida transferencia de custodia
→ transporta el paquete
→ cliente sigue el pedido
→ cliente entrega DELIVERY_OTP
→ backend confirma
→ entrega termina
→ finanzas y eventos quedan registrados
```

La modalidad principal del MVP es:

```text
SOLO DELIVERY
```

El negocio no necesita catálogo.

La modalidad catálogo/menú es posterior al MVP.

---

# 3. Componentes canónicos

La plataforma estará compuesta por:

```text
apps/
├── business-mobile
├── driver-mobile
├── admin-web
└── tracking-web
```

## Business Mobile

Centro operativo para negocios.

Debe permitir:

- registro;
- negocio;
- sucursales;
- miembros;
- cotizaciones;
- creación de entregas;
- entregas activas;
- tracking;
- historial;
- cancelaciones permitidas;
- incidencias;
- finanzas visibles;
- soporte.

## Driver Mobile

Debe permitir:

- onboarding;
- documentos;
- vehículo;
- verificación;
- disponibilidad;
- recepción de ofertas;
- aceptación/rechazo;
- navegación;
- recogida;
- custodia;
- entrega;
- devolución;
- incidencias;
- ganancias;
- retiros;
- soporte.

## Admin Web

Centro de control operacional:

- mapa de operaciones;
- negocios;
- drivers;
- verificación;
- entregas;
- Dispatch;
- incidencias;
- devoluciones;
- handoffs;
- pricing;
- pagos;
- ledger;
- payouts;
- cash settlements;
- suspensiones;
- soporte;
- auditoría.

## Tracking Web

No es una tercera app móvil.

Permite al destinatario:

- abrir enlace seguro;
- ver estado;
- ver ETA;
- ver mapa mientras corresponda;
- consultar identidad básica del motorizado;
- consultar su DELIVERY_OTP;
- recibir estados de entrega.

Después del cierre de la entrega nunca debe seguir mostrando la ubicación actual del conductor.

---

# 4. Separación obligatoria: Quote vs Delivery

La documentación actual mezcla `DRAFT` y `QUOTED` como estados del delivery.

Esto debe corregirse.

## 4.1 Quote Lifecycle

La cotización es un dominio separado.

Estados canónicos:

```text
DRAFT
QUOTED
CONSUMED
EXPIRED
CANCELED
```

Interpretación:

- `DRAFT`: datos todavía incompletos o cálculo aún no finalizado.
- `QUOTED`: cotización válida con precio y expiración.
- `CONSUMED`: la cotización fue utilizada para crear una entrega.
- `EXPIRED`: venció antes de ser utilizada.
- `CANCELED`: invalidada por negocio/sistema cuando aplique.

Campos importantes de `delivery_quotes`:

```text
id
delivery_request_id
pricing_version
currency
base_amount
distance_amount
time_amount
zone_amount
demand_amount
discount_amount
quoted_total
driver_earning_estimate
platform_revenue_estimate
expires_at
status
created_at
consumed_at
```

La cotización debe conservar un snapshot/versionado suficiente para poder explicar posteriormente cómo se calculó.

## 4.2 Delivery Lifecycle

Una entrega solo nace cuando una cotización válida es confirmada/consumida.

Estados canónicos:

```text
SEARCHING_DRIVER
DRIVER_ASSIGNED
TO_PICKUP
ARRIVED_PICKUP
PICKED_UP
TO_DROPOFF
ARRIVED_DROPOFF
DELIVERED

RETURN_REQUIRED
RETURNING
RETURNED

CANCELED
FAILED
```

No agregar estados nuevos sin actualizar todos los documentos fuente.

### Estados terminales

```text
DELIVERED
RETURNED
CANCELED
FAILED
```

### Semántica

- `CANCELED`: una parte autorizada canceló una operación que todavía podía cancelarse conforme a custodia y reglas.
- `FAILED`: la operación no pudo completarse y no existe un flujo operativo pendiente de retorno/custodia.
- `RETURNED`: paquete devuelto y custodia cerrada.
- `DELIVERED`: paquete confirmado al destinatario.

---

# 5. Transiciones canónicas de Delivery

## Creación

```text
QUOTED quote válido
→ consume quote
→ crea delivery
→ SEARCHING_DRIVER
```

Debe ser idempotente.

## Asignación

```text
SEARCHING_DRIVER
→ DRIVER_ASSIGNED
→ TO_PICKUP
```

`DRIVER_ASSIGNED` representa el hito de adjudicación.

La UX puede abrir inmediatamente navegación al negocio. No obligar a una pantalla innecesaria únicamente para conservar el estado.

## Pickup

```text
TO_PICKUP
→ ARRIVED_PICKUP
→ PICKED_UP
→ TO_DROPOFF
```

## Dropoff

```text
TO_DROPOFF
→ ARRIVED_DROPOFF
→ DELIVERY_OTP válido
→ DELIVERED
```

## Reasignación antes de custodia

Si el driver cancela antes de `PICKED_UP` y el paquete sigue en el negocio:

```text
DRIVER_ASSIGNED / TO_PICKUP / ARRIVED_PICKUP
→ driver_id = NULL
→ SEARCHING_DRIVER
```

Debe generar eventos y aplicar reglas de penalización si corresponden.

## Regla post-custodia

Después de `PICKED_UP`:

**NUNCA realizar una desasignación simple.**

Debe existir:

```text
RETURN
```

o

```text
CONTROLLED_HANDOFF
```

supervisado y auditable.

---

# 6. Flujo de devolución

Estados:

```text
RETURN_REQUIRED
→ RETURNING
→ RETURNED
```

Puede originarse desde:

```text
PICKED_UP
TO_DROPOFF
ARRIVED_DROPOFF
```

cuando se determina que el paquete no puede ser entregado.

Motivos posibles:

```text
CUSTOMER_UNREACHABLE
RECIPIENT_REFUSED
INVALID_ADDRESS
UNSAFE_DROPOFF
PAYMENT_NOT_COMPLETED
PACKAGE_REJECTED
OPERATOR_DECISION
OTHER
```

Una devolución debe registrar:

- reason code;
- actor que la autorizó;
- ubicación;
- hora;
- prueba de devolución;
- miembro del negocio que recibió el paquete;
- tarifa adicional;
- impacto financiero;
- eventos;
- notificaciones.

`RETURNED` es terminal.

---

# 7. Incidentes NO son estados de delivery

Incidentes pertenecen a una entidad independiente.

Una entrega puede estar:

```text
TO_DROPOFF
```

y simultáneamente tener:

```text
incident.status = OPEN
```

## Incident Types iniciales

```text
VEHICLE_BREAKDOWN
ACCIDENT
GPS_LOST
NETWORK_LOST
PACKAGE_DAMAGED
BUSINESS_CLOSED
PACKAGE_NOT_READY
CUSTOMER_UNREACHABLE
RECIPIENT_REFUSED
ADDRESS_PROBLEM
PAYMENT_PROBLEM
CASH_MISMATCH
SAFETY_ISSUE
OTHER
```

## Incident Status canónico

Usar exactamente:

```text
OPEN
UNDER_INVESTIGATION
RESOLVED_CONTINUE
RESOLVED_RETURN
RESOLVED_HANDOFF
CLOSED
```

No usar un enum diferente en otro documento.

Semántica:

- `OPEN`: recién reportado.
- `UNDER_INVESTIGATION`: un operador lo está gestionando.
- `RESOLVED_CONTINUE`: la entrega puede continuar.
- `RESOLVED_RETURN`: se ordenó devolución.
- `RESOLVED_HANDOFF`: se resolvió mediante transferencia controlada.
- `CLOSED`: el incidente quedó formalmente cerrado después de completar la acción de resolución.

---

# 8. Custodia: PICKUP_CODE y DELIVERY_OTP son diferentes

Este punto es crítico.

## 8.1 PICKUP_CODE

Su propósito es validar la transferencia de custodia del negocio al conductor.

Decisión canónica recomendada:

1. Driver llega a `ARRIVED_PICKUP`.
2. Backend genera o habilita un `PICKUP_CODE` corto/QR temporal asociado a la asignación.
3. El código se muestra **al driver asignado**.
4. El empleado del negocio lo introduce/escanea desde Business App.
5. Backend verifica que:
   - business member pertenece al negocio/sucursal;
   - driver sigue asignado;
   - delivery está `ARRIVED_PICKUP`;
   - código corresponde;
   - no está expirado/reutilizado.
6. El negocio confirma entrega física del paquete.
7. Backend registra la prueba de custodia y pasa a `PICKED_UP`.

Esto evita que el conductor pueda confirmarse a sí mismo la recogida.

El agente puede documentar un mecanismo QR además del PIN, pero el backend debe mantener la misma autoridad.

## 8.2 DELIVERY_OTP

Su propósito es validar entrega al destinatario.

Reglas canónicas:

- Inicialmente **6 dígitos**.
- Solo el cliente/destinatario debe conocer el valor plano.
- Driver nunca puede recuperar el OTP mediante una API.
- Business nunca recibe el OTP.
- Admin no recibe el OTP plano.
- Driver únicamente puede enviar un intento de verificación.
- Backend compara el intento con un digest protegido.
- OTP expira.
- Tiene rate limit.
- Tiene contador de intentos.
- Tiene lock temporal.
- `verified_at` se registra al acertar.
- Después de éxito no puede reutilizarse.

## 8.3 Almacenamiento de secretos

Preferencia arquitectónica:

No mezclar secretos directamente con filas ampliamente consultadas.

Documentar un esquema restringido o tablas privadas, por ejemplo:

```text
private.delivery_secrets
private.tracking_tokens
```

`private.delivery_secrets`:

```text
delivery_id
otp_digest
otp_expires_at
otp_attempt_count
otp_locked_until
otp_verified_at
pickup_secret_digest si se implementa como secreto
```

`private.tracking_tokens`:

```text
id
delivery_id
token_hash
expires_at
revoked_at
created_at
```

Estas tablas no deben exponerse directamente a clientes.

## 8.4 Digest de OTP

El OTP tiene un espacio de búsqueda pequeño.

No tratarlo exactamente igual que una contraseña larga.

Documentar una estrategia que combine:

- OTP aleatorio criptográficamente seguro;
- digest;
- secreto del servidor/pepper cuando corresponda;
- límites de intentos;
- lockout;
- expiración;
- autorización por delivery;
- rate limiting por usuario/dispositivo/delivery.

La implementación concreta se cerrará antes de la migration correspondiente.

---

# 9. Identidad, roles y membresías

## Auth

Fuente de identidad:

```text
auth.users
```

Perfil general:

```text
public.profiles
```

No crear `public.users` duplicando Supabase Auth.

## Roles de plataforma

```text
super_admin
admin
operator
verification_agent
```

Puede representarse mediante un rol de plataforma o tabla específica; no mezclarlo con roles del negocio.

## Membresías de negocio

```text
business_members
```

Campos:

```text
business_id
user_id
role
status
location_scope opcional
```

Roles:

```text
business_owner
business_manager
business_employee
```

La misma persona puede pertenecer a más de un negocio con roles diferentes.

## Driver

`drivers` representa el perfil de conductor vinculado a `auth.users.id`.

Un usuario puede ser business member y driver.

## Customer

En Solo Delivery MVP, el destinatario **no necesita una cuenta permanente**.

No escribir en matrices de seguridad:

```text
customer = público
```

Escribir:

```text
holder of a valid customer/tracking credential
```

---

# 10. Lifecycle canónico de negocio y driver

Debe evitarse mezclar verificación con estado operacional.

## Business

### Verification status

```text
NOT_REQUIRED
PENDING
UNDER_REVIEW
VERIFIED
REJECTED
```

### Account status

```text
ACTIVE
SUSPENDED
BLOCKED
CLOSED
```

Durante onboarding puede existir cuenta no activa hasta completar requisitos.

## Driver

### Verification status

```text
PENDING
UNDER_REVIEW
VERIFIED
REJECTED
EXPIRED
```

### Account status

```text
REGISTERED
ACTIVE
SUSPENDED
BLOCKED
CLOSED
```

### Operational state

```text
OFFLINE
AVAILABLE
OFFERED
BUSY
PAUSED
```

No duplicar estados del delivery dentro de `driver_presence`.

El delivery indica si va a pickup/dropoff/return.

La presencia del driver solo indica disponibilidad operacional.

Esto reduce inconsistencias entre dos máquinas de estados.

---

# 11. Dispatch Engine: principio de selección

No asignar únicamente por distancia lineal.

Pipeline:

```text
1. Eligibility
2. PostGIS candidate discovery
3. Filter
4. Top-N coarse ranking
5. Google Compute Route Matrix para Top-N
6. Final score
7. Dispatch round
8. Offer
9. Accept / Reject / Expire
10. Radius expansion / next round
11. Operator fallback
```

## Eligibility mínima

Driver candidato debe:

- `verification_status = VERIFIED`;
- `account_status = ACTIVE`;
- `operational_state = AVAILABLE`;
- GPS suficientemente reciente;
- estar en zona habilitada;
- poseer vehículo compatible;
- no poseer otra entrega activa;
- no poseer bloqueo operativo;
- cumplir restricciones del paquete.

## Candidate discovery

Usar PostGIS para filtrar primero.

No llamar Google Routes para toda la flota.

## Top-N

Seleccionar un número pequeño de candidatos y usar `Compute Route Matrix` para obtener ETA vial real.

El valor Top-N y radio deben ser configurables, no hardcodeados.

## Scoring

Puede incluir:

- ETA a pickup;
- distancia;
- freshness GPS;
- rating;
- completion rate;
- cancellation rate;
- fairness;
- carga reciente;
- reglas de zona.

No convertir rating en el único factor.

---

# 12. Dispatch: dos invariantes absolutas

## Invariante A

```text
1 delivery → máximo 1 driver activo
```

## Invariante B

```text
1 driver → máximo 1 delivery comprometida en MVP
```

Se consideran comprometidos los estados:

```text
DRIVER_ASSIGNED
TO_PICKUP
ARRIVED_PICKUP
PICKED_UP
TO_DROPOFF
ARRIVED_DROPOFF
RETURN_REQUIRED
RETURNING
```

Un driver en devolución sigue ocupado.

---

# 13. Concurrencia de accept_delivery_offer

La función debe basarse en identidad autenticada.

Firma conceptual:

```text
accept_delivery_offer(p_offer_id)
```

No recibe `driver_id`.

## Validaciones dentro de la misma transacción

Debe comprobar:

```text
auth.uid() != null
driver existe
verification_status == VERIFIED
account_status == ACTIVE
driver_presence.operational_state compatible
offer existe
offer.driver_id == auth.uid()
offer.status == OPEN
offer.expires_at > now()
delivery existe
delivery.status == SEARCHING_DRIVER
delivery.driver_id IS NULL
driver no tiene otra delivery comprometida
```

## Locks

Debe utilizar un orden consistente para evitar deadlocks.

La documentación debe definir un orden único de locks.

Recomendación:

```text
1. bloquear driver / driver_presence
2. bloquear delivery
3. bloquear offer
```

o un orden equivalente, pero **el mismo orden en todos los flujos que compitan por esos recursos**.

La finalidad es serializar:

- dos drivers aceptando la misma delivery;
- un mismo driver aceptando dos deliveries.

## Defensa en profundidad

Además del lock, mantener constraint/índice parcial que impida que un driver tenga dos deliveries comprometidas.

El índice debe incluir `RETURN_REQUIRED` y `RETURNING`.

Los conflictos de constraint deben convertirse a errores de dominio controlados, no mostrarse como errores SQL internos.

---

# 14. SECURITY DEFINER

Preferencia:

```sql
SECURITY DEFINER
SET search_path = ''
```

y todas las referencias deben estar calificadas:

```text
public.deliveries
public.delivery_offers
public.drivers
public.driver_presence
```

Reglas:

- `REVOKE EXECUTE` por defecto;
- no conceder a `anon`;
- `GRANT` mínimo;
- usar `auth.uid()`;
- no aceptar identidad del cliente como argumento;
- validar account/verification status;
- registrar evento;
- evitar SQL dinámico innecesario;
- no devolver detalles internos.

En Fase 0 esto se documenta; no escribir todavía la función real.

---

# 15. Offer Lifecycle canónico

Estados:

```text
OPEN
ACCEPTED
REJECTED
EXPIRED
CANCELED
```

Reglas:

- `OPEN`: ofrecida y vigente.
- `ACCEPTED`: aceptada por el driver y ganó la asignación.
- `REJECTED`: driver la rechazó explícitamente.
- `EXPIRED`: pasó `expires_at`.
- `CANCELED`: backend la cerró porque otra oferta ganó o delivery dejó de buscar.

Push no crea una oferta.

La fila de `delivery_offers` es la fuente de verdad.

---

# 16. Base de datos: entidades obligatorias de Fase 0

`06_DATABASE_ARCHITECTURE.md` debe documentar, aunque algunas sean FUTURE.

## Identity / Business

```text
auth.users
profiles
businesses
business_members
business_locations
```

## Driver

```text
drivers
driver_documents
vehicles
driver_presence
driver_locations o delivery_tracking_points
```

## Delivery

```text
delivery_requests
delivery_quotes
deliveries
delivery_offers
delivery_events
delivery_tracking_points
delivery_proofs
incidents
custody_handoffs
pricing_adjustments
```

## Secrets

```text
private.delivery_secrets
private.tracking_tokens
```

o diseño equivalente que no exponga secretos a clientes.

## Pricing

```text
pricing_zones
pricing_rules
pricing_versions
```

## Finance

```text
ledger_accounts
ledger_transactions
ledger_postings
payments
payouts
cash_settlements
```

Si se conserva `wallet_accounts`, aclarar que son cuentas contables internas; preferencia de nomenclatura: `ledger_accounts`.

## Notifications

```text
device_tokens
notification_outbox
notifications
```

## Support / Operations

```text
support_tickets
audit_logs
```

## Future Catalog

```text
orders
order_items
menus
categories
products
product_options
```

Marcar como POST-MVP sin eliminar del diseño global.

---

# 17. Requisitos de documentación por tabla

Para cada tabla en `06_DATABASE_ARCHITECTURE.md`:

- propósito;
- PK;
- columnas;
- FK;
- ON DELETE;
- UNIQUE;
- CHECK;
- enum/status;
- indexes;
- PostGIS index cuando aplique;
- RLS prevista;
- información sensible;
- lifecycle;
- retención;
- actor que escribe;
- actor que lee;
- si pertenece al MVP o POST-MVP.

No basta con mencionar el nombre.

---

# 18. Snapshots históricos

Una entrega debe conservar información histórica.

Modificar posteriormente una sucursal no puede alterar una entrega pasada.

Guardar snapshots de:

```text
pickup address
pickup coordinates
business/location display name
dropoff address
dropoff coordinates
recipient name
recipient phone
delivery instructions
package information
pricing version
```

Aplicar minimización y retención de PII.

---

# 19. delivery_events

Debe ser un historial inmutable de dominio.

Actor:

```text
actor_type
actor_user_id nullable
```

`actor_type`:

```text
USER
SYSTEM
CUSTOMER_CREDENTIAL
WEBHOOK
BACKGROUND_JOB
ADMIN_ACTION
```

No todo actor existe en `auth.users`.

Eventos críticos deben quedar registrados.

Ejemplos:

```text
DELIVERY_CREATED
SEARCH_STARTED
OFFER_CREATED
OFFER_ACCEPTED
DRIVER_ASSIGNED
TO_PICKUP_STARTED
ARRIVED_PICKUP
CUSTODY_TRANSFERRED
TO_DROPOFF_STARTED
ARRIVED_DROPOFF
OTP_VERIFIED
DELIVERY_COMPLETED
RETURN_REQUIRED
RETURN_STARTED
RETURN_COMPLETED
INCIDENT_OPENED
INCIDENT_RESOLVED
DRIVER_UNASSIGNED
DELIVERY_CANCELED
DELIVERY_FAILED
```

Los nombres oficiales deben centralizarse y ser idénticos en todos los documentos.

---

# 20. Tracking de ubicación

## Ingesta

```text
Driver App
→ authenticated location endpoint
→ server validation
→ current driver_presence
→ optional historical tracking point
→ authorized broadcast
```

No permitir que una coordenada emitida directamente por el cliente se convierta automáticamente en verdad para negocio/cliente.

## Campos recomendados

```text
latitude/longitude o geography point
accuracy
heading
speed
device_timestamp
server_received_at
location_updated_at
source
```

## Frescura

Estados:

```text
LIVE
DELAYED
STALE
UNAVAILABLE
```

Los thresholds serán configurables.

No mostrar una ubicación stale como si fuese actual.

## Restricciones móviles

La frecuencia es un objetivo, no una garantía.

Debe documentarse comportamiento para:

```text
foreground
background
app terminated
offline
permissions revoked
low battery
battery optimization
```

---

# 21. Estrategia Realtime

Para Business App, Driver App y Admin:

- canales privados;
- autorización;
- backend/PostgreSQL como fuente de verdad;
- Realtime como transporte de baja latencia;
- rehidratación al reconectar.

Temas conceptuales:

```text
driver:{driver_id}:offers
business:{business_id}:deliveries
delivery:{delivery_id}
admin:operations
```

No confiar únicamente en Realtime.

---

# 22. Tracking Web del cliente

El `tracking_token` de la URL es una credencial bearer de alta entropía.

Debe:

- ser aleatorio;
- almacenarse como hash;
- tener expiración;
- tener revocación;
- no escribirse en logs;
- excluirse de analytics;
- usar `Cache-Control: no-store`;
- usar `Referrer-Policy: no-referrer`;
- limitar datos al delivery correspondiente.

## Estrategia de transporte MVP

No asumir que el `tracking_token` puede suscribirse directamente a un private channel de Supabase.

El sistema debe documentar una capa de autorización.

Decisión para Fase 0:

```text
Tracking Web
→ valida tracking token contra backend
→ obtiene snapshot autorizado
→ recibe actualizaciones mediante una sesión realtime de alcance limitado
   O fallback near-real-time server-mediated
```

Antes de Fase 6 se hará un spike técnico para escoger entre:

A. credencial realtime temporal y scoped;
B. SSE/WebSocket server-mediated;
C. polling corto como fallback.

La Fase 0 debe dejar claro que el token URL por sí solo **no autoriza directamente un canal Supabase**.

---

# 23. Google Maps / Routes

Arquitectura canónica:

```text
PostGIS
→ filtra candidatos
→ Top-N
→ Google Routes API Compute Route Matrix
→ ETA real
```

Para navegación de un trayecto:

```text
Compute Routes
```

Para motorizados, evaluar `TWO_WHEELER` solamente donde Google lo soporte y cumpliendo advertencias/limitaciones del proveedor.

Debe existir fallback a `DRIVE` o política por región si el modo de dos ruedas no está disponible.

No diseñar nuevo código alrededor de Distance Matrix API Legacy.

---

# 24. Pricing Engine

Separar:

```text
quoted_price
final_price
```

El quote no cambia retrospectivamente.

El final puede incluir ajustes autorizados.

`pricing_adjustments`:

```text
WAITING_FEE
RETURN_FEE
CANCEL_FEE
DISCOUNT
SUBSIDY
MANUAL_ADJUSTMENT
```

Cada ajuste debe tener:

- reason;
- amount;
- currency;
- actor;
- source;
- created_at;
- approval cuando aplique.

Nunca calcular precio oficial únicamente en frontend.

---

# 25. Ledger financiero

Arquitectura canónica:

```text
ledger_accounts
ledger_transactions
ledger_postings
```

## Regla

Por transacción:

```text
SUM(postings.amount) = 0
```

Debe garantizarse transaccionalmente.

## Cuentas iniciales conceptuales

```text
PLATFORM_CASH_OR_BANK
BUSINESS_RECEIVABLE
DRIVER_PAYABLE
PLATFORM_REVENUE
CASH_HELD_BY_DRIVER
REFUND_PAYABLE
ADJUSTMENT_ACCOUNT
```

## Currency

Cada cuenta/transacción debe tener moneda.

MVP inicial:

```text
NIO
```

pero el diseño no debe impedir otras monedas futuras.

## cached_balance

Si existe:

- es un saldo denormalizado/cacheado;
- NO es una materialized view;
- no se modifica desde clientes;
- solo cambia dentro de operaciones de ledger controladas;
- debe poder reconciliarse con postings.

## Ejemplos obligatorios en documentación

Agregar ejemplos de postings para:

- entrega normal;
- cash collection;
- driver earning;
- platform revenue;
- waiting fee;
- return fee;
- payout;
- refund;
- manual adjustment.

---

# 26. Cash

No mezclar:

```text
driver earning
```

con:

```text
cash held by driver
```

`cash_settlements` debe registrar:

```text
expected_amount
reported_amount
settled_amount
difference
status
driver_id
business_id/platform según modelo
created_at
settled_at
verified_by
```

El conductor puede deber dinero a la plataforma/negocio aunque tenga ganancias a favor.

---

# 27. API Contracts mínimos

`07_API_CONTRACTS.md` debe ser suficientemente completo.

## Driver

```text
onboarding
request document upload authorization
register uploaded document
vehicle
availability
current operational state
active offers
accept offer
reject offer
active delivery
arrived pickup
earnings
payout request
report incident
location ingest
```

## Business

```text
create/update business
locations
members
create delivery request
create quote
consume quote/create delivery
delivery detail
cancel delivery
history
confirm pickup custody
incidents/support
```

## Delivery

```text
arrived pickup
confirm custody
arrived dropoff
verify delivery OTP
request/authorize return
start return
complete return
```

## Tracking

```text
validate token
snapshot
realtime session/authorization
```

## Admin

```text
verification queue
approve/reject driver
suspend/reactivate
active operations
incident resolution
return/handoff authorization
pricing
payout approval
cash settlement
audit
```

## Finance

```text
payment
payout
ledger read views
cash settlement
```

Para cada mutación crítica:

- auth;
- authorization;
- request;
- response;
- allowed state;
- idempotency;
- errors;
- generated events;
- side effects.

---

# 28. Idempotencia

Obligatoria en:

- create delivery;
- consume quote;
- accept offer;
- confirm pickup;
- verify delivery OTP;
- complete delivery;
- initiate return;
- complete return;
- create payment;
- refund;
- payout;
- cash settlement.

Debe existir almacenamiento/estrategia de idempotency keys en servidor.

No implementar todavía, pero documentar.

---

# 29. Document upload seguro

No aceptar un `file_path` arbitrario decidido por la app.

Flujo:

```text
Driver solicita autorización de upload
→ backend valida identidad/tipo
→ backend define path seguro
→ entrega signed upload o policy autorizada
→ app sube
→ backend registra metadata
→ verificación posterior
```

Validar:

- ownership;
- mime;
- tamaño;
- extensión real;
- virus/malware cuando corresponda;
- privacidad;
- expiración del upload;
- bucket privado.

---

# 30. Notificaciones

Push es best-effort.

La fila de oferta/evento en backend es la fuente de verdad.

Al despertar/reconectar:

```text
sync active offers
sync active delivery
```

## Outbox

Documentar:

```text
device_tokens
notification_outbox
notification_receipts/notifications
```

## Error handling

```text
DeviceNotRegistered
→ desactivar SOLO el device token afectado

InvalidCredentials
→ alerta de infraestructura/credenciales
→ NO invalidar tokens de usuarios

MessageRateExceeded
→ retry con backoff

HTTP 429 / 5xx
→ exponential backoff

payload inválido
→ no retry ciego; registrar error de programación/datos
```

Deduplicar notificaciones mediante event/notification id.

---

# 31. Admin Operations

`14_ADMIN_OPERATIONS.md` debe incluir:

- dashboard;
- mapa live;
- deliveries;
- driver online/available/busy;
- businesses;
- verification queue;
- document review;
- incidents;
- returns;
- controlled handoffs;
- customer unreachable;
- support;
- pricing;
- payments;
- ledger views;
- payouts;
- cash settlements;
- suspensions;
- audit logs.

Acciones sensibles deben requerir:

- rol suficiente;
- reason;
- audit entry;
- confirmación;
- MFA/step-up para las de mayor riesgo cuando corresponda.

---

# 32. Edge Cases obligatorios

`15_ERROR_AND_EDGE_CASES.md` debe incluir como mínimo:

```text
NO_DRIVERS_AVAILABLE
ALL_OFFERS_EXPIRED
DRIVER_REJECTS
DRIVER_CANCELS_PRE_PICKUP
BUSINESS_CANCELS
CUSTOMER_CANCELS_IF_ALLOWED
GPS_LOST
LOCATION_STALE
NETWORK_LOST
APP_TERMINATED
PUSH_LOST
REALTIME_LOST
MAPS_PROVIDER_FAILURE
BUSINESS_CLOSED
PACKAGE_NOT_READY
WAITING_TIMEOUT
CUSTOMER_UNREACHABLE
WRONG_ADDRESS
RECIPIENT_REFUSED
PACKAGE_DAMAGED
OTP_WRONG
OTP_LOCKED
CASH_MISMATCH
PAYMENT_FAILED
DUPLICATE_REQUEST
DUPLICATE_WEBHOOK
DRIVER_SUSPENDED_MID_DELIVERY
BUSINESS_SUSPENDED_MID_DELIVERY
RETURN_REQUIRED
CONTROLLED_HANDOFF
DATABASE_TEMPORARY_FAILURE
```

Para cada uno:

- detection;
- backend behavior;
- UX;
- state transition;
- event;
- financial impact;
- recovery;
- operator escalation si aplica.

---

# 33. Threat Model obligatorio

`12_SECURITY_ARCHITECTURE.md` debe incorporar una tabla por amenaza:

```text
Asset
Threat
Attack path
Preventive controls
Detective controls
Response
Residual risk
```

Amenazas mínimas:

- account takeover;
- fake driver;
- forged GPS;
- IDOR;
- tracking token leak;
- OTP brute force;
- document exposure;
- price manipulation;
- fake pickup;
- fake delivery completion;
- race conditions;
- payout fraud;
- cash fraud;
- malicious business member;
- admin compromise;
- replay attack;
- leaked API key;
- abusive scraping/enumeration.

---

# 34. Sesiones y suspensión

No depender de "revocación instantánea del JWT".

Operaciones críticas deben comprobar el estado actual de:

```text
driver.account_status
driver.verification_status
business.account_status
business_members.status
```

Una cuenta suspendida no puede iniciar nuevas acciones críticas aunque conserve un token no expirado.

---

# 35. Supabase SSR

Para Next.js se utilizará la estrategia oficial vigente de Supabase SSR en el momento de implementación.

No hardcodear en Fase 0 afirmaciones innecesarias sobre exactamente dónde debe vivir cada refresh token más allá de seguir el patrón oficial y seguro.

---

# 36. Logs y observabilidad

Nunca registrar en claro:

- OTP;
- tracking token;
- JWT;
- API secrets;
- national ID;
- license number;
- documentos;
- teléfono completo;
- dirección completa;
- coordenadas sensibles sin necesidad.

El sanitizador no puede depender únicamente de una lista superficial de claves de primer nivel.

Documentar:

- redacción recursiva;
- allowlist para payloads críticos;
- sanitización de headers;
- query strings;
- URLs;
- nested JSON;
- request bodies;
- coordinates;
- retención;
- acceso;
- niveles de log;
- auditoría.

IDs permitidos para correlación:

```text
request_id
correlation_id
delivery_id
offer_id
business_id
driver_id
incident_id
transaction_id
```

---

# 37. Testing Strategy

Tests obligatorios de alto valor:

## State machine

- transición válida;
- transición prohibida;
- retorno;
- cancelación;
- terminales.

## Dispatch

### Invariante A

Dos drivers autenticados aceptan el mismo delivery concurrentemente.

Resultado:

```text
1 success
1 domain conflict
```

### Invariante B

El MISMO driver autenticado intenta aceptar dos deliveries concurrentemente.

Resultado:

```text
1 success
1 DRIVER_ALREADY_BUSY
```

No pasar `driver_id` desde payload.

## RLS

- cross-business isolation;
- driver only own records;
- business location scoping;
- secrets not queryable;
- admin permissions.

## Security

- OTP brute force;
- tracking token;
- suspended account;
- replay/idempotency.

## Custody

- pickup confirmation;
- post-pickup no simple unassign;
- return;
- handoff.

## Ledger

- zero sum;
- payout;
- cash collection;
- refund;
- duplicate idempotency key.

---

# 38. Design System mínimo de Fase 0

`16_DESIGN_SYSTEM.md` debe definir:

- brand colors;
- semantic colors;
- typography;
- spacing scale;
- radius;
- elevation/shadows;
- touch targets;
- buttons;
- inputs/forms;
- cards;
- bottom sheets;
- status badges;
- map overlays;
- loading;
- skeletons;
- empty states;
- error states;
- offline states;
- accessibility.

## Driver UX

- una acción primaria por etapa;
- botones grandes;
- mapa protagonista durante trayecto;
- no requerir interacciones innecesarias;
- no esconder ganancia de la oferta;
- no saturar la pantalla.

## Business UX

- solicitar delivery en menos de un minuto para un negocio recurrente;
- sucursal predeterminada;
- direcciones recientes;
- clientes recientes;
- duplicar entrega;
- cotización clara.

---

# 39. Deployment Architecture

Documentar entornos:

```text
local
development
staging
production
```

Pipeline:

```text
Pull Request
→ lint
→ typecheck
→ unit tests
→ Supabase local reset/migrations
→ DB/RLS tests
→ integration tests
→ preview/staging
→ approval
→ production
```

No autoaplicar DB de producción sin checks/aprobación.

Usar estrategia Expand/Contract para cambios incompatibles.

Documentar:

- Supabase project separation;
- mobile EAS build environments;
- admin deployment;
- tracking web deployment;
- secrets;
- backups;
- restore drill;
- monitoring;
- rollback/forward-fix.

---

# 40. Estructura futura del repositorio

Después de aprobar Fase 0:

```text
gueguenseapp/
├── apps/
│   ├── business-mobile/
│   ├── driver-mobile/
│   ├── admin-web/
│   └── tracking-web/
├── packages/
│   ├── types/
│   ├── schemas/
│   ├── domain/
│   ├── ui/
│   └── config/
├── supabase/
│   ├── migrations/
│   ├── functions/
│   ├── tests/
│   ├── seed.sql
│   └── config.toml
└── docs/
```

No crear aún durante el cierre documental.

---

# 41. Consistencia cruzada obligatoria

Antes de declarar la documentación lista, el agente debe comparar los 20 documentos.

Estos valores deben coincidir exactamente:

```text
QUOTE_STATUS
DELIVERY_STATUS
INCIDENT_STATUS
OFFER_STATUS
DRIVER_VERIFICATION_STATUS
DRIVER_ACCOUNT_STATUS
DRIVER_OPERATIONAL_STATE
BUSINESS_VERIFICATION_STATUS
BUSINESS_ACCOUNT_STATUS
BUSINESS_MEMBER_ROLE
PLATFORM_ROLE
PRICING_ADJUSTMENT_TYPE
EVENT_TYPE
```

No puede existir un estado usado en un flujo que no esté definido en el documento canónico correspondiente.

---

# 42. Documentos que deben ampliarse especialmente

En la versión actual están demasiado resumidos y deben ampliarse:

```text
03_USER_FLOWS.md
06_DATABASE_ARCHITECTURE.md
07_API_CONTRACTS.md
12_SECURITY_ARCHITECTURE.md
14_ADMIN_OPERATIONS.md
15_ERROR_AND_EDGE_CASES.md
16_DESIGN_SYSTEM.md
17_TESTING_STRATEGY.md
18_OBSERVABILITY.md
19_DEPLOYMENT_ARCHITECTURE.md
```

No reducir documentación existente para "corregir".

La tarea es:

```text
AMPLIAR
CONSOLIDAR
UNIFICAR
CORREGIR
```

---

# 43. Correcciones concretas detectadas en la versión actual

El agente debe corregir explícitamente:

1. `03_USER_FLOWS.md` todavía usa `DRAFT → QUOTED` como lifecycle del delivery.
2. `04_DELIVERY_STATE_MACHINE.md` todavía mezcla Quote y Delivery.
3. `04_DELIVERY_STATE_MACHINE.md` no define suficientemente `CANCELED` y `FAILED`.
4. `04_DELIVERY_STATE_MACHINE.md` solo origina RETURN desde un subconjunto de estados; debe cubrir post-custodia válido.
5. `06_DATABASE_ARCHITECTURE.md` sigue mostrando `ledger_entries` en el diagrama aunque usa `ledger_transactions/ledger_postings`.
6. `06_DATABASE_ARCHITECTURE.md` no documenta todas las tablas obligatorias.
7. `06_DATABASE_ARCHITECTURE.md` usa `incidents.status = RESOLVED`, inconsistente con State Machine.
8. `06_DATABASE_ARCHITECTURE.md` llama `cached_balance` "materializado"; debe llamarse cache/denormalizado.
9. El partial unique index de deliveries no incluye `RETURN_REQUIRED` ni `RETURNING`.
10. `07_API_CONTRACTS.md` es insuficiente para el proyecto.
11. El flujo de subida de documentos confía demasiado en `file_path` aportado por el cliente.
12. `08_DISPATCH_ENGINE.md` hace `COUNT(*)` sin bloquear al driver/presence y deja una carrera para el mismo driver/dos deliveries.
13. `08_DISPATCH_ENGINE.md` usa `SET search_path = public, pg_temp`; documentar `search_path = ''` con referencias calificadas.
14. `08_DISPATCH_ENGINE.md` no valida de forma completa verification/account/presence dentro de la transacción.
15. `09_TRACKING_ARCHITECTURE.md` debe incluir expiración/revocación explícita del tracking token y estrategia de autorización Realtime.
16. `09_TRACKING_ARCHITECTURE.md` usa `strict-origin-when-cross-origin`; para página bearer-token preferir `no-referrer`.
17. `11_FINANCIAL_LEDGER.md` debe reemplazar el término "vista materializada" aplicado a `cached_balance`.
18. `11_FINANCIAL_LEDGER.md` debe incluir ejemplos contables completos y currency.
19. `12_SECURITY_ARCHITECTURE.md` todavía no contiene Threat Model completo.
20. `12_SECURITY_ARCHITECTURE.md` debe estandarizar OTP a 6 dígitos.
21. `13_NOTIFICATIONS.md` trata `InvalidCredentials` igual que `DeviceNotRegistered`; esto es incorrecto y debe separarse.
22. `14_ADMIN_OPERATIONS.md` está demasiado resumido.
23. `15_ERROR_AND_EDGE_CASES.md` está demasiado resumido.
24. `16_DESIGN_SYSTEM.md` habla de OTP de "4 a 6"; estandarizar a 6.
25. `17_TESTING_STRATEGY.md` describe tests pasando `driver_id`; los tests deben autenticar identidades reales.
26. `18_OBSERVABILITY.md` utiliza un sanitizador ilustrativo superficial; documentar estrategia robusta.
27. `19_DEPLOYMENT_ARCHITECTURE.md` necesita entornos, secretos, builds, backups y promoción completa.
28. La matriz de roles no debe describir al customer como "Público"; debe ser poseedor de credencial válida.
29. El `PICKUP_CODE` debe tener un protocolo de custodia más fuerte: Business confirma el código/QR mostrado por el driver.
30. No marcar Fase 0 como completa.

---

# 44. Fuentes técnicas vigentes a respetar

El agente debe verificar documentación oficial al implementar.

Referencias arquitectónicas actuales:

- Supabase Database Functions: usar `SECURITY DEFINER` con `search_path` seguro y permisos mínimos.
- Supabase Realtime: canales privados requieren autenticación/autorización; Broadcast es apropiado para baja latencia.
- Google Maps Routes API: `Compute Routes` y `Compute Route Matrix`.
- Expo Location: background tracking está sujeto a restricciones del SO y puede detenerse si la app se termina.
- Expo Push: Push es best-effort; `DeviceNotRegistered` invalida el token; `InvalidCredentials` indica problema de credenciales de la app.

La documentación del repositorio no debe copiar grandes fragmentos de proveedores; solo registrar las decisiones y enlaces oficiales correspondientes.

---

# 45. Definition of Done para aprobar Fase 0

Fase 0 solo puede aprobarse cuando:

- [ ] Quote y Delivery están separados.
- [ ] State Machine es coherente en todos los docs.
- [ ] Incidents están desacoplados.
- [ ] Return está completo.
- [ ] Custodia pickup está definida.
- [ ] DELIVERY_OTP está protegido y estandarizado a 6 dígitos.
- [ ] DB Architecture documenta todas las entidades clave.
- [ ] API Contracts cubre todos los flujos críticos.
- [ ] Dispatch resuelve ambas carreras.
- [ ] Partial unique index incluye retorno.
- [ ] Security Definer está endurecido.
- [ ] Tracking token tiene hash, expiry y revocation.
- [ ] Tracking Realtime tiene una estrategia de autorización.
- [ ] Pricing diferencia quoted/final.
- [ ] Ledger es zero-sum y tiene ejemplos.
- [ ] Cash no se mezcla con earnings.
- [ ] Notifications maneja correctamente errores.
- [ ] Threat Model está completo.
- [ ] Admin Operations está completo.
- [ ] Edge Cases está completo.
- [ ] Testing Strategy cubre concurrencia/RLS/OTP/custodia/ledger.
- [ ] Observability protege PII, secretos y ubicación.
- [ ] Deployment define entornos y gates.
- [ ] Design System define tokens/componentes/estados.
- [ ] README usa enlaces relativos válidos.
- [ ] Roadmap mantiene `FASE 0 — EN REVISIÓN`.
- [ ] Se ejecutó consistency pass entre los 20 documentos.
- [ ] El agente entrega lista de decisiones pendientes.
- [ ] El Cerebro/usuario revisa y aprueba explícitamente.

---

# 46. Regla final para el Agente

No confundas "documentación extensa" con "documentación correcta".

La documentación debe ser:

- específica;
- coherente;
- implementable;
- segura;
- sin contradicciones;
- sin inventar servicios no aprobados;
- suficientemente detallada para que la Fase 1 no tenga que redefinir el producto.

Cuando termines, no escribas código.

Entrega los cambios y espera aprobación.

---

# FIN DE LA DIRECTIVA DEL CEREBRO

**Estado esperado después de aplicar esta directiva:**  
`FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN`
