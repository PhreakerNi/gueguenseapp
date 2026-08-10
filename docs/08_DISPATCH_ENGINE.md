# 08 — MOTOR DE DESPACHO Y ASIGNACIÓN (DISPATCH ENGINE)

**Proyecto:** Güegüense  
**Versión:** 1.8.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Algoritmo Completo de Despacho (13 Pasos), Motor de Scoring, Compute Route Matrix Top-N y Mutex `driver_presence`  

---

## 1. Algoritmo Canónico de Búsqueda, Filtrado y Scoring (13 Pasos)

El **Dispatch Engine** ejecuta un pipeline optimizado para seleccionar al candidato ideal evitando llamadas masivas e innecesarias a APIs de mapas externas:

```text
 ┌───────────────────────────┐
 │ 1. Solicitud de Entrega   │ Delivery pasa a `SEARCHING_DRIVER`.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ 2. PostGIS Candidate Disc.│ Búsqueda por radio espacial $R$ (ej. 5km initial default / configurable policy).
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ 3. Filtros Elegibilidad   │ (1) `verification_status = VERIFIED`, (2) `account_status = ACTIVE`,
 └─────────────┬─────────────┘ (3) `operational_state = AVAILABLE`, (4) GPS Freshness valid,
               │               (5) 0 entregas comprometidas en curso (Invariante B).
               ▼
 ┌───────────────────────────┐
 │ 4. Coarse Ranking (Dist.) │ Ordenamiento rápido por distancia Haversine/PostGIS.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ 5. Selección Top-N        │ Se toman los Top-N mejores candidatos (ej. Top 5 initial default / configurable policy).
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ 6. Google Compute Route   │ Se invoca Google Routes API **ÚNICAMENTE para el Top-N**.
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ 7. Final Scoring & Weights│ Cálculo de puntuación combinando ETA vial, distancia real,
 └─────────────┬─────────────┘ frescura GPS, rating y balance de equidad (*fairness*).
               │
               ▼
 ┌───────────────────────────┐
 │ 8. Emisión de Oferta      │ Se inserta en `delivery_offers` con status `OPEN`
 └───────────────────────────┘ (15s initial default / configurable policy).
```

### 13 Pasos del Pipeline:
1. **Eligibility Filter:** Filtra conductores en regla (`VERIFIED`, `ACTIVE`, `AVAILABLE`).
2. **PostGIS Candidate Discovery:** Búsqueda espacial rápida en base de datos.
3. **Freshness Filter:** Descarte de señales GPS desactualizadas.
4. **Coarse Ranking:** Ordenamiento preliminar por distancia geométrica.
5. **Top-N Candidates:** Selección de un subconjunto acotado para minimizar costos API.
6. **Google Compute Route Matrix:** Matriz de tiempos y rutas viales reales solo para el Top-N.
7. **Final Scoring:** Matriz de puntuación ponderada.
8. **Fairness / Workload Balancing:** Distribución equitativa entre conductores activos.
9. **Dispatch Round:** Envío de oferta en rondas individuales.
10. **Offer Expiration:** Expiración de oferta tras superar timeout (`OFFER_EXPIRED`, `15s initial default / configurable policy`).
11. **Radius Expansion:** Expansión del radio de búsqueda (+2km `initial default / configurable policy`) si la primera ronda vence.
12. **No-Driver Fallback:** Re-intentos programados tras alcanzar el radio máximo.
13. **Operator Escalation:** Alerta sonora y visual en el panel de Admin si transcurren 10 minutos (`initial default / configurable policy`) sin adjudicación.

---

## 2. Mutex Operacional y ORDEN ÚNICO DE LOCKS PESIMISTAS

```text
1. Bloquear mutex operacional en `public.driver_presence` (FOR UPDATE).
2. Leer y verificar `drivers.verification_status`, `drivers.account_status` y `location_updated_at`.
3. Bloquear registro de entrega en `public.deliveries` (FOR UPDATE).
4. Bloquear registro de oferta en `public.delivery_offers` (FOR UPDATE).
```

---

## 3. BORRADOR DE DISEÑO / PSEUDOCÓDIGO NO EJECUTABLE (`accept_delivery_offer`)

