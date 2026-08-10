# 06 — ARQUITECTURA DE BASE DE DATOS (DATABASE ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Modelo Relacional PostgreSQL, PostGIS, Índices Geoespaciales y Políticas RLS  

---

## 1. Diseñando el Esquema Relacional

El modelo de datos de Güegüense está optimizado para integridad contable, rapidez en consultas geoespaciales y aislamiento estricto mediante **Row Level Security (RLS)**.

```text
┌────────────────┐      ┌────────────────┐      ┌────────────────┐
│     users      ├─────►│    profiles    ├─────►│   businesses   │
└────────────────┘      └────────────────┘      └───────┬────────┘
                                                        │
                        ┌────────────────┐              │ 1:N
                        │driver_presence │              ▼
                        └───────▲────────┘      ┌────────────────┐
                                │               │business_locat. │
                        ┌───────┴────────┐      └───────┬────────┘
                        │    drivers     │              │
                        └───────▲────────┘              │ 1:N
                                │                       ▼
┌────────────────┐      ┌───────┴────────┐      ┌────────────────┐
│ delivery_offers│◄─────┤   deliveries   │◄─────┤delivery_requests│
└────────────────┘      └───────┬────────┘      └────────────────┘
                                │
                        ┌───────┴────────┐
                        │ledger_entries  │
                        └────────────────┘
```

---

## 2. Definición Detallada de Tablas / Entidades

### 2.1 Dominio de Autenticación y Perfiles

#### Tabla: `users` (Manejada por Supabase Auth)
* **Descripción:** Credenciales y registro base de la plataforma.
* **Columnas:** `id` (UUID, PK), `email` (Text, Unique), `phone` (Text, Unique), `created_at` (TIMESTAMPTZ).

#### Tabla: `profiles`
* **Descripción:** Datos personales comunes a todos los usuarios.
* **Columnas:** `id` (UUID, PK, FK `users.id`), `role` (ENUM: `super_admin`, `admin`, `operator`, `verification_agent`, `business_owner`, `business_manager`, `business_employee`, `driver`), `full_name` (Text), `avatar_url` (Text), `status` (Text), `created_at` (TIMESTAMPTZ).
* **RLS Strategy:** El usuario lee su propio perfil. Administradores leen todos.

---

### 2.2 Dominio de Negocios y Sucursales

#### Tabla: `businesses`
* **Descripción:** Registro comercial de las empresas clientes.
* **Columnas:** `id` (UUID, PK), `owner_id` (UUID, FK `profiles.id`), `legal_name` (Text), `brand_name` (Text), `tax_id` (Text), `phone` (Text), `status` (ENUM: `REGISTERED`, `UNDER_REVIEW`, `ACTIVE`, `SUSPENDED`), `created_at` (TIMESTAMPTZ).
* **RLS Strategy:** `business_owner` gestiona solo su `id`. Admin gestiona todos.

#### Tabla: `business_locations` (Sucursales)
* **Descripción:** Puntos de recogida y sedes operativas de un negocio.
* **Columnas:** `id` (UUID, PK), `business_id` (UUID, FK `businesses.id`), `name` (Text), `address_text` (Text), `location` (GEOGRAPHY(Point, 4326)), `pickup_instructions` (Text), `phone` (Text), `is_active` (Boolean).
* **Índices:** `GIST(location)` para búsqueda espacial cercana.

---

### 2.3 Dominio de Motorizados y Flota

#### Tabla: `drivers`
* **Descripción:** Perfil operativo y legal del conductor de delivery.
* **Columnas:** `id` (UUID, PK, FK `profiles.id`), `national_id_number` (Text, Sensitive), `license_number` (Text, Sensitive), `status` (ENUM: `REGISTERED`, `PENDING_VERIFICATION`, `UNDER_REVIEW`, `VERIFIED`, `ACTIVE`, `SUSPENDED`, `REJECTED`, `BLOCKED`), `rating_avg` (Numeric(3,2)), `total_deliveries` (Integer), `verified_at` (TIMESTAMPTZ).
* **RLS Strategy:** Driver ve solo sus datos (excluyendo notas internas). `verification_agent` y Admin ven todo.

#### Tabla: `driver_documents`
* **Descripción:** Archivos de legalización presentados por el motorizado.
* **Columnas:** `id` (UUID, PK), `driver_id` (UUID, FK `drivers.id`), `document_type` (ENUM: `NATIONAL_ID_FRONT`, `NATIONAL_ID_BACK`, `DRIVERS_LICENSE`, `VEHICLE_REGISTRATION`), `file_path` (Text, Private Bucket), `verification_status` (ENUM: `PENDING`, `APPROVED`, `REJECTED`), `rejection_reason` (Text), `reviewed_by` (UUID, FK `profiles.id`), `reviewed_at` (TIMESTAMPTZ).

