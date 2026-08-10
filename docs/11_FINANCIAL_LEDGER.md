# 11 — SISTEMA CONTABLE Y LEDGER FINANCIERO (FINANCIAL LEDGER)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Contabilidad Doble Entrada (Journal + Postings), Convención de Signos Firmados y Moneda NIO  

---

## 1. Convención de Signos Firmados y Regla de Suma Cero

Güegüense implementa una arquitectura de partida doble basada en **`ledger_transactions`** y **`ledger_postings`**.

### Convención Única de Signos:
* **`amount > 0` $\rightarrow$ DÉBITO (DEBIT)**
* **`amount < 0` $\rightarrow$ CRÉDITO (CREDIT)**

**Invariante de Suma Cero:** En toda transacción, la suma algebraica de sus `ledger_postings` DEBE SER EXACTAMENTE CERO ($\sum \text{amount} = 0$).

---

## 2. Ejemplos Canónicos de Asientos Contables (Transacciones Unificadas en `NIO`)

### 1. Entrega Normal Liquidada (C$ 100.00 Total) — Single Journal Transaction
* **Postings:**
  * `ASSET_BUSINESS_REC` $\rightarrow$ $+100.00 \text{ NIO}$ (Débito: Cuenta por cobrar al comercio)
  * `LIABILITY_DRIVER` $\rightarrow$ $-80.00 \text{ NIO}$ (Crédito: Cuenta por pagar al conductor)
  * `REVENUE_PLATFORM` $\rightarrow$ $-20.00 \text{ NIO}$ (Crédito: Ingreso comisión Güegüense)
  * **Suma total:** $+100.00 - 80.00 - 20.00 = 0.00 \text{ NIO}$

### 2. Cobro de Efectivo en Mano por Conductor (C$ 500.00 Total)
* **Postings:**
  * `ASSET_DRIVER_CASH_RECEIVABLE` $\rightarrow$ $+500.00 \text{ NIO}$ (Débito: Efectivo del servicio en poder del motorizado)
  * `ASSET_BUSINESS_REC` $\rightarrow$ $-500.00 \text{ NIO}$ (Crédito: Ajuste de cuenta por cobrar al negocio)
  * **Suma total:** $+500.00 - 500.00 = 0.00 \text{ NIO}$

### 3. Rendición de Cuentas de Efectivo (`CASH_SETTLEMENT` C$ 500.00)
* **Postings:**
  * `BANK_PLATFORM` $\rightarrow$ $+500.00 \text{ NIO}$ (Débito: Depósito recibido en banco plataforma)
  * `ASSET_DRIVER_CASH_RECEIVABLE` $\rightarrow$ $-500.00 \text{ NIO}$ (Crédito: Descarga de responsabilidad del conductor)
  * **Suma total:** $+500.00 - 500.00 = 0.00 \text{ NIO}$

### 4. Retiro de Ganancias de Conductor (`PAYOUT` C$ 1,000.00)
* **Postings:**
  * `LIABILITY_DRIVER` $\rightarrow$ $+1,000.00 \text{ NIO}$ (Débito: Cancelación de deuda con conductor)
  * `BANK_PLATFORM` $\rightarrow$ $-1,000.00 \text{ NIO}$ (Crédito: Salida de banco plataforma)
  * **Suma total:** $+1,000.00 - 1,000.00 = 0.00 \text{ NIO}$

### 5. Tarifa de Devolución (`RETURN_FEE` C$ 30.00)
* **Postings:**
  * `ASSET_BUSINESS_REC` $\rightarrow$ $+30.00 \text{ NIO}$ (Débito: Recargo cobrado al negocio)
  * `LIABILITY_DRIVER` $\rightarrow$ $-25.00 \text{ NIO}$ (Crédito: Acreditación al conductor por retorno)
  * `REVENUE_PLATFORM` $\rightarrow$ $-5.00 \text{ NIO}$ (Crédito: Margen plataforma)
  * **Suma total:** $+30.00 - 25.00 - 5.00 = 0.00 \text{ NIO}$
