# 06 — ARQUITECTURA DE BASE DE DATOS (DATABASE ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Esquema Relacional PostgreSQL, PostGIS, Integración con `auth.users`, Índices y Políticas RLS  

---

## 1. Modelo de Datos Unificado

El modelo relacional de Güegüense se integra directamente con **Supabase Auth (`auth.users`)**, desacoplando perfiles de plataforma, miembros de negocios y conductores.

```text
                           ┌──────────────────┐
                           │    auth.users    │ (Identity Provider)
                           └────────┬─────────┘
                                    │
       ┌────────────────────────────┼────────────────────────────┐
       │ (1:1)                      │ (1:N)                      │ (1:1)
┌──────▼───────────┐      ┌─────────▼─────────┐        ┌─────────▼─────────┐
│  public.profiles │      │ business_members  │        │   public.drivers  │
└──────────────────┘      └─────────┬─────────┘        └─────────┬─────────┘
                                    │ (N:1)                      │
                          ┌─────────▼─────────┐                  │
                          │    businesses     │                  │
                          └─────────┬─────────┘                  │
                                    │ (1:N)                      │
                          ┌─────────▼─────────┐                  │
                          │business_locations │                  │
                          └─────────┬─────────┘                  │
                                    │ (1:N)                      │
                          ┌─────────▼─────────┐                  │
                          │ delivery_requests │                  │
                          └─────────┬─────────┘                  │
                                    │ (1:1)                      │
                          ┌─────────▼─────────┐                  │
                          │    deliveries     ├──────────────────┘ (1:N)
                          └─────────┬─────────┘
                                    │
                                    ├──────────────────────────┐
                                    │                          │
                          ┌─────────▼─────────┐      ┌─────────▼─────────┐
                          │   ledger_entries  │      │     incidents     │
                          └───────────────────┘      └───────────────────┘
```

---

## 2. Catálogo Completo de Entidades del Sistema

### 2.1 Dominio de Usuarios y Membresías

#### Tabla: `public.profiles`
* **Propósito:** Almacena información de perfil general e identificadores de roles de plataforma.
* **Columnas:** `id` (UUID, PK, FK `auth.users.id` ON DELETE CASCADE), `platform_role` (ENUM: `super_admin`, `admin`, `operator`, `verification_agent`, `none`), `full_name` (Text), `avatar_url` (Text), `phone` (Text), `created_at` (TIMESTAMPTZ).
* **Constraints:** `UNIQUE(id)`.
* **RLS:** El usuario lee su propio perfil. Roles de plataforma leen según nivel.

#### Tabla: `public.businesses`
* **Propósito:** Entidad comercial de la empresa cliente.
* **Columnas:** `id` (UUID, PK), `legal_name` (Text), `brand_name` (Text), `tax_id` (Text), `status` (ENUM: `REGISTERED`, `UNDER_REVIEW`, `ACTIVE`, `SUSPENDED`), `created_at` (TIMESTAMPTZ).
* **Lifecycle:** `REGISTERED` $\rightarrow$ `UNDER_REVIEW` $\rightarrow$ `ACTIVE` (o `SUSPENDED`).

#### Tabla: `public.business_members`
* **Propósito:** Relación de membresía N:M entre un usuario (`auth.users`) y un negocio (`businesses`).
* **Columnas:** `id` (UUID, PK), `business_id` (UUID, FK `businesses.id`), `user_id` (UUID, FK `auth.users.id`), `role` (ENUM: `business_owner`, `business_manager`, `business_employee`), `status` (ENUM: `ACTIVE`, `INVITED`, `SUSPENDED`), `created_at` (TIMESTAMPTZ).
* **Constraints:** `UNIQUE(business_id, user_id)`.

#### Tabla: `public.business_locations` (Sucursales)
* **Propósito:** Sedes físicas de recogida.
* **Columnas:** `id` (UUID, PK), `business_id` (UUID, FK `businesses.id`), `name` (Text), `address_text` (Text), `location` (GEOGRAPHY(Point, 4326)), `pickup_instructions` (Text), `is_active` (Boolean).
* **Índices:** `GIST(location)`.

---

### 2.2 Dominio de Conductores y Flota