#### Tabla: `vehicles`
* **Descripción:** Datos de la motocicleta registrada.
* **Columnas:** `id` (UUID, PK), `driver_id` (UUID, FK `drivers.id`), `make` (Text), `model` (Text), `year` (Integer), `color` (Text), `license_plate` (Text, Unique), `photo_url` (Text).

#### Tabla: `driver_presence`
* **Descripción:** Estado en tiempo real del motorizado para el Dispatch Engine.
* **Columnas:** `driver_id` (UUID, PK, FK `drivers.id`), `operational_state` (ENUM: `OFFLINE`, `AVAILABLE`, `OFFERED`, `ASSIGNED`, `TO_PICKUP`, `DELIVERING`, `PAUSED`), `current_location` (GEOGRAPHY(Point, 4326)), `last_ping_at` (TIMESTAMPTZ), `battery_level` (Integer).
* **Índices:** `GIST(current_location)`, `BTREE(operational_state)`.

---

### 2.4 Dominio de Solicitudes y Entregas

#### Tabla: `delivery_requests`
* **Descripción:** Intención de envío y parámetros ingresados por el negocio.
* **Columnas:** `id` (UUID, PK), `business_id` (UUID, FK `businesses.id`), `location_id` (UUID, FK `business_locations.id`), `recipient_name` (Text), `recipient_phone` (Text), `delivery_address_text` (Text), `dropoff_location` (GEOGRAPHY(Point, 4326)), `package_type` (Text), `cash_to_collect` (Numeric(10,2)), `created_at` (TIMESTAMPTZ).

#### Tabla: `deliveries`
* **Descripción:** El viaje de entrega activo o histórico (Vinculado a la máquina de estados).
* **Columnas:** `id` (UUID, PK), `request_id` (UUID, FK `delivery_requests.id`), `driver_id` (UUID, FK `drivers.id`, Nullable), `status` (ENUM Delivery State Machine: `DRAFT`, `QUOTED`, `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP`, `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`, `DELIVERED`, `CANCELED`, `FAILED`, `DISPUTED`), `delivery_pin` (Text, Hash/Encrypted), `quoted_price` (Numeric(10,2)), `driver_earning` (Numeric(10,2)), `platform_fee` (Numeric(10,2)), `tracking_token` (Text, Unique), `created_at` (TIMESTAMPTZ), `delivered_at` (TIMESTAMPTZ).
* **Constraints:** `CHECK (quoted_price = driver_earning + platform_fee)`.

#### Tabla: `delivery_events`
* **Descripción:** Log de eventos inmutables auditables de cada entrega.
* **Columnas:** `id` (BigInt, PK), `delivery_id` (UUID, FK `deliveries.id`), `event_type` (Text), `actor_id` (UUID, FK `profiles.id`), `actor_role` (Text), `location` (GEOGRAPHY(Point, 4326)), `metadata` (JSONB), `created_at` (TIMESTAMPTZ).

---

### 2.5 Dominio Financiero y Ledger

#### Tabla: `wallet_accounts`
* **Descripción:** Cuentas virtuales por actor.
* **Columnas:** `id` (UUID, PK), `owner_id` (UUID, FK `profiles.id` o `businesses.id`), `account_type` (ENUM: `DRIVER_WALLET`, `BUSINESS_ACCOUNT`, `PLATFORM_REVENUE`), `current_balance` (Numeric(12,2)), `created_at` (TIMESTAMPTZ).

#### Tabla: `ledger_entries` (Partida Doble)
* **Descripción:** Transacciones inmutables de saldo.
* **Columnas:** `id` (UUID, PK), `delivery_id` (UUID, FK `deliveries.id`, Nullable), `source_account_id` (UUID, FK `wallet_accounts.id`), `destination_account_id` (UUID, FK `wallet_accounts.id`), `entry_type` (ENUM: `DELIVERY_EARNING`, `PLATFORM_COMMISSION`, `CASH_COLLECTION`, `PAYOUT`, `ADJUSTMENT`), `amount` (Numeric(10,2)), `currency` (Text, Default 'NIO'), `description` (Text), `created_at` (TIMESTAMPTZ).
* **Constraints:** `CHECK (amount > 0)`.

---

## 3. Resumen de Tablas Adicionales del Sistema

* `delivery_quotes`: Cotizaciones firmadas temporalmente.
* `delivery_offers`: Ofertas temporizadas emitidas por el Dispatch Engine a motorizados.
* `delivery_tracking_points`: Historial de puntos GPS recorridos durante un viaje.
* `delivery_proofs`: Evidencia fotográfica de entrega o firma.
* `payouts`: Solicitudes de retiro de dinero por parte de los conductores.
* `pricing_zones` & `pricing_rules`: Tablas de configuración de tarifas dinámicas.
* `incidents` & `support_tickets`: Reportes de problemas y disputas operativas.
* `audit_logs`: Registros de acciones administrativas de seguridad.
