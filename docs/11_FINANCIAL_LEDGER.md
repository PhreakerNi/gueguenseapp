# 11 — SISTEMA CONTABLE Y LEDGER FINANCIERO (FINANCIAL LEDGER)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Contabilidad Doble Entrada (Journal + Postings), 10 Ejemplos de Asientos y Moneda NIO  

---

## 1. Arquitectura de Partida Doble (Journal + Postings)

Güegüense implementa una arquitectura contable de partida doble compuesta por **Transacciones (`ledger_transactions`)** y **Asientos (`ledger_postings`)**.

**Regla de Suma Cero (Zero-Sum Invariant):** En toda transacción, la suma algebraica de sus `ledger_postings` DEBE SER EXACTAMENTE CERO ($\sum \text{amount} = 0$).

---

## 2. Ejemplos Completos de Asientos Contables (10 Escenarios con Moneda `NIO`)

### 1. Entrega Normal Liquidada (C$ 100.00 Total)
* **Débito:** `ASSET_BUSINESS_REC` $-100.00 \text{ NIO}$
* **Crédito:** `LIABILITY_DRIVER` $+80.00 \text{ NIO}$
* **Crédito:** `REVENUE_PLATFORM` $+20.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)

### 2. Ganancia del Conductor (`DRIVER_EARNING`)
* **Débito:** `ASSET_BUSINESS_REC` $-80.00 \text{ NIO}$
* **Crédito:** `LIABILITY_DRIVER` $+80.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)

### 3. Ingreso por Comisión Güegüense (`PLATFORM_REVENUE`)
* **Débito:** `ASSET_BUSINESS_REC` $-20.00 \text{ NIO}$
* **Crédito:** `REVENUE_PLATFORM` $+20.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)

### 4. Tarifa de Espera Excedida (`WAITING_FEE` C$ 15.00)
* **Débito:** `ASSET_BUSINESS_REC` $-15.00 \text{ NIO}$
* **Crédito:** `LIABILITY_DRIVER` $+15.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)

### 5. Tarifa de Devolución (`RETURN_FEE` C$ 30.00)
* **Débito:** `ASSET_BUSINESS_REC` $-30.00 \text{ NIO}$
* **Crédito:** `LIABILITY_DRIVER` $+25.00 \text{ NIO}$
* **Crédito:** `REVENUE_PLATFORM` $+5.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)

### 6. Efectivo Recaudado por Conductor en Destino (`CASH_COLLECTED` C$ 500.00)
* **Débito:** `ASSET_CASH_HELD` $+500.00 \text{ NIO}$ (El conductor sostiene el efectivo)
* **Crédito:** `ASSET_BUSINESS_REC` $-500.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)

### 7. Liquidación de Efectivo (`CASH_SETTLEMENT` C$ 500.00)
* **Débito:** `BANK_PLATFORM` $+500.00 \text{ NIO}$
* **Crédito:** `ASSET_CASH_HELD` $-500.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)

### 8. Retiro de Ganancias de Conductor (`PAYOUT` C$ 1,000.00)
* **Débito:** `LIABILITY_DRIVER` $-1,000.00 \text{ NIO}$
* **Crédito:** `BANK_PLATFORM` $+1,000.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)

### 9. Reembolso a Comercio (`REFUND` C$ 100.00)
* **Débito:** `REVENUE_PLATFORM` $-100.00 \text{ NIO}$
* **Crédito:** `ASSET_BUSINESS_REC` $+100.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)

### 10. Ajuste Manual Administrativo (`MANUAL_ADJUSTMENT` C$ 50.00)
* **Débito:** `BANK_PLATFORM` $-50.00 \text{ NIO}$
* **Crédito:** `LIABILITY_DRIVER` $+50.00 \text{ NIO}$ (Suma: $0.00 \text{ NIO}$)
