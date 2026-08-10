# 06 — ARQUITECTURA DE BASE DE DATOS (DATABASE ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Esquema Relacional PostgreSQL, Integración `auth.users`, Tablas Privadas de Secretos e Índices Parciales  

---

## 1. Modelo Relacional y Esquema `private`

Güegüense integra la autenticación con **Supabase Auth (`auth.users`)** y aísla los secretos criptográficos y hashes de tokens en el esquema restringido **`private`** (inaccesible vía API directa de cliente).

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
                          │ delivery_quotes   │                  │
                          └─────────┬─────────┘                  │
                                    │ (1:1)                      │
                          ┌─────────▼─────────┐                  │
                          │    deliveries     ├──────────────────┘ (1:N)
                          └─────────┬─────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         │                          │                          │
┌────────▼──────────┐      ┌────────▼──────────┐      ┌────────▼──────────┐
│ledger_transactions│      │     incidents     │      │private.secrets    │
└───────────────────┘      └───────────────────┘      └───────────────────┘
```

---

## 2. Especificación Detallada de Entidades de la Base de Datos

### 2.1 Dominio: Autenticación, Usuarios y Membresías

#### 1. `public.profiles`
* **Propósito:** Perfil general e identificadores de roles de plataforma.
* **PK:** `id` UUID (FK `auth.users.id` ON DELETE CASCADE).
* **Columnas:** `platform_role` (`PLATFORM_ROLE`: `super_admin`, `admin`, `operator`, `verification_agent`, `none`), `full_name` Text, `avatar_url` Text, `phone` Text, `created_at` TIMESTAMPTZ.
* **Constraints:** `UNIQUE(id)`.
* **RLS:** Lectura propia. Admin/SuperAdmin lectura global.
* **Estado MVP:** MVP.

#### 2. `public.businesses`
* **Propósito:** Registro comercial de la empresa cliente.
* **PK:** `id` UUID.
* **Columnas:** `legal_name` Text, `brand_name` Text, `tax_id` Text, `verification_status` (`BUSINESS_VERIFICATION_STATUS`: `PENDING`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED`), `account_status` (`BUSINESS_ACCOUNT_STATUS`: `ACTIVE`, `SUSPENDED`, `BLOCKED`, `CLOSED`), `created_at` TIMESTAMPTZ.
* **RLS:** Miembros del negocio y Admin leen/editan según rol.
* **Estado MVP:** MVP.

#### 3. `public.business_members`
* **Propósito:** Relación de membresía N:M entre `auth.users` y `businesses`.
* **PK:** `id` UUID.
* **FK:** `business_id` (FK `businesses.id` ON DELETE CASCADE), `user_id` (FK `auth.users.id` ON DELETE CASCADE).
* **Columnas:** `role` (`BUSINESS_MEMBER_ROLE`: `business_owner`, `business_manager`, `business_employee`), `status` Text (`ACTIVE`, `INVITED`, `SUSPENDED`), `location_scope` UUID (FK `business_locations.id`, Nullable), `created_at` TIMESTAMPTZ.
* **Constraints:** `UNIQUE(business_id, user_id)`.
* **Estado MVP:** MVP.

#### 4. `public.business_locations`
* **Propósito:** Sucursales físicas de recogida.
* **PK:** `id` UUID.
* **FK:** `business_id` (FK `businesses.id` ON DELETE CASCADE).
* **Columnas:** `name` Text, `address_text` Text, `location` GEOGRAPHY(Point, 4326), `pickup_instructions` Text, `is_active` Boolean.
* **Índices:** `GIST(location)`.
* **Estado MVP:** MVP.

---

### 2.2 Dominio: Conductores y Flota