```sql
-- BORRADOR DE DISEÑO / PSEUDOCÓDIGO NO EJECUTABLE
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(
    p_offer_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_driver_id UUID;
    v_delivery_id UUID;
    v_offer_status TEXT;
    v_offer_expires_at TIMESTAMPTZ;
    v_delivery_status public.delivery_status;
    v_assigned_driver UUID;
    v_driver_active_count INTEGER;
    v_driver_verif_status TEXT;
    v_driver_acct_status TEXT;
    v_operational_state TEXT;
    v_location_updated_at TIMESTAMPTZ;
BEGIN
    -- 1. Identidad REAL desde la sesión autenticada
    v_driver_id := auth.uid();
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Usuario no autenticado.' USING ERRCODE = '42501';
    END IF;

    -- 2. LOCK 1: Bloquear mutex operacional del conductor (driver_presence)
    SELECT operational_state, location_updated_at 
    INTO v_operational_state, v_location_updated_at
    FROM public.driver_presence
    WHERE driver_id = v_driver_id
    FOR UPDATE;

    IF v_operational_state NOT IN ('AVAILABLE', 'OFFERED') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_OPERATIONAL_STATE', 'message', 'Conductor fuera de servicio o en estado no elegible.');
    END IF;

    -- Validar frescura GPS del conductor (máximo 3 minutos initial default / configurable policy)
    IF v_location_updated_at IS NULL OR v_location_updated_at < (NOW() - INTERVAL '3 minutes') THEN
        RETURN jsonb_build_object('success', false, 'code', 'STALE_DRIVER_LOCATION', 'message', 'Señalización GPS desactualizada. Por favor actualice su ubicación.');
    END IF;

    -- Leer y verificar expediente drivers
    SELECT verification_status, account_status INTO v_driver_verif_status, v_driver_acct_status
    FROM public.drivers WHERE id = v_driver_id;

    IF v_driver_verif_status != 'VERIFIED' OR v_driver_acct_status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_AUTHORIZED', 'message', 'Conductor no verificado o inactivo.');
    END IF;

    -- INVARIANTE B: Verificar entregas comprometidas del conductor
    SELECT COUNT(*) INTO v_driver_active_count
    FROM public.deliveries
    WHERE driver_id = v_driver_id
      AND status IN ('DRIVER_ASSIGNED', 'TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'TO_DROPOFF', 'ARRIVED_DROPOFF', 'RETURN_REQUIRED', 'RETURNING');

    IF v_driver_active_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_ALREADY_BUSY', 'message', 'Ya tienes una entrega comprometida en curso.');
    END IF;

    -- Obtener delivery_id de la oferta
    SELECT delivery_id INTO v_delivery_id FROM public.delivery_offers WHERE id = p_offer_id AND driver_id = v_driver_id;
    IF v_delivery_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'OFFER_NOT_FOUND', 'message', 'Oferta no encontrada.');
    END IF;

    -- 3. LOCK 2: Bloquear entrega (DELIVERY)
    SELECT status, driver_id INTO v_delivery_status, v_assigned_driver
    FROM public.deliveries WHERE id = v_delivery_id FOR UPDATE;

    IF v_delivery_status != 'SEARCHING_DRIVER' OR v_assigned_driver IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'DELIVERY_ALREADY_TAKEN', 'message', 'La entrega ya fue adjudicada a otro conductor.');
    END IF;

    -- 4. LOCK 3: Bloquear oferta (OFFER)
    SELECT status, expires_at INTO v_offer_status, v_offer_expires_at
    FROM public.delivery_offers WHERE id = p_offer_id AND driver_id = v_driver_id FOR UPDATE;

    IF v_offer_status IS NULL OR v_offer_status != 'OPEN' OR v_offer_expires_at <= NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'OFFER_INVALID_OR_EXPIRED', 'message', 'La oferta ha expirado o no es válida.');
    END IF;

    -- 5. Transición de estado atómica
    UPDATE public.deliveries SET status = 'DRIVER_ASSIGNED', driver_id = v_driver_id, updated_at = NOW() WHERE id = v_delivery_id;
    UPDATE public.driver_presence SET operational_state = 'BUSY' WHERE driver_id = v_driver_id;
    UPDATE public.delivery_offers SET status = 'ACCEPTED' WHERE id = p_offer_id;
    UPDATE public.delivery_offers SET status = 'CANCELED' WHERE delivery_id = v_delivery_id AND id != p_offer_id;

    -- 6. Logs de Eventos Auditables
    INSERT INTO public.delivery_events (delivery_id, actor_type, actor_user_id, event_type) VALUES (v_delivery_id, 'USER', v_driver_id, 'OFFER_ACCEPTED');
    INSERT INTO public.delivery_events (delivery_id, actor_type, actor_user_id, event_type) VALUES (v_delivery_id, 'USER', v_driver_id, 'DRIVER_ASSIGNED');

    RETURN jsonb_build_object('success', true, 'code', 'ASSIGNMENT_SUCCESSFUL', 'message', 'Entrega adjudicada con éxito.', 'delivery_id', v_delivery_id);
EXCEPTION
    WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_ALREADY_BUSY', 'message', 'Violación de concurrencia: Ya posees una entrega comprometida.');
END;
$$;

-- Permisos de Ejecución Restringidos
REVOKE EXECUTE ON FUNCTION public.accept_delivery_offer(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_delivery_offer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.accept_delivery_offer(UUID) TO authenticated;
```
