# 11 — SISTEMA CONTABLE Y LEDGER FINANCIERO (FINANCIAL LEDGER)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Contabilidad de Partida Doble (Journal + Postings), Billeteras y Control de Efectivo  

---

## 1. Arquitectura de Partida Doble (Journal + Postings)

Güegüense implementa una arquitectura contable estricta de partida doble compuesta por **Transacciones (`ledger_transactions`)** y **Asientos/Postings (`ledger_postings`)**.

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
│  account: Business Receivable        │     │  account: Driver Payable             │
│  amount: -100.00 NIO                 │     │  amount: +80.00 NIO                  │
└──────────────────────────────────────┘     └──────────────────────────────────────┘
                                             ┌──────────────────────────────────────┐
                                             │  `ledger_postings` (Crédito)         │
                                             │  account: Platform Revenue           │
                                             │  amount: +20.00 NIO                  │
                                             └──────────────────────────────────────┘
```

**Regla Fundamental:** En toda transacción, la suma algebraica de sus `ledger_postings` DEBE SER EXACTAMENTE CERO ($\sum \text{amount} = 0$).

---

## 2. Definición de Cuentas Contables (`wallet_accounts`)

Para evitar claves foráneas ambiguas, cada cuenta contable pertenece a un poseedor explícito mediante la estructura `account_holder`:

```sql
CREATE TABLE public.wallet_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holder_type TEXT NOT NULL CHECK (holder_type IN ('USER', 'BUSINESS', 'PLATFORM')),
    user_id UUID REFERENCES auth.users(id),
    business_id UUID REFERENCES public.businesses(id),
    account_category TEXT NOT NULL CHECK (account_category IN (
        'ASSET_CASH_HELD',      -- Efectivo retenido por conductores
        'LIABILITY_DRIVER',     -- Por pagar a conductores (Driver Payable)
        'ASSET_BUSINESS_REC',   -- Por cobrar a negocios (Business Receivable)
        'REVENUE_PLATFORM',     -- Ingresos por comisiones Güegüense
        'BANK_PLATFORM'         -- Banco/Caja central Güegüense
    )),
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

## 3. Inmutabilidad del Saldos Materializados (`cached_balance`)

El campo `cached_balance` existe únicamente como una vista materializada de lectura rápida. **QUEDA ESTRICTAMENTE PROHIBIDO MODIFICAR LIBREMENTE `cached_balance` MEDIANTE SENTENCIAS `UPDATE` DIRECTAS DESDE LA API.**

Cualquier actualización del saldo se ejecuta **exclusivamente mediante Triggers / Stored Procedures en PostgreSQL** al insertar un nuevo asiento en `ledger_postings`, garantizando la auditabilidad y reconciliación perfecta en todo momento.
