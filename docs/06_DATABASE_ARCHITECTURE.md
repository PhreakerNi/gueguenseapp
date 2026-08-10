# 06 — ARQUITECTURA DE BASE DE DATOS (DATABASE ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Catálogo Relacional Completo PostgreSQL (34 Entidades), Relación Request 1:N Quotes, Scope N:M y Cifrado Payouts  

---

## 1. Modelo Relacional y Esquema `private`

Güegüense integra **Supabase Auth (`auth.users`)** y aísla los secretos criptográficos, hashes de OTP, cifrado de claves y tokens en el esquema restringido **`private`**.

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
                                    │ (1:N)                      │ (1:N)
                          ┌─────────▼──────────┐       ┌─────────▼─────────┐
                          │member_locations(N:M│       │payout_methods(Priv│
                          └─────────┬──────────┘       └───────────────────┘
                                    │ (N:1)
                          ┌─────────▼─────────┐
                          │    businesses     │
                          └─────────┬─────────┘
                                    │ (1:N)
                          ┌─────────▼─────────┐
                          │business_locations │
                          └─────────┬─────────┘
                                    │ (1:N)
                          ┌─────────▼─────────┐
                          │ delivery_requests │
                          └─────────┬─────────┘
                                    │ (1:N)
                          ┌─────────▼─────────┐
                          │  delivery_quotes  │ (N quotes por Request; 1 CONSUMED)
                          └─────────┬─────────┘
                                    │ (1:1)
                          ┌─────────▼─────────┐
                          │    deliveries     │
                          └───────────────────┘
```

---

## 2. Especificación Detallada Individualizada de Entidades (34 Tablas)

### 2.1 Identidad, Comercios y Conducción

#### 1. `public.profiles`
* **Propósito:** Perfil de usuario e identificador de rol de plataforma.
* **MVP Status:** MVP.
* **PK:** `id` UUID (FK `auth.users.id` ON DELETE CASCADE).
* **Columnas:** `platform_role` (`PLATFORM_ROLE`: `super_admin`, `admin`, `operator`, `verification_agent`, `none`), `full_name` Text, `avatar_url` Text, `phone` Text, `created_at` TIMESTAMPTZ.
* **Constraints:** `UNIQUE(id)`.
* **RLS:** Lectura propia; Admin/SuperAdmin lectura global. Writer: Backend/User. Reader: Authenticated.
* **Sensibilidad / Retención:** Sensibilidad baja. Retención permanente.

#### 2. `public.businesses`
* **Propósito:** Expediente de la empresa comercial cliente.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columnas:** `legal_name` Text, `brand_name` Text, `tax_id` Text, `verification_status` (`BUSINESS_VERIFICATION_STATUS`: `NOT_REQUIRED`, `PENDING`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED`), `account_status` (`BUSINESS_ACCOUNT_STATUS`: `ACTIVE`, `SUSPENDED`, `BLOCKED`, `CLOSED`), `created_at` TIMESTAMPTZ.
* **RLS:** Lectura/Escritura por miembros autorizados y Admin.

#### 3. `public.business_members`
* **Propósito:** Relación de membresía entre `auth.users` y `businesses`.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `business_id` (FK `businesses.id` ON DELETE CASCADE), `user_id` (FK `auth.users.id` ON DELETE CASCADE).
* **Columnas:** `role` (`BUSINESS_MEMBER_ROLE`: `business_owner`, `business_manager`, `business_employee`), `status` Text (`ACTIVE`, `INVITED`, `SUSPENDED`), `created_at` TIMESTAMPTZ.
* **Constraints:** `UNIQUE(business_id, user_id)`.

#### 4. `public.business_member_locations` (N:M Scope de Sucursales)
* **Propósito:** Relación N:M que define las sucursales específicas autorizadas para gerentes y empleados.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `business_member_id` (FK `business_members.id` ON DELETE CASCADE), `business_location_id` (FK `business_locations.id` ON DELETE CASCADE).
* **Constraints:** `UNIQUE(business_member_id, business_location_id)`.

#### 5. `public.business_locations`
* **Propósito:** Sucursales de origen para recolección de paquetes.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `business_id` (FK `businesses.id` ON DELETE CASCADE).
* **Columnas:** `name` Text, `address_text` Text, `location` GEOGRAPHY(Point, 4326), `pickup_instructions` Text, `is_active` Boolean.
* **Indexes:** `GIST(location)`.

#### 6. `public.drivers`
* **Propósito:** Expediente legal y operativo del motorizado.
* **MVP Status:** MVP.
* **PK:** `id` UUID (FK `auth.users.id` ON DELETE CASCADE).
* **Columnas:** `verification_status` (`DRIVER_VERIFICATION_STATUS`: `PENDING`, `UNDER_REVIEW`, `VERIFIED`, `REJECTED`, `EXPIRED`), `account_status` (`DRIVER_ACCOUNT_STATUS`: `REGISTERED`, `ACTIVE`, `SUSPENDED`, `BLOCKED`, `CLOSED`), `national_id_number` Text, `license_number` Text, `rating_avg` Numeric(3,2), `total_deliveries` Integer, `created_at` TIMESTAMPTZ.

#### 7. `public.driver_documents`
* **Propósito:** Expediente de imágenes y permisos legales del conductor.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `driver_id` (FK `drivers.id` ON DELETE CASCADE).
* **Columnas:** `document_type` Text, `file_path` Text, `verification_status` Text, `rejection_reason` Text, `created_at` TIMESTAMPTZ.
* **Sensibilidad:** Bucket privado con Signed URLs temporales.

#### 8. `public.vehicles`
* **Propósito:** Datos de la motocicleta registrada para el servicio.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `driver_id` (FK `drivers.id` ON DELETE CASCADE).
* **Columnas:** `make` Text, `model` Text, `year` Integer, `color` Text, `license_plate` Text (UNIQUE).

#### 9. `public.driver_presence`
* **Propósito:** Mutex operacional y estado geoespacial en vivo del conductor.
* **MVP Status:** MVP.
* **PK:** `driver_id` UUID (FK `drivers.id` ON DELETE CASCADE).
* **Columnas:** `operational_state` (`DRIVER_OPERATIONAL_STATE`: `OFFLINE`, `AVAILABLE`, `OFFERED`, `BUSY`, `PAUSED`), `current_location` GEOGRAPHY(Point, 4326), `location_updated_at` TIMESTAMPTZ.
* **Indexes:** `GIST(current_location)`, `BTREE(operational_state)`.

---

### 2.2 Cotizaciones, Solicitudes y Entregas

#### 10. `public.delivery_requests`
* **Propósito:** Solicitud inicial con **Snapshots Históricos de Dirección Inmutables**.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `business_id` (FK `businesses.id`), `location_id` (FK `business_locations.id`).
* **Columnas:** `pickup_address_snapshot` JSONB NOT NULL, `dropoff_address_snapshot` JSONB NOT NULL, `recipient_name` Text, `recipient_phone` Text, `dropoff_location` GEOGRAPHY(Point, 4326), `package_type` Text, `cash_to_collect` Numeric(10,2).

#### 11. `public.delivery_quotes` (Relación 1:N con Request)
* **Propósito:** Registro y desglose detallado de cotizaciones. Una solicitud puede generar múltiples cotizaciones; solo una consumida pasa a delivery.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `delivery_request_id` (FK `delivery_requests.id`), `pricing_version_id` (FK `pricing_versions.id`, Nullable).
* **Columnas:** `status` (`QUOTE_STATUS`: `DRAFT`, `QUOTED`, `CONSUMED`, `EXPIRED`, `CANCELED`), `currency` Text DEFAULT 'NIO', `base_amount` Numeric(10,2), `distance_amount` Numeric(10,2), `time_amount` Numeric(10,2), `zone_amount` Numeric(10,2), `demand_amount` Numeric(10,2), `discount_amount` Numeric(10,2), `quoted_total` Numeric(10,2), `driver_earning_estimate` Numeric(10,2), `platform_revenue_estimate` Numeric(10,2), `expires_at` TIMESTAMPTZ, `consumed_at` TIMESTAMPTZ, `created_at` TIMESTAMPTZ.

#### 12. `public.deliveries`
* **Propósito:** Registro maestro del viaje y máquina de estados.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `request_id` (FK `delivery_requests.id`), `quote_id` (FK `delivery_quotes.id`), `driver_id` (FK `drivers.id`, Nullable).
* **Columnas:** `status` (`DELIVERY_STATUS`: `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `TO_PICKUP`, `ARRIVED_PICKUP`, `PICKED_UP`, `TO_DROPOFF`, `ARRIVED_DROPOFF`, `DELIVERED`, `RETURN_REQUIRED`, `RETURNING`, `RETURNED`, `CANCELED`, `FAILED`), `currency` Text DEFAULT 'NIO', `quoted_price` Numeric(10,2), `final_price` Numeric(10,2), `driver_earning` Numeric(10,2), `platform_revenue` Numeric(10,2), `created_at` TIMESTAMPTZ, `delivered_at` TIMESTAMPTZ.
* **Partial Unique Index (Invariante B):**
```sql
CREATE UNIQUE INDEX idx_driver_active_delivery ON public.deliveries (driver_id)
WHERE status IN ('DRIVER_ASSIGNED', 'TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'TO_DROPOFF', 'ARRIVED_DROPOFF', 'RETURN_REQUIRED', 'RETURNING');
```

---

### 2.3 Esquema Privado y Secretos Criptográficos (`private`)

#### 13. `private.delivery_secrets`
* **Propósito:** Aislamiento de hashes de OTP, cifrado server-only de OTP y hashes de Pickup Code. Inaccesible por API directa.
* **MVP Status:** MVP.
* **PK:** `delivery_id` UUID PRIMARY KEY REFERENCES public.deliveries(id) ON DELETE CASCADE.
* **Columnas:** `otp_digest` Text NOT NULL, `otp_ciphertext` Text NOT NULL, `otp_expires_at` TIMESTAMPTZ NOT NULL, `otp_attempt_count` Integer DEFAULT 0, `otp_locked_until` TIMESTAMPTZ, `otp_verified_at` TIMESTAMPTZ, `otp_key_version` Text DEFAULT 'v1', `pickup_code_digest` Text, `pickup_code_expires_at` TIMESTAMPTZ, `pickup_code_used_at` TIMESTAMPTZ.

#### 14. `private.tracking_tokens`
* **Propósito:** Resguardo de hashes SHA-256 de tokens de seguimiento web.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `delivery_id` UUID REFERENCES public.deliveries(id) ON DELETE CASCADE.
* **Columnas:** `token_hash` Text UNIQUE NOT NULL, `expires_at` TIMESTAMPTZ NOT NULL, `revoked_at` TIMESTAMPTZ, `created_at` TIMESTAMPTZ DEFAULT NOW().

#### 15. `public.idempotency_keys`
* **Propósito:** Registro de llaves de idempotencia para prevenir duplicación de mutaciones.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `actor_id` UUID REFERENCES auth.users(id).
* **Columnas:** `scope` Text NOT NULL, `key` Text NOT NULL, `request_fingerprint` Text NOT NULL, `response_status` Integer NOT NULL, `response_body_ref` Text, `created_at` TIMESTAMPTZ DEFAULT NOW(), `expires_at` TIMESTAMPTZ NOT NULL.
* **Constraints:** `UNIQUE(scope, actor_id, key)`.

---

### 2.4 Incidentes, Despacho, Custodia y Pruebas

#### 16. `public.incidents`
* **Propósito:** Registro desacoplado de incidencias operativas.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `delivery_id` REFERENCES public.deliveries(id), `reported_by` REFERENCES auth.users(id).
* **Columnas:** `incident_type` (`INCIDENT_TYPE`), `status` (`INCIDENT_STATUS`: `OPEN`, `UNDER_INVESTIGATION`, `RESOLVED_CONTINUE`, `RESOLVED_RETURN`, `RESOLVED_HANDOFF`, `CLOSED`), `resolution_notes` Text, `created_at` TIMESTAMPTZ DEFAULT NOW().

#### 17. `public.custody_handoffs`
* **Propósito:** Registro de traspasos presenciales supervisados de custodia entre conductores.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `delivery_id` REFERENCES public.deliveries(id), `from_driver_id` REFERENCES public.drivers(id), `to_driver_id` REFERENCES public.drivers(id), `authorized_by` REFERENCES auth.users(id), `proof_id` REFERENCES public.delivery_proofs(id), Nullable.
* **Columnas:** `reason` Text, `status` Text (`INITIATED`, `CONFIRMED_FROM`, `CONFIRMED_TO`, `COMPLETED`, `ABORTED`), `handoff_location` GEOGRAPHY(Point, 4326), `initiated_at` TIMESTAMPTZ, `completed_at` TIMESTAMPTZ.

#### 18. `public.delivery_proofs`
* **Propósito:** Registro de evidencias fotográficas y firmas de custodia.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `delivery_id` REFERENCES public.deliveries(id), `captured_by` REFERENCES auth.users(id).
* **Columnas:** `proof_type` Text (`PICKUP_CUSTODY`, `DELIVERY_PHOTO`, `DELIVERY_SIGNATURE`, `RETURN_PROOF`, `HANDOFF_PROOF`), `file_path` Text, `captured_at` TIMESTAMPTZ DEFAULT NOW().

#### 19. `public.delivery_offers`
* **Propósito:** Ofertas temporizadas emitidas por el Dispatch Engine.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `delivery_id` REFERENCES public.deliveries(id), `driver_id` REFERENCES public.drivers(id).
* **Columnas:** `status` (`OFFER_STATUS`: `OPEN`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELED`), `expires_at` TIMESTAMPTZ NOT NULL, `created_at` TIMESTAMPTZ DEFAULT NOW().

#### 20. `public.delivery_events`
* **Propósito:** Historial inmutable auditable de dominio.
* **MVP Status:** MVP.
* **PK:** `id` BigInt GENERATED ALWAYS AS IDENTITY PRIMARY KEY.
* **FK:** `delivery_id` REFERENCES public.deliveries(id), `actor_user_id` REFERENCES auth.users(id), Nullable.
* **Columnas:** `actor_type` Text (`USER`, `SYSTEM`, `CUSTOMER_CREDENTIAL`, `WEBHOOK`, `BACKGROUND_JOB`, `ADMIN_ACTION`), `event_type` Text (`EVENT_TYPE`), `metadata` JSONB, `created_at` TIMESTAMPTZ DEFAULT NOW().

#### 21. `public.delivery_tracking_points`
* **Propósito:** Historial de coordenadas GPS de ruta de la entrega.
* **MVP Status:** MVP.
* **PK:** `id` BigInt GENERATED ALWAYS AS IDENTITY PRIMARY KEY.
* **FK:** `delivery_id` REFERENCES public.deliveries(id), `driver_id` REFERENCES public.drivers(id).
* **Columnas:** `location` GEOGRAPHY(Point, 4326) NOT NULL, `accuracy` Numeric(6,2), `heading` Numeric(5,2), `speed` Numeric(5,2), `location_quality` Text DEFAULT 'HIGH', `anomaly_flag` Boolean DEFAULT false, `device_timestamp` TIMESTAMPTZ NOT NULL, `server_received_at` TIMESTAMPTZ DEFAULT NOW().

---

### 2.5 Tarificación y Finanzas

#### 22. `public.pricing_versions`
* **Propósito:** Versiones de la matriz de tarificación. MVP. PK: `id` UUID. `effective_from` TIMESTAMPTZ, `is_active` Boolean.

#### 23. `public.pricing_rules`
* **Propósito:** Reglas de tarificación por distancia/tiempo. MVP. PK: `id` UUID. FK: `version_id`. `base_fee` Numeric, `km_rate` Numeric.

#### 24. `public.pricing_zones`
* **Propósito:** Polígonos geoespaciales PostGIS. MVP. PK: `id` UUID. `polygon` GEOGRAPHY(Polygon, 4326), `surge_multiplier` Numeric.

#### 25. `public.pricing_adjustments`
* **Propósito:** Recargos o descuentos sobre la entrega (`WAITING_FEE`, `RETURN_FEE`, `CANCEL_FEE`, `DISCOUNT`, `SUBSIDY`, `MANUAL_ADJUSTMENT`). MVP. PK: `id` UUID. FK: `delivery_id`. `amount` Numeric(10,2), `currency` Text DEFAULT 'NIO'.

#### 26. `public.ledger_accounts`
* **Propósito:** Cuentas contables para partida doble. MVP. PK: `id` UUID. FK: `user_id`, `business_id`. `holder_type` (`USER`, `BUSINESS`, `PLATFORM`), `account_category` (`ASSET_DRIVER_CASH_RECEIVABLE`, `LIABILITY_DRIVER`, `ASSET_BUSINESS_REC`, `REVENUE_PLATFORM`, `BANK_PLATFORM`), `cached_balance` Numeric(12,2).

#### 27. `public.ledger_transactions`
* **Propósito:** Registro maestro de transacciones contables. MVP. PK: `id` UUID. FK: `delivery_id`. `transaction_type` Text, `created_at` TIMESTAMPTZ.

#### 28. `public.ledger_postings`
* **Propósito:** Asientos individuales firmados de débito (`+`) y crédito (`-`). MVP. PK: `id` UUID. FK: `transaction_id`, `account_id`. `amount` Numeric(12,2), `currency` Text DEFAULT 'NIO'. Regla: $\sum \text{amount} = 0$.

#### 29. `public.payments`
* **Propósito:** Intentos de pago/recarga de saldo de comercios. MVP. PK: `id` UUID. FK: `business_id`. `amount` Numeric, `status` Text.

#### 30. `public.driver_payout_methods` (Abstracción de Datos Financieros Sensibles)
* **Propósito:** Métodos de retiro bancario registrados por el conductor, evitando guardar números de cuenta en texto plano en `payouts`.
* **MVP Status:** MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `driver_id` REFERENCES public.drivers(id) ON DELETE CASCADE.
* **Columnas:** `provider_type` Text (`BANK_TRANSFER`, `MOBILE_WALLET`), `masked_display_value` Text NOT NULL, `token_reference` Text NOT NULL, `verification_status` Text DEFAULT 'PENDING', `is_active` Boolean DEFAULT true, `created_at` TIMESTAMPTZ DEFAULT NOW().

#### 31. `public.payouts`
* **Propósito:** Solicitudes de retiro de ganancias de conductores. MVP. PK: `id` UUID. FK: `driver_id`, `payout_method_id` (FK `driver_payout_methods.id`). `amount` Numeric, `status` Text.

#### 32. `public.cash_settlements`
* **Propósito:** Rendición de cuentas de efectivo cobrado en mano. MVP. PK: `id` UUID. FK: `driver_id`, `verified_by`. `expected_amount` Numeric, `reported_amount` Numeric, `settled_amount` Numeric, `difference` Numeric, `currency` Text DEFAULT 'NIO', `status` Text.

---

### 2.6 Notificaciones, Soporte y Auditoría

#### 33. `public.device_tokens`
* **Propósito:** Push tokens (FCM/Expo). MVP. PK: `id` UUID. FK: `user_id`. `push_token` Text UNIQUE, `last_seen_at` TIMESTAMPTZ, `is_active` Boolean.

#### 34. `public.notification_outbox`
* **Propósito:** Outbox asíncrono para envío de alertas. MVP. PK: `id` UUID. FK: `recipient_user_id`. `channel` Text, `payload` JSONB, `status` Text, `attempts` Integer.

#### 35. `public.support_tickets` & 36. `public.audit_logs`
* `support_tickets`: Tickets de soporte operativo (`id`, `delivery_id`, `user_id`, `category`, `status`). MVP.
* `audit_logs`: Log inmutable de acciones administrativas sensibles (`id`, `admin_user_id`, `action`, `reason`, `ip_address`). MVP.
