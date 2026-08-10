# GÜEGÜENSE — PAQUETE ÚNICO CEREBRO + AGENTE — FASE 0 v1.8

**Tipo:** Micro-parche final de cumplimiento documental  
**Base auditada por el Cerebro:** `gueguenseapp-main(8).zip`  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Objetivo:** Corregir únicamente los pocos incumplimientos restantes de v1.7.  
**Regla:** NO rediseñar la arquitectura, NO agregar funciones nuevas y NO comenzar Fase 1.

---

# PARTE A — RESULTADO DE LA AUDITORÍA DEL CEREBRO

La versión v1.7 está técnicamente muy cerca de aprobación.

El Cerebro verificó directamente el ZIP y confirmó:

```text
Filas API con estructura incorrecta: 0
Eventos API huérfanos respecto a EVENT_TYPE: 0
Código ejecutable creado durante Fase 0: 0
```

También se verificó como correcto:

- Driver onboarding separa `verification_status` y `account_status`.
- Business creation separa `verification_status` y `account_status`.
- `DRIVER_VERIFIED` existe en `EVENT_TYPE`.
- Los nuevos eventos API están registrados canónicamente.
- Handoff MVP consolida creación + autorización y `confirm-to` + completado.
- `idempotency_keys` soporta `USER`, `SYSTEM`, `WEBHOOK`, `BACKGROUND_JOB`.
- Fingerprint mismatch está documentado.
- Document upload utiliza `upload_id`, no `file_path` arbitrario enviado por cliente.
- Tracking Web continúa con backend + polling.
- Driver no escribe GPS directamente en `driver_presence`.
- Customer Tracking no lee `delivery_tracking_points` directamente.
- Payout `/approve` termina en `APPROVED`.
- `CONTROLLED_HANDOFF` está desacoplado del `DELIVERY_STATUS`.
- Fase 0 continúa correctamente como candidata a aprobación.

Por tanto, NO modificar nuevamente estas decisiones salvo para mantener consistencia con los parches de este documento.

---

# 1. ÚNICO BLOQUEO FUNCIONAL RESTANTE — documentar transición posterior de Payout

`07_API_CONTRACTS.md` documenta correctamente:

```text
POST /api/v1/admin/payouts/{id}/approve
→ APPROVED
```

pero no documenta de forma explícita cómo continúa:

```text
APPROVED
→ PROCESSING
→ PAID
```

aunque esa semántica sí aparece en otros documentos.

## Corrección obligatoria

Agregar en `07_API_CONTRACTS.md` una subsección:

```text
### Semántica interna de procesamiento de Payout
```

Debe establecer:

```text
REQUESTED
→ UNDER_REVIEW
→ APPROVED
→ PROCESSING
→ PAID
                 ↘ FAILED
```

Reglas:

1. `/approve` termina exclusivamente en `APPROVED`.
2. Un worker/backend autorizado recoge una payout `APPROVED` y la pasa a `PROCESSING`.
3. `PAID` solo puede establecerse después de confirmación verificable del proveedor/banco/procesador.
4. Si el proveedor falla de forma terminal, pasa a `FAILED`.
5. Callbacks/webhooks del proveedor:
   - verifican firma/autenticidad;
   - son idempotentes;
   - usan `provider_reference`;
   - no confían en status enviado por un cliente móvil/web.
6. Ningún Driver puede marcar su payout como `PROCESSING`, `PAID` o `FAILED`.
7. Ningún endpoint administrativo de aprobación debe saltar directamente a `PAID`.

No es necesario inventar un endpoint público nuevo.

Puede documentarse como transición interna de backend/worker/proveedor.

Si se decide emitir eventos:

```text
PAYOUT_PROCESSING
PAYOUT_PAID
PAYOUT_FAILED
```

entonces deben añadirse a `EVENT_TYPE`.

Si no se utilizan eventos todavía, NO inventarlos únicamente por documentación.

---

