# 08 — MOTOR DE DESPACHO Y ASIGNACIÓN (DISPATCH ENGINE)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Algoritmo de Despacho, Doble Invariante de Concurrencia, Google Routes API y Hardened Security Definer  

---

## 1. Misión y Doble Invariante de Concurrencia

El **Dispatch Engine** garantiza dos reglas arquitectónicas absolutas de forma simultánea (**Doble Invariante**):

1. **Invariante A (1 Delivery $\rightarrow$ 1 Driver):** Una entrega NUNCA puede tener más de 1 conductor activo.
2. **Invariante B (1 Driver $\rightarrow$ 1 Delivery):** Un conductor NUNCA puede tener más de 1 entrega comprometida en el MVP.

Se consideran **estados comprometidos del conductor**:
`DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP`, `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`, `RETURN_REQUIRED`, `RETURNING`. Un conductor en proceso de devolución sigue estando ocupado.

---

## 2. ORDEN ÚNICO DE LOCKS CONTRA DEADLOCKS

Para prevenir deadlocks y serializar la concurrencia, todas las funciones almacenadas de despacho aplican un **orden estricto de bloqueos pesimistas (`FOR UPDATE`)**:

```text
1. Bloquear registro en `public.driver_presence` / `public.drivers`.
2. Bloquear registro en `public.deliveries`.
3. Bloquear registro en `public.delivery_offers`.
```

---

## 3. FUNCIÓN ALMACENADA ATÓMICA DE ACEPTACIÓN (`accept_delivery_offer`)

```sql
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
BEGIN
    -- 1. Determinar identidad REAL desde la sesión autenticada (NUNCA confiar en payload del cliente)
    v_driver_id := auth.uid();
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Usuario no autenticado.' USING ERRCODE = '42501';
    END IF;

    -- 2. LOCK 1: Bloquear presencia del driver y verificar estados de cuenta/verificación
    SELECT verification_status, account_status INTO v_driver_verif_status, v_driver_acct_status
    FROM public.drivers
    WHERE id = v_driver_id
    FOR UPDATE;

    IF v_driver_verif_status != 'VERIFIED' OR v_driver_acct_status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_NOT_AUTHORIZED', 'message', 'Conductor no verificado o inactivo.');
    END IF;

    -- 3. INVARIANTE B: Verificar entregas comprometidas del conductor
    SELECT COUNT(*) INTO v_driver_active_count
    FROM public.deliveries
    WHERE driver_id = v_driver_id
      AND status IN ('DRIVER_ASSIGNED', 'TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'TO_DROPOFF', 'ARRIVED_DROPOFF', 'RETURN_REQUIRED', 'RETURNING');

    IF v_driver_active_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_ALREADY_BUSY', 'message', 'Ya tienes una entrega comprometida en curso.');
    END IF;

    -- 4. LOCK 2: Bloquear oferta y validar coincidencia de driver_id
    SELECT delivery_id, status, expires_at INTO v_delivery_id, v_offer_status, v_offer_expires_at
    FROM public.delivery_offers
    WHERE id = p_offer_id AND driver_id = v_driver_id
    FOR UPDATE;

    IF v_offer_status IS NULL OR v_offer_status != 'OPEN' OR v_offer_expires_at <= NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'OFFER_INVALID_OR_EXPIRED', 'message', 'La oferta ha expirado o no es válida.');
    END IF;

    -- 5. LOCK 3: Bloquear entrega e Invariante A
    SELECT status, driver_id INTO v_delivery_status, v_assigned_driver
    FROM public.deliveries
    WHERE id = v_delivery_id
    FOR UPDATE;

    IF v_delivery_status != 'SEARCHING_DRIVER' OR v_assigned_driver IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'DELIVERY_ALREADY_TAKEN', 'message', 'La entrega ya fue adjudicada a otro conductor.');
    END IF;

    -- 6. Transición de estado atómica
    UPDATE public.deliveries
    SET status = 'DRIVER_ASSIGNED', driver_id = v_driver_id, updated_at = NOW()
    WHERE id = v_delivery_id;

    UPDATE public.driver_presence SET operational_state = 'BUSY' WHERE driver_id = v_driver_id;
    UPDATE public.delivery_offers SET status = 'ACCEPTED' WHERE id = p_offer_id;
    UPDATE public.delivery_offers SET status = 'CANCELED' WHERE delivery_id = v_delivery_id AND id != p_offer_id;

    -- 7. Log de Evento
    INSERT INTO public.delivery_events (delivery_id, actor_type, actor_user_id, event_type)
    VALUES (v_delivery_id, 'USER', v_driver_id, 'DRIVER_ASSIGNED');

    RETURN jsonb_build_object('success', true, 'code', 'ASSIGNMENT_SUCCESSFUL', 'message', 'Entrega adjudicada con éxito.', 'delivery_id', v_delivery_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_delivery_offer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_delivery_offer(UUID) TO authenticated;
```