#### Tabla: `public.drivers`
* **Propósito:** Expediente legal y operativo del motorizado.
* **Columnas:** `id` (UUID, PK, FK `auth.users.id`), `verification_status` (ENUM: `PENDING`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED`), `account_status` (ENUM: `REGISTERED`, `ACTIVE`, `SUSPENDED`, `BLOCKED`), `national_id_number` (Text, Sensitive), `license_number` (Text, Sensitive), `rating_avg` (Numeric(3,2)), `total_deliveries` (Integer).
* **RLS:** Conductor lee y edita solo su perfil no-sensible. Agentes de verificación ven expediente.

#### Tabla: `public.driver_documents`
* **Propósito:** Archivos de legalización.
* **Columnas:** `id` (UUID, PK), `driver_id` (UUID, FK `drivers.id`), `document_type` (Text), `file_path` (Text, Bucket Privado), `verification_status` (Text), `rejection_reason` (Text).

#### Tabla: `public.driver_presence`
* **Propósito:** Estado geoespacial en tiempo real.
* **Columnas:** `driver_id` (UUID, PK, FK `drivers.id`), `operational_state` (ENUM: `OFFLINE`, `AVAILABLE`, `OFFERED`, `ASSIGNED`, `TO_PICKUP`, `DELIVERING`, `PAUSED`), `current_location` (GEOGRAPHY(Point, 4326)), `location_updated_at` (TIMESTAMPTZ).
* **Índices:** `GIST(current_location)`, `BTREE(operational_state)`.

---

### 2.3 Dominio de Entregas e Historización de Direcciones

#### Tabla: `public.delivery_requests`
* **Propósito:** Parámetros de envío ingresados por el comercio con **Snapshot de Dirección**.
* **Columnas:** `id` (UUID, PK), `business_id` (UUID, FK `businesses.id`), `location_id` (UUID, FK `business_locations.id`), `pickup_address_snapshot` (JSONB - Copia inmutable de la sucursal al momento de crear), `dropoff_address_snapshot` (JSONB - Copia inmutable del destino), `recipient_name` (Text), `recipient_phone` (Text), `dropoff_location` (GEOGRAPHY(Point, 4326)), `package_type` (Text), `cash_to_collect` (Numeric(10,2)).

#### Tabla: `public.deliveries`
* **Propósito:** Registro maestro de la entrega y máquina de estados.
* **Columnas:** `id` (UUID, PK), `request_id` (UUID, FK `delivery_requests.id`), `driver_id` (UUID, FK `drivers.id`, Nullable), `status` (ENUM Delivery State Machine), `pickup_code` (Text, Nullable), `otp_hash` (Text, Hash Bcrypt/Argon2 del OTP del cliente), `otp_expires_at` (TIMESTAMPTZ), `otp_attempt_count` (Integer, Default 0), `otp_locked_until` (TIMESTAMPTZ, Nullable), `otp_verified_at` (TIMESTAMPTZ, Nullable), `quoted_price` (Numeric(10,2)), `final_price` (Numeric(10,2)), `driver_earning` (Numeric(10,2)), `platform_fee` (Numeric(10,2)), `token_hash` (Text, Unique - Hash del token de tracking web).
* **Partial Unique Index:** `CREATE UNIQUE INDEX idx_driver_active_delivery ON deliveries (driver_id) WHERE status IN ('DRIVER_ASSIGNED', 'TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'TO_DROPOFF', 'ARRIVED_DROPOFF');` (Garantiza Invariante de 1 entrega activa por conductor en MVP).

#### Tabla: `public.incidents`
* **Propósito:** Sub-sistema desacoplado de incidencias operativas.
* **Columnas:** `id` (UUID, PK), `delivery_id` (UUID, FK `deliveries.id`), `reported_by` (UUID, FK `auth.users.id`), `incident_type` (Text), `status` (ENUM: `OPEN`, `UNDER_INVESTIGATION`, `RESOLVED`), `resolution_notes` (Text), `created_at` (TIMESTAMPTZ).

#### Tabla: `public.delivery_events`
* **Propósito:** Historial auditable inmutable.
* **Columnas:** `id` (BigInt, PK), `delivery_id` (UUID, FK `deliveries.id`), `actor_type` (ENUM: `USER`, `SYSTEM`, `CUSTOMER_TOKEN`, `WEBHOOK`, `BACKGROUND_JOB`), `actor_id` (UUID, FK `auth.users.id`, Nullable), `event_type` (Text), `metadata` (JSONB), `created_at` (TIMESTAMPTZ).

---

### 2.4 Dominio Financiero (Party Accounting)

#### Tabla: `public.wallet_accounts`
* **Propósito:** Billeteras virtuales asociadas a poseedores de cuenta (`account_holders`).
* **Columnas:** `id` (UUID, PK), `holder_type` (ENUM: `USER`, `BUSINESS`, `PLATFORM`), `user_id` (UUID, FK `auth.users.id`, Nullable), `business_id` (UUID, FK `businesses.id`, Nullable), `account_type` (Text), `cached_balance` (Numeric(12,2), Materializado de auditoría), `created_at` (TIMESTAMPTZ).
* **Check Constraint:** `CHECK ((holder_type = 'USER' AND user_id IS NOT NULL AND business_id IS NULL) OR (holder_type = 'BUSINESS' AND business_id IS NOT NULL AND user_id IS NULL) OR (holder_type = 'PLATFORM'))`.

#### Tablas: `ledger_transactions` & `ledger_postings` (Partida Doble Real)
* `ledger_transactions`: Registro maestro de la operación económica (`id`, `delivery_id`, `transaction_type`, `created_at`).
* `ledger_postings`: Entradas de débito y crédito (`id`, `transaction_id`, `account_id`, `amount` [Positivo=Crédito, Negativo=Débito], `created_at`).
