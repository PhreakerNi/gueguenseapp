# 08 — MOTOR DE DESPACHO Y ASIGNACIÓN (DISPATCH ENGINE)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Algoritmo de Despacho, Doble Invariante de Concurrencia, Google Routes API y Hardened Security Definer  

---

## 1. Misión y Doble Invariante de Concurrencia

El **Dispatch Engine** garantiza simultáneamente:
1. **Invariante A (1 Delivery $\rightarrow$ 1 Driver):** Máximo 1 conductor activo por entrega.
2. **Invariante B (1 Driver $\rightarrow$ 1 Delivery):** Máximo 1 entrega comprometida por conductor (`DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP`, `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`, `RETURN_REQUIRED`, `RETURNING`).

---

## 2. ORDEN ÚNICO DE LOCKS CONTRA DEADLOCKS (TEXTO Y CÓDIGO UNIFICADOS)

Para prevenir deadlocks y serializar la concurrencia, todas las funciones de despacho aplican el **mismo orden estricto de bloqueos pesimistas (`FOR UPDATE`)**:

```text
1. Bloquear registro en `public.driver_presence` / `public.drivers`.
2. Bloquear registro en `public.deliveries`.
3. Bloquear registro en `public.delivery_offers`.
```

---

## 3. BORRADOR DE DISEÑO / PSEUDOCÓDIGO NO EJECUTABLE (`accept_delivery_offer`)

*(Nota: La función PL/pgSQL ejecutable definitiva se compondrá y probará formalmente en la Fase 4).*

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
BEGIN
    -- 1. Determinar identidad REAL desde la sesión autenticada
    v_driver_id := auth.uid();
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Usuario no autenticado.' USING ERRCODE = '42501';
    END IF;

    -- 2. LOCK 1: Bloquear presencia y conductor (DRIVER / DRIVER_PRESENCE)
    SELECT d.verification_status, d.account_status, dp.operational_state
    INTO v_driver_verif_status, v_driver_acct_status, v_operational_state
    FROM public.drivers d
    JOIN public.driver_presence dp ON dp.driver_id = d.id
    WHERE d.id = v_driver_id
    FOR UPDATE OF dp;

    IF v_driver_verif_status != 'VERIFIED' OR v_driver_acct_status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_AUTHORIZED', 'message', 'Conductor no verificado o inactivo.');
    END IF;

    IF v_operational_state NOT IN ('AVAILABLE', 'OFFERED') THEN
        RETURN jsonb_build_object('success', false, 'code', 'INVALID_OPERATIONAL_STATE', 'message', 'Estado operacional no disponible para aceptar viajes.');
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
    FROM public.deliveries
    WHERE id = v_delivery_id
    FOR UPDATE;

    IF v_delivery_status != 'SEARCHING_DRIVER' OR v_assigned_driver IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'DELIVERY_ALREADY_TAKEN', 'message', 'La entrega ya fue adjudicada a otro conductor.');
    END IF;

    -- 4. LOCK 3: Bloquear oferta (OFFER)
    SELECT status, expires_at INTO v_offer_status, v_offer_expires_at
    FROM public.delivery_offers
    WHERE id = p_offer_id AND driver_id = v_driver_id
    FOR UPDATE;

    IF v_offer_status IS NULL OR v_offer_status != 'OPEN' OR v_offer_expires_at <= NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'OFFER_INVALID_OR_EXPIRED', 'message', 'La oferta ha expirado o no es válida.');
    END IF;

    -- 5. Transición de estado atómica
    UPDATE public.deliveries SET status = 'DRIVER_ASSIGNED', driver_id = v_driver_id, updated_at = NOW() WHERE id = v_delivery_id;
    UPDATE public.driver_presence SET operational_state = 'BUSY' WHERE driver_id = v_driver_id;
    UPDATE public.delivery_offers SET status = 'ACCEPTED' WHERE id = p_offer_id;
    UPDATE public.delivery_offers SET status = 'CANCELED' WHERE delivery_id = v_delivery_id AND id != p_offer_id;

    -- 6. Logs de Eventos Auditarles (OFFER_ACCEPTED + DRIVER_ASSIGNED)
    INSERT INTO public.delivery_events (delivery_id, actor_type, actor_user_id, event_type) VALUES (v_delivery_id, 'USER', v_driver_id, 'OFFER_ACCEPTED');
    INSERT INTO public.delivery_events (delivery_id, actor_type, actor_user_id, event_type) VALUES (v_delivery_id, 'USER', v_driver_id, 'DRIVER_ASSIGNED');

    RETURN jsonb_build_object('success', true, 'code', 'ASSIGNMENT_SUCCESSFUL', 'message', 'Entrega adjudicada con éxito.', 'delivery_id', v_delivery_id);
END;
$$;
```
