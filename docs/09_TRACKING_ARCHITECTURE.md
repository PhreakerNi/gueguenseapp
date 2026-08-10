# 09 — ARQUITECTURA DE TRACKING Y POSICIONAMIENTO (TRACKING ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Rastreabilidad GPS, Geoespacialidad, Realtime y Privacidad de Ubicación  

---

## 1. Visión General del Sistema de Tracking

El sistema de tracking de Güegüense permite transmitir y visualizar la posición exacta del motorizado desde el momento en que acepta una entrega hasta que valida el PIN con el cliente final, garantizando alto rendimiento, bajo consumo de batería y privacidad rigurosa.

```text
 ┌───────────────────────────┐
 │ App Driver (Background)   │ Obtiene GPS (Frecuencia adaptable: 3s a 10s).
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │ Supabase Realtime Channel │ Transmisión WebSocket ultraliviana (Broadcast).
 └───────┬───────────────┬───┘
         │               │
         ▼               ▼
┌──────────────────┐  ┌──────────────────┐
│ App Negocio      │  │ Tracking Web     │ Renderizan la animación del marcador.
└──────────────────┘  └──────────────────┘
         │
         ▼ (Batch Persist cada 15s / 100m)
┌────────────────────────────────────────┐
│ PostgreSQL (delivery_tracking_points)  │ Persistencia de auditoría histórica.
└────────────────────────────────────────┘
```

---

## 2. Parámetros Técnicos de Captura GPS

| Parámetro | Valor En Ruta Activa (`TO_PICKUP`, `TO_DROPOFF`) | Valor En Espera (`AVAILABLE`) |
| :--- | :--- | :--- |
| **Frecuencia de Muestreo** | Cada 3 a 5 segundos | Cada 30 a 60 segundos |
| **Filtro de Distancia (Distance Filter)** | 5 metros mínimo de movimiento | 25 metros mínimo de movimiento |
| **Precisión Esperada (Accuracy)** | $< 15 \text{ metros}$ | $< 50 \text{ metros}$ |
| **Captura en Segundo Plano (Background)** | Habilitada obligatoriamente (Android Location Service / iOS Always Location) | Desactivada o mínima cuando se minimiza la app |

---

## 3. Estados de Calidad de la Ubicación

El sistema clasifica visualmente la señal GPS del motorizado en 4 estados para prevenir diagnósticos erróneos ante fallas de red:

```text
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│     LIVE     │───► │   DELAYED    │───► │    STALE     │───► │ UNAVAILABLE  │
│(Ping < 10s)  │     │(Ping 10-30s) │     │(Ping 30-120s)│     │(Ping > 120s) │
└──────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

1. **`LIVE` (Señal Óptima - Indicador Verde):** Posición actualizada hace menos de 10 segundos. Movimiento fluido.
2. **`DELAYED` (Retraso Leve - Indicador Amarillo):** Ping recibido hace entre 10 y 30 segundos. Red móvil inestable.
3. **`STALE` (Ubicación Desactualizada - Indicador Naranja):** Sin actualización por 30 a 120 segundos. Se despliega la advertencia: *"Última ubicación registrada hace X segundos"*. NUNCA se simula la posición actual.
4. **`UNAVAILABLE` (Sin Señal / Perdidó GPS - Indicador Gris):** Sin ping por más de 2 minutos. Se alerta al operador para verificar si el teléfono del driver se apago o perdió señal.

---

## 4. Cálculo de ETA y Matriz de Rutas

* **Motor de ETA:** Se utiliza la API de Google Maps Distance Matrix / Directions combinada con la velocidad promedio informada por el GPS del motorizado.
* **Geofencing Automático de Llegada:**
  * Al aproximarse a menos de **50 metros** de la sucursal o del cliente, el backend detecta el evento de entrada al geofence e hiper-notifica el arribo al negocio o destinatario.

---

## 5. Privacidad y Seguridad Geoespacial

1. **Privacidad Fuera de Servicio:** Cuando el conductor está en estado `OFFLINE`, la capturación de GPS se detiene por completo. Queda estrictamente prohibido rastrear al usuario fuera de su horario disponible.
2. **Expiración de Tokens de Tracking Web:** El acceso del cliente final vía token web expira de inmediato al pasar la entrega a estado `DELIVERED` o `CANCELED`. Intentar ingresar a la URL posterior al viaje retorna un mensaje de "Entrega Finalizada" sin mostrar la posición actual del conductor.
3. **Política de Retención de Datos Puntos GPS:** Los puntos de ruta detallados de la tabla `delivery_tracking_points` se purgan o comprimen a centroides históricos tras 30 días para proteger la privacidad del conductor y optimizar el almacenamiento en base de datos.
