# 11 — SISTEMA CONTABLE Y LEDGER FINANCIERO (FINANCIAL LEDGER)

**Proyecto:** Güegüense  
**Versión:** 1.6.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Contabilidad Doble Entrada (Journal + Postings), Convención de Signos Firmados, Suma Cero, Ciclo Payouts y Moneda NIO

---

## 1. Convención de Signos Firmados y Verificación de Suma Cero

Güegüense implementa una arquitectura de partida doble basada en **`ledger_transactions`** y **`ledger_postings`**.

### Convención Única de Signos:

- **`amount > 0` $\rightarrow$ DÉBITO (DEBIT)**
- **`amount < 0` $\rightarrow$ CRÉDITO (CREDIT)**

**Invariante de Suma Cero:** En toda transacción, la suma algebraica de sus `ledger_postings` DEBE SER EXACTAMENTE CERO ($\sum \text{amount} = 0$). Esta regla es **validada por el backend en procedimientos almacenados controlados** antes de confirmar cualquier journal transaction.

---

## 2. Ciclo de Vida Financiero de Payouts (Retiros Conductor)

Para evitar ambigüedades entre la aprobación administrativa y la dispersión bancaria real:

```text
 ┌────────────────┐
 │   REQUESTED    │ Conductor solicita retiro desde su app.
 └───────┬────────┘
         │
         ▼
 ┌────────────────┐
 │  UNDER_REVIEW  │ En revisión por Admin (MFA / Cuatro Ojos si > C$5,000 policy).
 └───────┬────────┘
         │
         ▼
 ┌────────────────┐
 │    APPROVED    │ Aprobado administrativamente por la plataforma.
 └───────┬────────┘
         │
         ▼
 ┌────────────────┐
 │   PROCESSING   │ Transferencia emitida hacia el proveedor bancario.
 └───────┬────────┘
         │
         ▼
 ┌────────────────┐
 │      PAID      │ Confirmación recibida vía webhook/callback verificado.
 └────────────────┘
```

---

## 3. Ejemplos Canónicos de Asientos Contables por `transaction_type`

### 1. Entrega Normal Liquidada (`transaction_type: DELIVERY_SETTLEMENT` - C$ 100.00)

- **Postings:**
  - `ASSET_BUSINESS_REC` $\rightarrow$ $+100.00 \text{ NIO}$ (Débito: Cuenta por cobrar al comercio)
  - `LIABILITY_DRIVER` $\rightarrow$ $-80.00 \text{ NIO}$ (Crédito: Cuenta por pagar al conductor)
  - `REVENUE_PLATFORM` $\rightarrow$ $-20.00 \text{ NIO}$ (Crédito: Ingreso comisión Güegüense)
  - **Suma:** $+100.00 - 80.00 - 20.00 = 0.00 \text{ NIO}$

### 2. Recargo por Tiempo de Espera en Sucursal (`transaction_type: WAITING_FEE` - C$ 50.00)

- **Postings:**
  - `ASSET_BUSINESS_REC` $\rightarrow$ $+50.00 \text{ NIO}$ (Débito: Recargo por espera cobrado al negocio)
  - `LIABILITY_DRIVER` $\rightarrow$ $-40.00 \text{ NIO}$ (Crédito: Acreditación de compensación al conductor)
  - `REVENUE_PLATFORM` $\rightarrow$ $-10.00 \text{ NIO}$ (Crédito: Comisión plataforma sobre espera)
  - **Suma:** $+50.00 - 40.00 - 10.00 = 0.00 \text{ NIO}$

### 3. Reembolso a Comercio por Cancelación Autorizada (`transaction_type: REFUND` - C$ 100.00)

- **Postings:**
  - `REVENUE_PLATFORM` $\rightarrow$ $+20.00 \text{ NIO}$ (Débito: Reversión de ingreso de plataforma)
  - `LIABILITY_DRIVER` $\rightarrow$ $+80.00 \text{ NIO}$ (Débito: Reversión de ganancia driver si aplica)
  - `ASSET_BUSINESS_REC` $\rightarrow$ $-100.00 \text{ NIO}$ (Crédito: Crédito a favor del negocio)
  - **Suma:** $+20.00 + 80.00 - 10.000 = 0.00 \text{ NIO}$

### 4. Ajuste Manual Administrativo (`transaction_type: MANUAL_ADJUSTMENT` - C$ 50.00)

- **Postings:**
  - `REVENUE_PLATFORM` $\rightarrow$ $+50.00 \text{ NIO}$ (Débito: Gasto por ajuste de arbitraje plataforma)
  - `LIABILITY_DRIVER` $\rightarrow$ $-50.00 \text{ NIO}$ (Crédito: Compensación acreditada al conductor)
  - **Suma:** $+50.00 - 50.00 = 0.00 \text{ NIO}$

### 5. Retiro de Ganancias de Conductor (`transaction_type: DRIVER_PAYOUT` - C$ 1,000.00)

- **Postings:**
  - `LIABILITY_DRIVER` $\rightarrow$ $+1,000.00 \text{ NIO}$ (Débito: Cancelación de pasivo con conductor)
  - `BANK_PLATFORM` $\rightarrow$ $-1,000.00 \text{ NIO}$ (Crédito: Egreso de banco plataforma)
  - **Suma:** $+1,000.00 - 1,000.00 = 0.00 \text{ NIO}$
