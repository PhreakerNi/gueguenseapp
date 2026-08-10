# 11 — SISTEMA CONTABLE Y LEDGER FINANCIERO (FINANCIAL LEDGER)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Contabilidad de Partida Doble, Billeteras Virtuales, Efectivo y Retiros  

---

## 1. Principio de Separación Financiera

Güegüense prohíbe terminantemente almacenar las finanzas en un solo campo o recalcular saldos al vuelo sumando historiales de entregas.

Toda transacción monetaria se registra mediante un **Ledger de Partida Doble** inmutable (`ledger_entries`), donde cada movimiento debita de una cuenta origen y acredita en una cuenta destino en la misma transacción atómica.

```text
                               ┌───────────────────────────┐
                               │   NEGOCIO / CLIENTE       │
                               │   (Paga Precio del Envío) │
                               └─────────────┬─────────────┘
                                             │  C$ 100.00 Total Delivery
                                             ▼
                               ┌───────────────────────────┐
                               │    SISTEMA GÜEGÜENSE      │
                               │ (Distribución Contable)   │
                               └──────┬─────────────┬──────┘
                                      │             │
                    ┌─────────────────┘             └─────────────────┐
                    │ C$ 80.00 (80%)                                  │ C$ 20.00 (20%)
                    ▼                                                 ▼
┌───────────────────────────────────────┐         ┌───────────────────────────────────────┐
│     BILLETERA DEL MOTORIZADO          │         │    CUENTA INGRESOS GÜEGÜENSE          │
│    (`DRIVER_EARNING` en Ledger)       │         │  (`PLATFORM_COMMISSION` en Ledger)    │
└───────────────────────────────────────┘         └───────────────────────────────────────┘
```

---

## 2. Definición de Cuentas del Ledger (`wallet_accounts`)

1. **`BUSINESS_ACCOUNT`:** Billetera / crédito del negocio emisor.
2. **`DRIVER_WALLET`:** Billetera virtual del conductor donde se acumulan sus ganancias netas.
3. **`PLATFORM_REVENUE`:** Cuenta institucional de Güegüense donde ingresan las comisiones retenidas.
4. **`CASH_HELD_BY_DRIVER`:** Cuenta de control que registra el dinero en efectivo recibido por el conductor de manos del cliente final.

---

## 3. Tipos de Transacciones Contables (`entry_type`)

* **`DELIVERY_EARNING`:** Acreditación de la ganancia por servicio al conductor al completarse la entrega (`DELIVERED`).
* **`PLATFORM_COMMISSION`:** Retención de la comisión pactada para la plataforma Güegüense.
* **`CASH_COLLECTION`:** Registro del dinero en efectivo cobrado por el conductor en la entrega.
* **`CASH_SETTLEMENT`:** Liquidación o depósito del efectivo cobrado por el conductor hacia la plataforma o negocio.
* **`PAYOUT`:** Transferencia / retiro de fondos procesado desde la billetera del conductor hacia su cuenta bancaria.
* **`ADJUSTMENT`:** Ajuste contable manual autorizado por un `super_admin` por disputa o compensación.

---

## 4. Ejemplo de Asiento Contable en Entrega Exitosa

**Escenario:** Entrega de C$ 100.00 (C$ 80.00 ganancia driver + C$ 20.00 comisión Güegüense).

```sql
-- Asiento 1: Acreditar Ganancia al Conductor
INSERT INTO ledger_entries (delivery_id, source_account_id, destination_account_id, entry_type, amount, description)
VALUES (
    'd_11223344',
    'acc_business_01',
    'acc_driver_wallet_99',
    'DELIVERY_EARNING',
    80.00,
    'Ganancia neta por entrega d_11223344'
);

-- Asiento 2: Acreditar Comisión a la Plataforma
INSERT INTO ledger_entries (delivery_id, source_account_id, destination_account_id, entry_type, amount, description)
VALUES (
    'd_11223344',
    'acc_business_01',
    'acc_platform_revenue',
    'PLATFORM_COMMISSION',
    20.00,
    'Comisión de plataforma 20% por entrega d_11223344'
);
```

---

## 5. Control de Efectivo y Retiros (Payouts)

### 5.1 Manejo de Efectivo Recaudado en Mano
Si el conductor cobra C$ 500.00 en efectivo al cliente final (C$ 400.00 del pedido + C$ 100.00 del delivery):
* El conductor se queda con el dinero físico.
* Se crea un registro en `CASH_HELD_BY_DRIVER` por C$ 500.00.
* Su saldo disponible para retiros se compensa automáticamente contra el efectivo que ya sostiene en sus manos, evitando que el conductor se retire con dinero pendiente de liquidar.

### 5.2 Solicitudes de Retiro (`payouts`)
1. El motorizado solicita un retiro de su saldo disponible desde la app.
2. La solicitud pasa a estado `REQUESTED`.
3. En el panel Admin, un administrador valida que no existan disputas activas ni saldos de efectivo pendientes.
4. Al transferir el dinero, el Admin presiona **"APROBAR PAYOUT"** y el Ledger registra la salida de fondos.
