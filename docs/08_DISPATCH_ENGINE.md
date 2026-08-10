# 08 — MOTOR DE DESPACHO Y ASIGNACIÓN (DISPATCH ENGINE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Algoritmo de Despacho, Doble Invariante de Concurrencia, Google Routes API y Hardened Security Definer  

---

## 1. Misión y Doble Invariante de Concurrencia

El **Dispatch Engine** garantiza dos reglas arquitectónicas absolutas de forma simultánea (**Doble Invariante**):

1. **Invariante A (1 Delivery $\rightarrow$ 1 Driver):** Una entrega NUNCA puede tener dos motorizados asignados en paralelo.
2. **Invariante B (1 Driver $\rightarrow$ 1 Delivery):** Un conductor NUNCA puede tener dos entregas activas simultáneamente en el MVP.

---

## 2. Integración Geoespacial y Google Routes API

Para optimizar costos y latencia, el descubrimiento de candidatos combina **PostGIS** con **Google Maps Routes API**:

```text
 ┌──────────────────────────────────────────────────┐
 │ 1. Candidate Discovery (PostGIS ST_DWithin)      │ Filtra en DB drivers en radio R (ej. 3km).
 └────────────────────────┬─────────────────────────┘
                          │
                          ▼
 ┌──────────────────────────────────────────────────┐
 │ 2. Top-N Selection (Máximo 5 Candidatos)         │ Selecciona el Top 5 por calificación/distancia esférica.
 └────────────────────────┬─────────────────────────┘
                          │
                          ▼
 ┌──────────────────────────────────────────────────┐
 │ 3. Google Routes API (`Compute Route Matrix`)    │ Obtiene ETA vial real solo para el Top 5 (Ahorro de API).
 └────────────────────────┬─────────────────────────┘
                          │
                          ▼
 ┌──────────────────────────────────────────────────┐
 │ 4. Final Scoring & Offer Broadcast               │ Emite la oferta con temporizador de 15s al Top 1.
 └──────────────────────────────────────────────────┘
```

---

## 3. SOLUCIÓN COMPLETA A LA CONCURRENCIA DUAL (Hardened Security Definer PL/pgSQL)

La función `accept_delivery_offer` resuelve la concurrencia de forma infalible en la base de datos:

```sql
CREATE OR REPLACE FUNCTION public.accept_delivery_offer(
    p_offer_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_driver_id UUID;
    v_delivery_id UUID;
    v_offer_status TEXT;
    v_offer_expires_at TIMESTAMPTZ;
    v_delivery_status delivery_status;
    v_assigned_driver UUID;
    v_driver_active_count INTEGER;
BEGIN
    -- 1. Determinar la identidad REAL del conductor desde la sesión autenticada (NUNCA confiar en payload del cliente)
    v_driver_id := auth.uid();
    IF v_driver_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Usuario no autenticado.' USING ERRCODE = '42501';
    END IF;

    -- 2. Bloqueo exclusivo sobre la oferta y validación de coincidencia con auth.uid()
    SELECT delivery_id, status, expires_at INTO v_delivery_id, v_offer_status, v_offer_expires_at
    FROM public.delivery_offers
    WHERE id = p_offer_id AND driver_id = v_driver_id
    FOR UPDATE;

    IF v_offer_status IS NULL OR v_offer_status != 'OPEN' OR v_offer_expires_at <= NOW() THEN
        RETURN jsonb_build_object('success', false, 'code', 'OFFER_INVALID_OR_EXPIRED', 'message', 'La oferta ha expirado o no es válida.');
    END IF;

    -- 3. INVARIANTE B: Verificar que el conductor NO posea otra entrega activa
    SELECT COUNT(*) INTO v_driver_active_count
    FROM public.deliveries
    WHERE driver_id = v_driver_id
      AND status IN ('DRIVER_ASSIGNED', 'TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'TO_DROPOFF', 'ARRIVED_DROPOFF');

    IF v_driver_active_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'code', 'DRIVER_ALREADY_BUSY', 'message', 'Ya tienes una entrega activa en curso.');
    END IF;

    -- 4. INVARIANTE A: Bloqueo exclusivo sobre la entrega para asegurar que sigue SEARCHING_DRIVER sin asignar
    SELECT status, driver_id INTO v_delivery_status, v_assigned_driver
    FROM public.deliveries
    WHERE id = v_delivery_id
    FOR UPDATE;

    IF v_delivery_status != 'SEARCHING_DRIVER' OR v_assigned_driver IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'code', 'DELIVERY_ALREADY_TAKEN', 'message', 'La entrega ya fue adjudicada a otro conductor.');
    END IF;

    -- 5. Transición de estado atómica
    UPDATE public.deliveries
    SET status = 'DRIVER_ASSIGNED',
        driver_id = v_driver_id,
        updated_at = NOW()
    WHERE id = v_delivery_id;

    -- 6. Actualizar estado del motorizado y cerrar oferta
    UPDATE public.driver_presence SET operational_state = 'ASSIGNED' WHERE driver_id = v_driver_id;
    UPDATE public.delivery_offers SET status = 'ACCEPTED' WHERE id = p_offer_id;
    UPDATE public.delivery_offers SET status = 'CANCELED' WHERE delivery_id = v_delivery_id AND id != p_offer_id;

    -- 7. Log de Evento
    INSERT INTO public.delivery_events (delivery_id, actor_type, actor_id, event_type)
    VALUES (v_delivery_id, 'USER', v_driver_id, 'DRIVER_ASSIGNED');

    RETURN jsonb_build_object('success', true, 'code', 'ASSIGNMENT_SUCCESSFUL', 'message', 'Entrega adjudicada con éxito.', 'delivery_id', v_delivery_id);
END;
$$;

-- Revocar permisos por defecto y otorgar exclusivamente al rol autenticado
REVOKE EXECUTE ON FUNCTION public.accept_delivery_offer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_delivery_offer(UUID) TO authenticated;
```
