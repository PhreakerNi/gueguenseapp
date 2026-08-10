# 10 — MOTOR DE PRECIOS Y TARIFAS (PRICING ENGINE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Tarificación Dinámica, Reglas Configurables y Cotización Backend  

---

## 1. Regla de Oro del Motor de Precios

**EL CÁLCULO DE PRECIOS NUNCA SE EJECUTA O HARDCODEA EN LAS APLICACIONES MÓVILES CLIENTES.**  
El cálculo oficial es ejecutado **exclusivamente en el Backend** (Supabase Edge Function / PostgreSQL Stored Procedure). Las aplicaciones cliente solo muestran la cotización obtenida y firmada temporalmente.

---

## 2. Fórmula General de Tarificación

El precio final de un envío se calcula mediante la evaluación de las siguientes variables configurables almacenadas en la base de datos:

$$\text{Precio Final} = \max\left(\text{Tarifa Mínima}, \left(\text{Base} + \text{Costo Distancia} + \text{Costo Tiempo} + \text{Recargo Zona} + \text{Recargo Tipo} + \text{Costo Espera}\right) \times \text{Factor Demanda} - \text{Descuentos}\right)$$

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        VARIABLES DE COTIZACIÓN                         │
├─────────────────┬──────────────────────────────────────────────────────┤
│ Tarifa Base     │ Monto fijo de arranque del servicio (ej. C$ 35.00)   │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Costo Distancia │ Precio por km recorrido (ej. C$ 8.00 / km extra)     │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Costo Tiempo    │ Tarifa por minuto estimado en tráfico (ej. C$ 1.50)  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Recargo Zona    │ Sobrecosto por entrega en zonas periféricas / riesgo │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Recargo Paquete │ Ajuste por fragilidad, peso o volumen especial       │
├─────────────────┼──────────────────────────────────────────────────────┤
│ Factor Demanda  │ Multiplicador dinámico por lluvia / hora pico (1.0x) │
└─────────────────┴──────────────────────────────────────────────────────┘
```

---

## 3. Desglose Detallado de Componentes

### 3.1 Tarifa Base y Mínima
* `base_fee`: Cobertura básica de los primeros $X \text{ km}$ (ej: C$ 35.00 por los primeros $2.0 \text{ km}$).
* `minimum_fee`: El precio final cotizado nunca podrá ser inferior a esta suma (ej: C$ 35.00).

### 3.2 Distancia y Tiempo
* `cost_per_km`: Se aplica a partir del kilómetro adicional al umbral base. La distancia se mide siguiendo la ruta vial real provista por Google Maps Directions API, no en línea recta.
* `cost_per_minute`: Compensa trayectos congestionados en horas pico.

### 3.3 Recargos por Zona (`pricing_zones`)
Las zonas delimitadas por polígonos PostGIS pueden aplicar un ajuste fijo o porcentual.
* *Ejemplo:* Zona Periférica Norte $\rightarrow + \text{C\$ 20.00}$ de recargo para compensar el retorno en vacío del motorizado.

### 3.4 Cobro por Tiempo de Espera en Sucursal (`waiting_time_fee`)
Si el negocio no tiene el pedido listo a la llegada del conductor:
* Primeros 5 minutos de espera: **Gratis**.
* A partir del minuto 6: Se cobra una tarifa adicional por minuto (ej: C$ 3.00 / min) que se acredita 100% al motorizado.

---

## 4. Firma y Expiración de Cotizaciones

1. Cuando la app del negocio solicita una cotización (`POST /api/v1/quotes`), el backend retorna el precio calculado junto con un `quote_id` firmado y un timestamp de expiración de **5 minutos**.
2. Al presionar "Solicitar Motorizado", la app debe enviar el `quote_id`. El backend valida que la cotización no haya expirado para evitar desacuerdos si las tarifas o zonas cambian durante la preparación.
