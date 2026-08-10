# 08 — MOTOR DE DESPACHO Y ASIGNACIÓN (DISPATCH ENGINE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Algoritmo de Despacho, Selección de Candidatos, Scoring y Prevención de Asignación Doble  

---

## 1. Misión del Dispatch Engine

El **Dispatch Engine** es el componente de backend responsable de tomar una solicitud en estado `SEARCHING_DRIVER` y encontrar al motorizado verificado más óptimo en el menor tiempo posible, garantizando equidad, eficiencia y **cero duplicidades de asignación**.

---

## 2. Flujo de Pasos del Algoritmo

```text
┌───────────────────────────┐
│ Solicitud Creada          │
│ (SEARCHING_DRIVER)        │
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 1. Candidate Discovery    │ Buscar drivers en radio R (ej. 3km) con PostGIS.
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 2. Candidate Filtering    │ Excluir incompletos, suspendidos, ocupados o en timeout.
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 3. Candidate Scoring      │ Calcular Score = w1(Distancia) + w2(Rating) + w3(Equidad).
└─────────────┬─────────────┘
              │
              ▼
┌───────────────────────────┐
│ 4. Dispatch Round Offer   │ Emitir oferta al Top 1 (o Top N) con Timer atómico de 15s.
└─────────────┬─────────────┘
              │
      ┌───────┴───────┐
      │               │
  (Acepta)        (Rechaza / Timeout)
      │               │
      ▼               ▼
┌───────────┐   ┌───────────────────────────┐
│ Asignación│   │ 5. Expand Radius / Next   │ Incrementar radio +2km y repetir ronda.
│ Atómica   │   └───────────────────────────┘
└───────────┘
```

---

## 3. Detalle de Fases del Algoritmo

### 3.1 Fase 1: Candidate Discovery (Descubrimiento Espacial)
El sistema ejecuta una consulta geoespacial utilizando **PostGIS** para hallar todos los motorizados cuyo `current_location` se encuentre dentro del radio inicial $R$ (por defecto $3.0 \text{ km}$) respecto a las coordenadas de la sucursal de recogida:
```sql
SELECT driver_id, ST_DistanceSphere(current_location, pickup_location) AS distance_meters
FROM driver_presence
WHERE operational_state = 'AVAILABLE'
  AND ST_DWithin(current_location, pickup_location, 3000);
```

### 3.2 Fase 2: Candidate Filtering (Filtros de Elegibilidad)
De la lista de candidatos encontrados, se descartan automáticamente aquellos que:
1. No tengan estado de cuenta `VERIFIED` o `ACTIVE` en la tabla `drivers`.
2. Tengan la batería del teléfono por debajo del 15% (parámetro de seguridad opcional).
3. Hayan rechazado previamente esa misma entrega en una ronda anterior.
4. Tengan un documento vencido o una suspensión temporal.

### 3.3 Fase 3: Candidate Scoring (Puntuación de Candidatos)
Los candidatos filtrados se ordenan según una función de puntuación ponderada (**Score**):

$$\text{Score} = (W_{\text{dist}} \times S_{\text{dist}}) + (W_{\text{rating}} \times S_{\text{rating}}) + (W_{\text{fairness}} \times S_{\text{fairness}})$$

* **$S_{\text{dist}}$ (Distancia a Sucursal):** Puntuación inversamente proporcional al tiempo estimado de llegada (ETA).
* **$S_{\text{rating}}$ (Calificación):** Histórico de estrellas del conductor ($1.0$ a $5.0$).
* **$S_{\text{fairness}}$ (Distribución Justa):** Prioriza conductores que han recibido menos ofertas en la jornada actual para evitar la concentración de ingresos en pocos motorizados.

---

## 4. Estrategia de Ofertas y Temporización (Dispatch Rounds)

