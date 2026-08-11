# PROMPT PARA EL AGENTE — CIERRE DE FASE 0 DE GÜEGÜENSE

Actúa como **Agente de Ejecución Senior** del proyecto Güegüense.

No eres quien decide unilateralmente la arquitectura del producto. Debes implementar documentalmente las decisiones definidas por el Cerebro/Arquitecto y reportar cualquier conflicto antes de cambiar una decisión crítica.

## FUENTES QUE DEBES LEER EN ESTE ORDEN

1. `Gueguense_Documento_Maestro_Proyecto.md`
2. Todo el contenido actual de `/docs`
3. `Gueguense_Directiva_Cerebro_Fase0_v1_2.md`
4. `README.md`

La directiva del Cerebro **prevalece sobre `/docs` cuando exista contradicción técnica**, sin reemplazar la visión funcional principal del Documento Maestro.

## TU TAREA

Cerrar documentalmente la Fase 0.

Debes actualizar la documentación existente para que cumpla **completamente**:

`Gueguense_Directiva_Cerebro_Fase0_v1_2.md`

No copies la directiva dentro de cada archivo.

Transforma sus decisiones en documentación técnica coherente, distribuida en los documentos correctos.

## ARCHIVOS QUE PUEDES MODIFICAR

Únicamente:

```text
README.md
docs/01_PRODUCT_SPEC.md
docs/02_USER_ROLES.md
docs/03_USER_FLOWS.md
docs/04_DELIVERY_STATE_MACHINE.md
docs/05_SYSTEM_ARCHITECTURE.md
docs/06_DATABASE_ARCHITECTURE.md
docs/07_API_CONTRACTS.md
docs/08_DISPATCH_ENGINE.md
docs/09_TRACKING_ARCHITECTURE.md
docs/10_PRICING_ENGINE.md
docs/11_FINANCIAL_LEDGER.md
docs/12_SECURITY_ARCHITECTURE.md
docs/13_NOTIFICATIONS.md
docs/14_ADMIN_OPERATIONS.md
docs/15_ERROR_AND_EDGE_CASES.md
docs/16_DESIGN_SYSTEM.md
docs/17_TESTING_STRATEGY.md
docs/18_OBSERVABILITY.md
docs/19_DEPLOYMENT_ARCHITECTURE.md
docs/20_DEVELOPMENT_ROADMAP.md
```

Puedes añadir un documento de glosario/status enums dentro de `/docs` SOLO si ayuda a evitar contradicciones, pero no sustituyas los 20 documentos requeridos.

## PROHIBIDO

NO:

- inicies Fase 1;
- crees `apps/`;
- crees `packages/`;
- crees `supabase/`;
- instales dependencias;
- ejecutes scaffolding;
- crees migrations;
- crees SQL ejecutable de producción;
- configures servicios;
- implementes interfaces;
- hagas deploy;
- marques Fase 0 como aprobada.

## OBJETIVOS OBLIGATORIOS

Debes corregir especialmente:

1. Separación Quote Lifecycle / Delivery Lifecycle.
2. Estados `CANCELED`, `FAILED`, Return y terminales.
3. Incidents desacoplados.
4. Pickup custody mediante Business + código/QR del Driver.
5. DELIVERY_OTP de 6 dígitos, secreto y no recuperable por Driver/Business/Admin.
6. `auth.users` como identidad; no `public.users`.
7. Lifecycle separado para verification/account/operational status.
8. Base de datos completa con todas las entidades de la directiva.
9. Secrets fuera de tablas ampliamente expuestas.
10. API Contracts completos.
11. Dispatch con doble invariante y locks de Driver + Delivery + Offer.
12. Partial Unique Index incluyendo `RETURN_REQUIRED` y `RETURNING`.
13. `SECURITY DEFINER` endurecido con `search_path = ''`.
14. Tracking token con hash, expiry y revocation.
15. Realtime privado/autorizado; token URL no autoriza directamente un canal.
16. Google Routes API + PostGIS Top-N.
17. Tracking adaptativo y tolerante a background/app terminated.
18. Pricing quoted vs final.
19. Ledger zero-sum + cash separado de earnings.
20. Notificaciones best-effort y manejo correcto de `DeviceNotRegistered` vs `InvalidCredentials`.
21. Threat Model.
22. Admin Operations completas.
23. Edge Cases completos.
24. Design System completo a nivel de tokens/componentes.
25. Testing de concurrencia con identidades autenticadas.
26. Observabilidad con redacción robusta.
27. Deployment con local/dev/staging/prod y approvals.
28. Consistencia cruzada de todos los enums y eventos.
29. Mantener `FASE 0 — EN REVISIÓN`.

## FORMA DE TRABAJO

### Paso A — Auditoría silenciosa

Antes de editar:

- lee los 20 documentos;
- identifica contradicciones;
- crea internamente una matriz de conceptos canónicos;
- no asumas que un documento actual es correcto solo porque ya existe.

### Paso B — Edición

Amplía y corrige.

No reduzcas documentos.

Mantén contenido útil que no contradiga la directiva.

### Paso C — Consistency Pass

Compara todos los documentos y verifica que coincidan exactamente:

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

Busca también:

- endpoints usados pero no documentados;
- tablas usadas pero no documentadas;
- eventos usados pero no definidos;
- states usados en UX que no existan en State Machine;
- columnas de DB mencionadas con nombres distintos;
- secretos expuestos;
- rutas legacy;
- inconsistencias financieras.

### Paso D — Auto-revisión

Antes de terminar, responde internamente estas preguntas:

1. ¿Puede un driver aceptar dos deliveries concurrentemente?
2. ¿Pueden dos drivers aceptar la misma delivery?
3. ¿Puede un driver en RETURNING recibir otra entrega?
4. ¿Puede el driver obtener DELIVERY_OTP desde una API?
5. ¿Puede el negocio obtener DELIVERY_OTP?
6. ¿Puede el driver auto-confirmar pickup sin Business?
7. ¿Puede un cambio de dirección de sucursal alterar una entrega histórica?
8. ¿Existe un endpoint crítico sin idempotencia?
9. ¿Existe una tabla mencionada por otro módulo pero ausente en DB docs?
10. ¿Existe un estado usado pero no definido?
11. ¿El tracking token puede filtrarse a logs/referrers?
12. ¿Realtime es fuente de verdad?
13. ¿Push es fuente de verdad?
14. ¿Cash se confunde con earning?
15. ¿Toda transacción ledger puede reconciliarse?
16. ¿Una cuenta suspendida todavía puede ejecutar operaciones críticas?
17. ¿Los documentos del driver son privados?
18. ¿Fase 0 sigue EN REVISIÓN?

Si alguna respuesta revela un fallo, corrígelo antes de entregar.

## SALIDA FINAL QUE QUIERO

Cuando termines, NO comiences Fase 1.

Entrégame un reporte con:

### 1. Archivos modificados

Lista completa.

### 2. Correcciones aplicadas

Agrupadas por:

- Producto
- State Machine
- Database
- API
- Dispatch
- Tracking
- Pricing
- Finance
- Security
- Notifications
- Admin
- Testing
- Deployment

### 3. Contradicciones encontradas

Indica dónde estaban y cómo se resolvieron.

### 4. Decisiones pendientes

Solo decisiones reales que requieran al usuario/Cerebro.

### 5. Checklist Fase 0

Reproduce el checklist de Definition of Done de la Directiva y marca:

- CUMPLIDO
- PENDIENTE
- BLOQUEADO

### 6. Estado final

Debe decir exactamente:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

### 7. Detente

Espera la revisión del Cerebro/usuario.

NO empieces a programar.