# 2. BLOQUEO DOCUMENTAL — policies configurables todavía aparecen como valores absolutos

La arquitectura ya decidió que timeouts, locks, signed URLs, radios y thresholds son:

```text
initial default / configurable policy
```

Sin embargo todavía existen frases que pueden interpretarse como reglas fijas.

## 2.1 `12_SECURITY_ARCHITECTURE.md`

Cambiar conceptos como:

```text
Lockout de 2 min tras 3 fallos
Signed URLs 15m
```

por redacción equivalente a:

```text
OTP lock:
3 intentos / 2 min = initial default / configurable security policy.

Signed URL lifetime:
15 min = initial default / configurable security policy.
```

La respuesta/UX tampoco debe prometer siempre exactamente 2 minutos.

Debe consultar/aplicar la policy vigente.

## 2.2 `15_ERROR_AND_EDGE_CASES.md`

En `OTP_LOCKED`, evitar:

```text
Conductor bloqueado 2 min
```

como garantía fija.

Usar:

```text
Conductor bloqueado durante `otp_lock_duration`
(initial default: 2 min / configurable policy).
```

Revisar todas las filas de Edge Cases.

Los números pueden permanecer como defaults iniciales, pero nunca como contrato irreversible.

## 2.3 `08_DISPATCH_ENGINE.md`

Donde aparezca:

```text
15s exp. default
```

reescribir:

```text
15s initial default / configurable policy
```

La sección posterior ya usa correctamente este patrón; hacer consistente la primera mención.

## 2.4 `07_API_CONTRACTS.md`

Donde aparezca:

```text
MFA si > C$5,000 policy
```

reescribir:

```text
MFA / four-eyes según threshold financiero configurable
(initial default ilustrativo: C$5,000, sujeto a policy).
```

El valor C$5,000 NO es un requisito fijo de arquitectura.

---

# 3. BLOQUEO DOCUMENTAL — limpiar las últimas formas abreviadas de Handoff/Return

`15_ERROR_AND_EDGE_CASES.md` ya aclara correctamente que las formas abreviadas son inválidas, pero queda una redacción operativa que puede confundirse con pseudoestados.

## 3.1 DRIVER_SUSPENDED_MID

Evitar:

```text
Operador ordena RETURN o HANDOFF
```

Escribir:

```text
Si existe custodia física, el operador:
A) autoriza la transición canónica a RETURN_REQUIRED, o
B) inicia una operación de `custody_handoffs`.

No existe un DELIVERY_STATUS llamado RETURN ni HANDOFF.
```

## 3.2 CONTROLLED_HANDOFF

Mantener explícitamente:

```text
CONTROLLED_HANDOFF no es DELIVERY_STATUS.
```

Durante un handoff:

- el Delivery conserva el estado logístico válido;
- la transferencia de custodia vive en `custody_handoffs`;
- solo el workflow de handoff cambia `HANDOFF_STATUS`.

---

# 4. CONSISTENCY CHECKS OBLIGATORIOS

Después de aplicar los tres parches anteriores, ejecutar comprobaciones mecánicas.

## Check A — Tablas API

Todas las filas de las tablas de `07_API_CONTRACTS.md` deben tener:

```text
12 columnas exactas
```

Resultado requerido:

```text
Filas API inválidas: 0
```

## Check B — Eventos API

Comparar todos los valores usados en columna `Events` contra el registro canónico.

Resultado requerido:

```text
Eventos API huérfanos: 0
```

## Check C — Thresholds

Buscar en `/docs`:

```text
15s
15 s
5 min
10 min
2 min
3 min
60s
60 s
C$5,000
Signed URL
3 intentos
+2km
+2 km
```

Cada match operativo debe cumplir una de estas condiciones:

A. Está marcado como `initial default / configurable policy`; o  
B. Es un ejemplo histórico/ilustrativo claramente etiquetado; o  
C. No representa una policy configurable.

No cambiar valores meramente porque aparezcan en ejemplos matemáticos/contables.