1. **Duración de la Oferta:** La oferta emitida al motorizado tiene una ventana de expiración estricta de **15 segundos**.
2. **Notificación:** Se transmite vía WebSocket Realtime + Push Notification con sonido prioritario.
3. **Manejo de Expiración:** Si transcurren los 15 segundos sin respuesta, la oferta cambia a `EXPIRED`, se penaliza levemente el score del driver por inactividad y el Dispatch Engine pasa de inmediato al siguiente candidato en el ranking.
4. **Expansión de Radio (Radius Expansion):**
   * **Ronda 1:** Radio $3 \text{ km}$ (Top 1 candidato).
   * **Ronda 2 (Si nadie acepta):** Radio $5 \text{ km}$ (Siguientes mejores candidatos).
   * **Ronda 3:** Radio $8 \text{ km}$.
   * **Escalación a Operador:** Si tras 3 rondas (aprox. 2 minutos) la entrega sigue sin ser aceptada, el sistema emite una alerta auditiva en el panel Admin/Operator para intervención manual.

---

## 5. SOLUCIÓN AL PROBLEMA CRÍTICO DE CONCURRENCIA (RACE CONDITION)

### El Escenario de Riesgo:
Dos motorizados ($Driver A$ y $Driver B$) reciben la oferta o ven la entrega disponible y presionan el botón **"ACEPTAR"** en sus respectivos teléfonos exactamente al mismo tiempo (diferencia de milisegundos).

### El Resultado Inaceptable (Bug Clásico):
Ambas peticiones leen el estado `SEARCHING_DRIVER`, ambas actualizan la base de datos y ambos motorizados salen manejando hacia el mismo restaurante para recoger el mismo paquete.

### La Solución Arquitectónica (Mecanismo Atómico de Locking en PostgreSQL):

Güegüense resuelve este problema mediante una **función almacenada atómica en PL/pgSQL** que utiliza bloqueo de fila pesimista (`FOR UPDATE`) con manejo instantáneo de conflicto.

```sql
CREATE OR REPLACE FUNCTION accept_delivery_offer(
    p_delivery_id UUID,
    p_driver_id UUID,
    p_offer_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_current_status delivery_status;
    v_assigned_driver UUID;
BEGIN
    -- 1. Intenta obtener un bloqueo pesimista exclusivo sobre la fila de la entrega.
    -- Si otra transacción ya la bloqueó, esta consulta espera o falla.
    SELECT status, driver_id INTO v_current_status, v_assigned_driver
    FROM deliveries
    WHERE id = p_delivery_id
    FOR UPDATE;

    -- 2. Validar que la entrega siga estando en estado SEARCHING_DRIVER
    IF v_current_status != 'SEARCHING_DRIVER' OR v_assigned_driver IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_ASSIGNED_OR_INVALID_STATE',
            'message', 'La entrega ya fue tomada por otro motorizado.'
        );
    END IF;

    -- 3. Transición de estado atómica
    UPDATE deliveries
    SET status = 'DRIVER_ASSIGNED',
        driver_id = p_driver_id,
        updated_at = NOW()
    WHERE id = p_delivery_id;

    -- 4. Actualizar presencia del motorizado a ASSIGNED
    UPDATE driver_presence
    SET operational_state = 'ASSIGNED'
    WHERE driver_id = p_driver_id;

    -- 5. Cancelar todas las demás ofertas abiertas para esta entrega
    UPDATE delivery_offers
    SET status = 'CANCELED'
    WHERE delivery_id = p_delivery_id AND id != p_offer_id;

    -- 6. Registrar evento inmutable de asignación
    INSERT INTO delivery_events (delivery_id, event_type, actor_id, actor_role)
    VALUES (p_delivery_id, 'DRIVER_ASSIGNED', p_driver_id, 'driver');

    RETURN jsonb_build_object(
        'success', true,
        'code', 'ASSIGNMENT_SUCCESSFUL',
        'message', 'Entrega adjudicada con éxito.'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Garantía de Comportamiento:
* Solamente **UNA** transacción logrará el `FOR UPDATE` y ejecutará la actualización.
* La segunda transacción concurrente leerá `v_current_status = 'DRIVER_ASSIGNED'` e inmediatamente retornará un error `409 Conflict` a la app del segundo motorizado con el mensaje *"La entrega ya fue tomada por otro motorizado"*, evitando de forma infalible la asignación doble.
