# 10 — MOTOR DE PRECIOS Y AJUSTES (PRICING ENGINE)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Tarificación Dinámica, Precios Cotizados vs. Finales y Ajustes  

---

## 1. Distinción Entre `quoted_price` y `final_price`

Un error común es asumir que el precio cotizado inicialmente es igual al precio cobrado al finalizar la entrega. Güegüense distingue estrictamente dos valores:

1. **`quoted_price`:** Tarifa estimada calculada al crear la cotización (`QUOTED`), basada en la distancia teórica y tiempo estimado original.
2. **`final_price`:** Monto total real a liquidar tras concluir la entrega, que resulta de la consolidación de `quoted_price` más o menos la lista de **Ajustes de Tarifa (`pricing_adjustments`)**.

$$\text{final\_price} = \text{quoted\_price} + \sum \text{pricing\_adjustments}$$

---

## 2. Entidad de Ajustes de Tarifa (`pricing_adjustments`)

Cualquier variación en el costo del viaje genera una entrada transparente de ajuste vinculada a la entrega:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   TIPOS DE AJUSTES DE TARIFA (`PRICING_ADJUSTMENT_TYPE`)│
├─────────────────┬──────────────────────────────────────────────────────┤
│ `WAITING_FEE`   │ Cobro por tiempo de espera excedido en sucursal (>5m)│
├─────────────────┼──────────────────────────────────────────────────────┤
│ `RETURN_FEE`    │ Tarifa adicional por retorno de custodia al comercio │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `CANCEL_FEE`    │ Penalización por cancelación tardía                  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `DISCOUNT`      │ Promociones o cupones aplicados al negocio           │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `SUBSIDY`       │ Bonificación o subsidio aportado por Güegüense       │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `MANUAL_ADJUST` │ Ajuste manual de arbitraje autorizado por Admin      │
└─────────────────┴──────────────────────────────────────────────────────┘
```

---

## 3. Reconciliación Financiera

La fórmula de reconciliación contable exacta al finalizar el servicio es:

$$\text{final\_price} = \text{driver\_earning} + \text{platform\_fee} \pm \text{ajustes\_terceros}$$

* **Tiempo de Espera (`WAITING_FEE`):** Acredita 100% de la tarifa de espera al conductor.
* **Tarifa de Retorno (`RETURN_FEE`):** Se suma al `final_price` cobrado al negocio y se acredita al motorizado por el trayecto de regreso a la sucursal.