## Check D — Pseudoestados

No debe existir ninguna expresión operativa que trate:

```text
RETURN
HANDOFF
CONTROLLED_HANDOFF
DROPOFF
```

como `DELIVERY_STATUS`.

## Check E — Payout

Verificar explícitamente:

```text
/admin/payouts/{id}/approve
→ APPROVED
```

y que exista documentación de:

```text
APPROVED → PROCESSING → PAID / FAILED
```

solo por backend/worker/proveedor autorizado.

---

# PARTE B — PROMPT DE EJECUCIÓN PARA EL AGENTE

Eres el Agente de Ejecución de Güegüense.

El Cerebro auditó directamente el ZIP v1.7.

La arquitectura del producto está CONGELADA.

Tu tarea NO es rediseñar nada.

Debes aplicar únicamente las correcciones definidas en este mismo archivo.

## Archivos que puedes modificar

```text
README.md
/docs/*.md
```

No necesitas modificar un archivo si no está afectado.

## Prohibido

NO:

- iniciar Fase 1;
- crear `apps/`;
- crear `packages/`;
- crear `supabase/`;
- instalar dependencias;
- crear migrations;
- escribir código ejecutable;
- hacer deploy;
- cambiar stack;
- añadir módulos de producto;
- cambiar State Machine salvo para una corrección necesaria de consistencia con este parche.

## Orden de trabajo

1. Lee este archivo completo.
2. Lee `/docs/07_API_CONTRACTS.md`.
3. Lee `/docs/12_SECURITY_ARCHITECTURE.md`.
4. Lee `/docs/15_ERROR_AND_EDGE_CASES.md`.
5. Lee `/docs/08_DISPATCH_ENGINE.md`.
6. Lee `/docs/21_CANONICAL_ENUMS.md`.
7. Aplica exclusivamente los tres bloqueos.
8. Ejecuta los consistency checks.
9. Corrige cualquier fallo provocado por tus propios cambios.
10. Detente.

---

# 5. REPORTE FINAL OBLIGATORIO DEL AGENTE

Al terminar responde con:

## A. Archivos modificados

Lista exacta.

## B. Correcciones aplicadas

Explicar:

```text
Payout internal lifecycle
Configurable policies
Return/Handoff terminology
```

## C. Checks mecánicos

Debe mostrar:

```text
Filas API inválidas: 0
Eventos API huérfanos: 0
Pseudoestados operativos detectados: 0
```

## D. Payout check

Debe mostrar:

```text
/approve → APPROVED: OK
APPROVED → PROCESSING → PAID/FAILED documentado: OK
```

## E. Decisiones pendientes

Solo decisiones reales.

No inventar pendientes para evitar terminar la tarea.

## F. Estado

Terminar exactamente con:

```text
FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN
```

Después DETENTE.

---

# 6. Definition of Done v1.8

La siguiente auditoría del Cerebro será binaria.

Se aprobará Fase 0 si:

- [ ] `07_API_CONTRACTS.md` documenta lifecycle interno Payout.
- [ ] `/approve` sigue terminando únicamente en `APPROVED`.
- [ ] Thresholds restantes están marcados como configurables.
- [ ] Security no trata 2 min / 3 intentos / 15 min Signed URL como reglas fijas.
- [ ] Edge Cases no promete lock fijo de 2 min.
- [ ] `RETURN/HANDOFF` no aparecen como pseudoestados operativos.
- [ ] `CONTROLLED_HANDOFF` continúa desacoplado de `DELIVERY_STATUS`.
- [ ] Filas API inválidas = 0.
- [ ] Eventos API huérfanos = 0.
- [ ] No se añadió código ejecutable.
- [ ] Estado sigue candidato a aprobación.

No se abrirán nuevas mejoras opcionales en la siguiente revisión.

Solo una vulnerabilidad crítica comprobada podría bloquear la aprobación fuera de este checklist.

---

# FIN DEL PAQUETE ÚNICO v1.8