#### 5. `public.drivers`
* **Propósito:** Expediente legal y operativo del motorizado.
* **PK:** `id` UUID (FK `auth.users.id` ON DELETE CASCADE).
* **Columnas:** `verification_status` (`DRIVER_VERIFICATION_STATUS`: `PENDING`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED`, `EXPIRED`), `account_status` (`DRIVER_ACCOUNT_STATUS`: `REGISTERED`, `ACTIVE`, `SUSPENDED`, `BLOCKED`, `CLOSED`), `national_id_number` Text (Sensitive), `license_number` Text (Sensitive), `rating_avg` Numeric(3,2), `total_deliveries` Integer, `created_at` TIMESTAMPTZ.
* **Sensibilidad:** Documentación de identidad protegida.
* **Estado MVP:** MVP.

#### 6. `public.driver_documents`
* **Propósito:** Archivos de legalización presentados.
* **PK:** `id` UUID.
* **FK:** `driver_id` (FK `drivers.id` ON DELETE CASCADE).
* **Columnas:** `document_type` Text, `file_path` Text (Bucket Privado), `verification_status` Text, `rejection_reason` Text.
* **Estado MVP:** MVP.

#### 7. `public.vehicles`
* **Propósito:** Datos de la motocicleta registrada.
* **PK:** `id` UUID.
* **FK:** `driver_id` (FK `drivers.id` ON DELETE CASCADE).
* **Columnas:** `make` Text, `model` Text, `year` Integer, `color` Text, `license_plate` Text (UNIQUE).
* **Estado MVP:** MVP.

#### 8. `public.driver_presence`
* **Propósito:** Estado geoespacial en tiempo real.
* **PK:** `driver_id` UUID (FK `drivers.id` ON DELETE CASCADE).
* **Columnas:** `operational_state` (`DRIVER_OPERATIONAL_STATE`: `OFFLINE`, `AVAILABLE`, `OFFERED`, `BUSY`, `PAUSED`), `current_location` GEOGRAPHY(Point, 4326), `location_updated_at` TIMESTAMPTZ.
* **Índices:** `GIST(current_location)`, `BTREE(operational_state)`.
* **Estado MVP:** MVP.

---

### 2.3 Dominio: Cotizaciones y Entregas (Snapshots e Índices Parciales)

#### 9. `public.delivery_requests`
* **Propósito:** Intención de envío con **Snapshots Históricos de Dirección**.
* **PK:** `id` UUID.
* **FK:** `business_id` (FK `businesses.id`), `location_id` (FK `business_locations.id`).
* **Columnas:** `pickup_address_snapshot` JSONB (Inmutable), `dropoff_address_snapshot` JSONB (Inmutable), `recipient_name` Text, `recipient_phone` Text, `dropoff_location` GEOGRAPHY(Point, 4326), `package_type` Text, `cash_to_collect` Numeric(10,2).
* **Estado MVP:** MVP.

#### 10. `public.delivery_quotes`
* **Propósito:** Registro y cálculo de la cotización previo a la entrega.
* **PK:** `id` UUID.
* **FK:** `delivery_request_id` (FK `delivery_requests.id`).
* **Columnas:** `status` (`QUOTE_STATUS`: `DRAFT`, `QUOTED`, `CONSUMED`, `EXPIRED`, `CANCELED`), `pricing_version` Text, `base_amount` Numeric(10,2), `distance_amount` Numeric(10,2), `quoted_total` Numeric(10,2), `expires_at` TIMESTAMPTZ, `created_at` TIMESTAMPTZ.
* **Estado MVP:** MVP.

#### 11. `public.deliveries`
* **Propósito:** Registro maestro del viaje y máquina de estados.
* **PK:** `id` UUID.
* **FK:** `request_id` (FK `delivery_requests.id`), `quote_id` (FK `delivery_quotes.id`), `driver_id` (FK `drivers.id`, Nullable).
* **Columnas:** `status` (`DELIVERY_STATUS`: `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP`, `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`, `DELIVERED`, `RETURN_REQUIRED`, `RETURNING`, `RETURNED`, `CANCELED`, `FAILED`), `pickup_code` Text (Nullable), `quoted_price` Numeric(10,2), `final_price` Numeric(10,2), `driver_earning` Numeric(10,2), `platform_fee` Numeric(10,2), `created_at` TIMESTAMPTZ, `delivered_at` TIMESTAMPTZ.
* **Partial Unique Index (Invariante B):**
```sql
CREATE UNIQUE INDEX idx_driver_active_delivery ON public.deliveries (driver_id)
WHERE status IN ('DRIVER_ASSIGNED', 'TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'TO_DROPOFF', 'ARRIVED_DROPOFF', 'RETURN_REQUIRED', 'RETURNING');
```
* **Estado MVP:** MVP.

#### 12. `private.delivery_secrets` (Esquema Privado)
* **Propósito:** Aislamiento de secretos de entrega (OTP) inaccesible vía API de cliente.
* **PK:** `delivery_id` UUID (FK `public.deliveries.id` ON DELETE CASCADE).
* **Columnas:** `otp_digest` Text (Hash Bcrypt/Argon2), `otp_expires_at` TIMESTAMPTZ, `otp_attempt_count` Integer (Default 0), `otp_locked_until` TIMESTAMPTZ (Nullable), `otp_verified_at` TIMESTAMPTZ (Nullable).
* **Sensibilidad:** Crítica. Sin políticas RLS públicas.
* **Estado MVP:** MVP.

#### 13. `private.tracking_tokens` (Esquema Privado)
* **Propósito:** Aislamiento de hashes de tokens de tracking web.
* **PK:** `id` UUID.
* **FK:** `delivery_id` UUID (FK `public.deliveries.id` ON DELETE CASCADE).
* **Columnas:** `token_hash` Text (UNIQUE, SHA-256), `expires_at` TIMESTAMPTZ, `revoked_at` TIMESTAMPTZ (Nullable), `created_at` TIMESTAMPTZ.
* **Estado MVP:** MVP.

---

### 2.4 Dominio: Incidentes, Despacho y Eventos

#### 14. `public.incidents`
* **Propósito:** Registro desacoplado de problemas operativos.
* **PK:** `id` UUID.
* **FK:** `delivery_id` (FK `deliveries.id`), `reported_by` (FK `auth.users.id`).
* **Columnas:** `incident_type` (`INCIDENT_TYPE`), `status` (`INCIDENT_STATUS`: `OPEN`, `UNDER_INVESTIGATION`, `RESOLVED_CONTINUE`, `RESOLVED_RETURN`, `RESOLVED_HANDOFF`, `CLOSED`), `resolution_notes` Text.
* **Estado MVP:** MVP.

#### 15. `public.delivery_offers`
* **Propósito:** Ofertas temporizadas emitidas por el Dispatch Engine.
* **PK:** `id` UUID.
* **FK:** `delivery_id` (FK `deliveries.id`), `driver_id` (FK `drivers.id`).
* **Columnas:** `status` (`OFFER_STATUS`: `OPEN`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELED`), `expires_at` TIMESTAMPTZ.
* **Estado MVP:** MVP.

#### 16. `public.delivery_events`
* **Propósito:** Historial inmutable auditable.
* **PK:** `id` BigInt.
* **FK:** `delivery_id` (FK `deliveries.id`), `actor_user_id` (FK `auth.users.id`, Nullable).
* **Columnas:** `actor_type` Text (`USER`, `SYSTEM`, `CUSTOMER_CREDENTIAL`, `WEBHOOK`, `BACKGROUND_JOB`, `ADMIN_ACTION`), `event_type` Text (`EVENT_TYPE`), `metadata` JSONB.
* **Estado MVP:** MVP.

---

### 2.5 Dominio: Finanzas y Ledger Contable (Journal + Postings)

#### 17. `public.ledger_accounts`
* **Propósito:** Cuentas contables para partida doble.
* **PK:** `id` UUID.
* **FK:** `user_id` (FK `auth.users.id`, Nullable), `business_id` (FK `businesses.id`, Nullable).
* **Columnas:** `holder_type` Text (`USER`, `BUSINESS`, `PLATFORM`), `account_category` Text (`ASSET_CASH_HELD`, `LIABILITY_DRIVER`, `ASSET_BUSINESS_REC`, `REVENUE_PLATFORM`, `BANK_PLATFORM`), `cached_balance` Numeric(12,2) (Denormalizado / Cache), `created_at` TIMESTAMPTZ.
* **Constraints:** `chk_holder_fk` (Valida que `user_id` o `business_id` coincidan con `holder_type`).
* **Estado MVP:** MVP.

#### 18. `public.ledger_transactions` & 19. `public.ledger_postings`
* `ledger_transactions`: Registro maestro de la transacción económica (`id`, `delivery_id`, `transaction_type`, `created_at`).
* `ledger_postings`: Entradas de débito y crédito (`id`, `transaction_id`, `account_id`, `amount`, `currency`, `created_at`).
* **Regla:** `SUM(amount) = 0` por transacción.
* **Estado MVP:** MVP.

#### 20. `public.pricing_adjustments`
* **Propósito:** Ajustes a la cotización inicial (`WAITING_FEE`, `RETURN_FEE`, `CANCEL_FEE`, `DISCOUNT`, `SUBSIDY`).
* **PK:** `id` UUID.
* **FK:** `delivery_id` (FK `deliveries.id`).
* **Columnas:** `adjustment_type` Text, `amount` Numeric(10,2), `reason` Text.
* **Estado MVP:** MVP.

#### 21. `public.payouts`, 22. `public.cash_settlements`, 23. `public.pricing_zones`, 24. `public.pricing_rules`, 25. `public.device_tokens`, 26. `public.notification_outbox`, 27. `public.support_tickets`, 28. `public.audit_logs`.
* Todas documentadas para MVP.

#### 29-34. Entidades de Catálogo (POST-MVP)
* `orders`, `order_items`, `menus`, `categories`, `products`, `product_options` (Documentadas como Post-MVP).
