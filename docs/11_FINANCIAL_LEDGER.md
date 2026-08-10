# 11 — SISTEMA CONTABLE Y LEDGER FINANCIERO (FINANCIAL LEDGER)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Contabilidad Doble Entrada (Journal + Postings), Moneda NIO y Zero-Sum Rule  

---

## 1. Arquitectura de Partida Doble (Journal + Postings)

Güegüense implementa una arquitectura contable de partida doble compuesta por **Transacciones (`ledger_transactions`)** y **Asientos (`ledger_postings`)**.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                   `ledger_transactions` (Operación)                    │
│   id: tx_9981 | delivery_id: d_123 | type: DELIVERY_SETTLEMENT         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ (1:N)
         ┌──────────────────────────┴──────────────────────────┐
         │                                                     │
         ▼                                                     ▼
┌──────────────────────────────────────┐     ┌──────────────────────────────────────┐
│  `ledger_postings` (Débito)          │     │  `ledger_postings` (Crédito)         │
│  account: ASSET_BUSINESS_REC         │     │  account: LIABILITY_DRIVER           │
│  amount: -100.00 NIO                 │     │  amount: +80.00 NIO                  │
└──────────────────────────────────────┘     └──────────────────────────────────────┘
                                             ┌──────────────────────────────────────┐
                                             │  `ledger_postings` (Crédito)         │
                                             │  account: REVENUE_PLATFORM           │
                                             │  amount: +20.00 NIO                  │
                                             └──────────────────────────────────────┘
```

**Regla de Suma Cero (Zero-Sum Invariant):** En toda transacción, la suma algebraica de sus `ledger_postings` DEBE SER EXACTAMENTE CERO ($\sum \text{amount} = 0$).

---

## 2. Cuentas Contables (`public.ledger_accounts`)

Para evitar claves foráneas ambiguas, cada cuenta pertenece a un poseedor explícito (`holder_type`):

```sql
CREATE TABLE public.ledger_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holder_type TEXT NOT NULL CHECK (holder_type IN ('USER', 'BUSINESS', 'PLATFORM')),
    user_id UUID REFERENCES auth.users(id),
    business_id UUID REFERENCES public.businesses(id),
    account_category TEXT NOT NULL CHECK (account_category IN (
        'ASSET_CASH_HELD',      -- Efectivo retenido en mano por el conductor
        'LIABILITY_DRIVER',     -- Por pagar a conductores (Driver Payable)
        'ASSET_BUSINESS_REC',   -- Por cobrar a negocios (Business Receivable)
        'REVENUE_PLATFORM',     -- Ingresos por comisiones Güegüense
        'BANK_PLATFORM'         -- Banco/Caja central Güegüense
    )),
    currency TEXT NOT NULL DEFAULT 'NIO',
    cached_balance NUMERIC(12,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_holder_fk CHECK (
        (holder_type = 'USER' AND user_id IS NOT NULL AND business_id IS NULL) OR
        (holder_type = 'BUSINESS' AND business_id IS NOT NULL AND user_id IS NULL) OR
        (holder_type = 'PLATFORM' AND user_id IS NULL AND business_id IS NULL)
    )
);
```

---

## 3. Inmutabilidad del Saldo Cacheado (`cached_balance`)

El campo `cached_balance` es un saldo denormalizado de lectura rápida. **QUEDA PROHIBIDO MODIFICAR `cached_balance` MEDIANTE SENTENCIAS `UPDATE` DIRECTAS DESDE LA API.** Se actualiza exclusivamente mediante procedimientos almacenados al insertar asientos en `ledger_postings`.

---

## 4. Ejemplos de Asientos Contables

### 4.1 Liquidación de Entrega Normal (C$ 100.00 Total)
* **Débito:** `ASSET_BUSINESS_REC` $-100.00 \text{ NIO}$
* **Crédito:** `LIABILITY_DRIVER` $+80.00 \text{ NIO}$
* **Crédito:** `REVENUE_PLATFORM` $+20.00 \text{ NIO}$
* **Suma:** $-100.00 + 80.00 + 20.00 = 0.00 \text{ NIO}$

### 4.2 Cobro de Efectivo en Mano por el Conductor (C$ 500.00 Total)
* **Débito:** `ASSET_CASH_HELD` $+500.00 \text{ NIO}$ (El conductor sostiene el efectivo físico)
* **Crédito:** `ASSET_BUSINESS_REC` $-500.00 \text{ NIO}$
* **Suma:** $+500.00 - 500.00 = 0.00 \text{ NIO}$
*(Nota: `ASSET_CASH_HELD` se compensa separadamente durante la liquidación de efectivo `cash_settlements`).*
