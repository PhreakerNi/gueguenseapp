# 06 — ARQUITECTURA DE BASE DE DATOS (DATABASE ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.5.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Catálogo Relacional Completo PostgreSQL (37 Entidades MVP Individualizadas), Invariantes de Unicidad y Ciclo de Vida de Secretos  

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
                          │    deliveries     │ (UNIQUE quote_id)
                          └───────────────────┘
```

---

## 2. Especificación Detallada Individualizada de las 37 Entidades MVP

### 2.1 Identidad, Comercios y Conducción

#### 1. `public.profiles`
* **Purpose:** Perfil de usuario e identificador de rol de plataforma. MVP.
* **PK:** `id` UUID (FK `auth.users.id` ON DELETE CASCADE).
* **Columns:** `platform_role` (`PLATFORM_ROLE`), `full_name` Text, `avatar_url` Text, `phone` Text, `created_at` TIMESTAMPTZ.
* **FK / ON DELETE:** `auth.users.id` ON DELETE CASCADE.
* **UNIQUE / CHECK:** `UNIQUE(id)`. CHECK `platform_role` valid.
* **Indexes:** `BTREE(platform_role)`.
* **RLS:** Lectura propia; Admin lectura global. Writer: Backend/User. Reader: Authenticated.
* **Sensitivity / Lifecycle / Retention:** Baja. Permanente.

#### 2. `public.businesses`
* **Purpose:** Expediente legal y comercial de la empresa cliente. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `legal_name` Text, `brand_name` Text, `tax_id` Text, `verification_status` (`BUSINESS_VERIFICATION_STATUS`), `account_status` (`BUSINESS_ACCOUNT_STATUS`), `created_at` TIMESTAMPTZ.
* **FK / ON DELETE:** N/A.
* **UNIQUE / CHECK:** `UNIQUE(tax_id)`.
* **Indexes:** `BTREE(verification_status)`, `BTREE(account_status)`.
* **RLS:** Lectura/Escritura por miembros y Admin. Writer: Business/Admin. Reader: Business Members/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 3. `public.business_members`
* **Purpose:** Relación de membresía entre usuario y comercio. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `business_id` UUID, `user_id` UUID, `role` (`BUSINESS_MEMBER_ROLE`), `status` Text (`ACTIVE`, `INVITED`, `SUSPENDED`), `created_at` TIMESTAMPTZ.
* **FK / ON DELETE:** `business_id` REFERENCES businesses(id) ON DELETE CASCADE, `user_id` REFERENCES auth.users(id) ON DELETE CASCADE.
* **UNIQUE / CHECK:** `UNIQUE(business_id, user_id)`. CHECK status IN ('ACTIVE', 'INVITED', 'SUSPENDED').
* **Indexes:** `BTREE(business_id)`, `BTREE(user_id)`.
* **RLS:** Miembros del comercio y Admin. Writer: Business Owner/Admin. Reader: Business Members/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 4. `public.business_member_locations`
* **Purpose:** Relación N:M que define las sucursales específicas autorizadas para gerentes y empleados. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `business_member_id` UUID, `business_location_id` UUID, `created_at` TIMESTAMPTZ DEFAULT NOW().
* **FK / ON DELETE:** `business_member_id` REFERENCES business_members(id) ON DELETE CASCADE, `business_location_id` REFERENCES business_locations(id) ON DELETE CASCADE.
* **UNIQUE / CHECK:** `UNIQUE(business_member_id, business_location_id)`.
* **Indexes:** `BTREE(business_member_id)`, `BTREE(business_location_id)`.
* **RLS:** Evaluado por RLS para limitar acciones a sucursales autorizadas. Writer: Business Owner/Manager. Reader: Business Members/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 5. `public.business_locations`
* **Purpose:** Sucursales de recolección del comercio. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `business_id` UUID, `name` Text, `address_text` Text, `location` GEOGRAPHY(Point, 4326), `pickup_instructions` Text, `is_active` Boolean DEFAULT true.
* **FK / ON DELETE:** `business_id` REFERENCES businesses(id) ON DELETE CASCADE.
* **UNIQUE / CHECK:** N/A.
* **Indexes:** `GIST(location)`, `BTREE(business_id)`.
* **RLS:** Lectura por miembros del negocio y Admin. Writer: Business Owner/Manager. Reader: Business Members/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 6. `public.drivers`
* **Purpose:** Expediente operativo y legal del motorizado. MVP.
* **PK:** `id` UUID (FK `auth.users.id` ON DELETE CASCADE).
* **Columns:** `verification_status` (`DRIVER_VERIFICATION_STATUS`), `account_status` (`DRIVER_ACCOUNT_STATUS`), `national_id_number` Text, `license_number` Text, `rating_avg` Numeric(3,2), `total_deliveries` Integer DEFAULT 0, `created_at` TIMESTAMPTZ.
* **FK / ON DELETE:** `auth.users.id` ON DELETE CASCADE.
* **UNIQUE / CHECK:** `UNIQUE(national_id_number)`, `UNIQUE(license_number)`.
* **Indexes:** `BTREE(verification_status)`, `BTREE(account_status)`.
* **RLS:** Lectura propia y Admin. Writer: Admin/Driver. Reader: Authenticated.
* **Sensitivity / Lifecycle / Retention:** Alta (PII). Permanente.

#### 7. `public.driver_documents`
* **Purpose:** Archivo privado de documentos legales del conductor. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `driver_id` UUID, `document_type` Text, `file_path` Text, `verification_status` Text, `rejection_reason` Text, `created_at` TIMESTAMPTZ.
* **FK / ON DELETE:** `driver_id` REFERENCES drivers(id) ON DELETE CASCADE.
* **UNIQUE / CHECK:** CHECK status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED').
* **Indexes:** `BTREE(driver_id)`.
* **RLS:** Propio conductor y Verification Agents/Admin. Writer: Driver/Verification Agent. Reader: Driver/Admin.
* **Sensitivity / Lifecycle / Retention:** Alta. Permanente.

#### 8. `public.vehicles`
* **Purpose:** Datos de la motocicleta asignada al servicio. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `driver_id` UUID, `make` Text, `model` Text, `year` Integer, `color` Text, `license_plate` Text.
* **FK / ON DELETE:** `driver_id` REFERENCES drivers(id) ON DELETE CASCADE.
* **UNIQUE / CHECK:** `UNIQUE(license_plate)`.
* **Indexes:** `BTREE(driver_id)`.
* **RLS:** Propio conductor y Admin. Writer: Driver/Admin. Reader: Authenticated.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 9. `public.driver_presence`
* **Purpose:** Mutex operacional y ubicación GPS en tiempo real del conductor. MVP.
* **PK:** `driver_id` UUID (FK `drivers.id` ON DELETE CASCADE).
* **Columns:** `operational_state` (`DRIVER_OPERATIONAL_STATE`), `current_location` GEOGRAPHY(Point, 4326), `location_updated_at` TIMESTAMPTZ.
* **FK / ON DELETE:** `driver_id` REFERENCES drivers(id) ON DELETE CASCADE.
* **UNIQUE / CHECK:** `UNIQUE(driver_id)`.
* **Indexes:** `GIST(current_location)`, `BTREE(operational_state)`.
* **RLS:** Actualización por propio conductor; lectura por Dispatch/Admin. Writer: Driver/System. Reader: System/Admin.
* **Sensitivity / Lifecycle / Retention:** Alta (GPS). Volátil (Ubicación en vivo).

---

### 2.2 Cotizaciones, Solicitudes y Entregas

#### 10. `public.delivery_requests`
* **Purpose:** Solicitud inicial con snapshots de dirección inmutables. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `business_id` UUID, `location_id` UUID, `pickup_address_snapshot` JSONB NOT NULL, `dropoff_address_snapshot` JSONB NOT NULL, `recipient_name` Text, `recipient_phone` Text, `dropoff_location` GEOGRAPHY(Point, 4326), `package_type` Text, `cash_to_collect` Numeric(10,2) DEFAULT 0.
* **FK / ON DELETE:** `business_id` REFERENCES businesses(id), `location_id` REFERENCES business_locations(id).
* **UNIQUE / CHECK:** N/A.
* **Indexes:** `BTREE(business_id)`, `GIST(dropoff_location)`.
* **RLS:** Miembros del comercio y Admin. Writer: Business Members. Reader: Business Members/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 11. `public.delivery_quotes`
* **Purpose:** Desglose de cotizaciones emitidas (1 Request : N Quotes). MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `delivery_request_id` UUID NOT NULL, `pricing_version_id` UUID, `status` (`QUOTE_STATUS`), `currency` Text DEFAULT 'NIO', `base_amount` Numeric(10,2), `distance_amount` Numeric(10,2), `time_amount` Numeric(10,2), `zone_amount` Numeric(10,2), `demand_amount` Numeric(10,2), `discount_amount` Numeric(10,2), `quoted_total` Numeric(10,2), `driver_earning_estimate` Numeric(10,2), `platform_revenue_estimate` Numeric(10,2), `expires_at` TIMESTAMPTZ NOT NULL, `consumed_at` TIMESTAMPTZ, `created_at` TIMESTAMPTZ DEFAULT NOW().
* **FK / ON DELETE:** `delivery_request_id` REFERENCES delivery_requests(id), `pricing_version_id` REFERENCES pricing_versions(id).
* **UNIQUE / CHECK:** Partial Unique Index: Solo 1 quote `CONSUMED` por `delivery_request_id`.
* **Indexes:** `BTREE(delivery_request_id)`, `BTREE(status)`.
* **RLS:** Miembros del comercio y Admin. Writer: System. Reader: Business Members/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Expira en 5 min si no se consume.

#### 12. `public.deliveries`
* **Purpose:** Registro maestro del viaje y máquina de estados. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `request_id` UUID NOT NULL, `quote_id` UUID NOT NULL UNIQUE, `driver_id` UUID, `status` (`DELIVERY_STATUS`), `currency` Text DEFAULT 'NIO', `quoted_price` Numeric(10,2), `final_price` Numeric(10,2), `driver_earning` Numeric(10,2), `platform_revenue` Numeric(10,2), `created_at` TIMESTAMPTZ DEFAULT NOW(), `updated_at` TIMESTAMPTZ DEFAULT NOW(), `delivered_at` TIMESTAMPTZ.
* **FK / ON DELETE:** `request_id` REFERENCES delivery_requests(id), `quote_id` REFERENCES delivery_quotes(id), `driver_id` REFERENCES drivers(id).
* **UNIQUE / CHECK:** `UNIQUE(quote_id)`. Partial Unique Index en `driver_id` para entregas activas (Invariante B).
* **Indexes:** `BTREE(driver_id)`, `BTREE(status)`, `BTREE(request_id)`.
* **RLS:** Comercio, Conductor asignado y Admin. Writer: System/Stored Procedures. Reader: Authenticated Autorizados.
* **Sensitivity / Lifecycle / Retention:** Alta. Permanente.

---

### 2.3 Esquema Privado y Secretos Criptográficos (`private`)

#### 13. `private.delivery_secrets`
* **Purpose:** Aislamiento de hashes de OTP, cifrado server-only de OTP y hashes de Pickup Code. MVP.
* **PK:** `delivery_id` UUID PRIMARY KEY REFERENCES public.deliveries(id) ON DELETE CASCADE.
* **Columns:** `pickup_code_digest` Text, `pickup_code_expires_at` TIMESTAMPTZ, `pickup_code_used_at` TIMESTAMPTZ, `otp_digest` Text NULL, `otp_ciphertext` Text NULL, `otp_expires_at` TIMESTAMPTZ NULL, `otp_attempt_count` Integer DEFAULT 0, `otp_locked_until` TIMESTAMPTZ, `otp_verified_at` TIMESTAMPTZ, `otp_key_version` Text DEFAULT 'v1'.
* **FK / ON DELETE:** `delivery_id` REFERENCES public.deliveries(id) ON DELETE CASCADE.
* **UNIQUE / CHECK:** `UNIQUE(delivery_id)`. Invariante: OTP `NULL` hasta `PICKED_UP`.
* **Indexes:** `BTREE(delivery_id)`.
* **RLS:** INACCESIBLE POR API REST DIRECTA. Acceso exclusivo por SECURITY DEFINER functions.
* **Sensitivity / Lifecycle / Retention:** Máxima. Se purga o archiva post-entrega.

#### 14. `private.tracking_tokens`
* **Purpose:** Resguardo de hashes SHA-256 de tokens de seguimiento web. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `delivery_id` UUID NOT NULL, `token_hash` Text NOT NULL UNIQUE, `expires_at` TIMESTAMPTZ NOT NULL, `revoked_at` TIMESTAMPTZ, `created_at` TIMESTAMPTZ DEFAULT NOW().
* **FK / ON DELETE:** `delivery_id` REFERENCES public.deliveries(id) ON DELETE CASCADE.
* **UNIQUE / CHECK:** `UNIQUE(token_hash)`.
* **Indexes:** `BTREE(token_hash)`.
* **RLS:** Acceso vía backend de tracking token validation.
* **Sensitivity / Lifecycle / Retention:** Alta. Expira post-entrega.

#### 15. `public.idempotency_keys`
* **Purpose:** Registro de llaves de idempotencia para prevenir duplicación de mutaciones. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `actor_id` UUID NOT NULL, `scope` Text NOT NULL, `key` Text NOT NULL, `request_fingerprint` Text NOT NULL, `response_status` Integer NOT NULL, `response_body_ref` Text, `created_at` TIMESTAMPTZ DEFAULT NOW(), `expires_at` TIMESTAMPTZ NOT NULL.
* **FK / ON DELETE:** `actor_id` REFERENCES auth.users(id).
* **UNIQUE / CHECK:** `UNIQUE(scope, actor_id, key)`.
* **Indexes:** `BTREE(scope, actor_id, key)`.
* **RLS:** Lectura/Escritura por propio actor y backend. Writer: System. Reader: Actor/System.
* **Sensitivity / Lifecycle / Retention:** Media. Expira en 24h.

---

### 2.4 Incidentes, Despacho, Custodia y Pruebas

#### 16. `public.incidents`
* **Purpose:** Registro desacoplado de incidencias operativas. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `delivery_id` UUID NOT NULL, `reported_by` UUID NOT NULL, `incident_type` (`INCIDENT_TYPE`), `status` (`INCIDENT_STATUS`), `resolution_notes` Text, `created_at` TIMESTAMPTZ DEFAULT NOW().
* **FK / ON DELETE:** `delivery_id` REFERENCES deliveries(id), `reported_by` REFERENCES auth.users(id).
* **UNIQUE / CHECK:** N/A.
* **Indexes:** `BTREE(delivery_id)`, `BTREE(status)`.
* **RLS:** Reportante, Involucrados y Admin. Writer: User/Admin. Reader: Authenticated Involucrados/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 17. `public.custody_handoffs`
* **Purpose:** Registro de traspasos presenciales supervisados de custodia entre conductores. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `delivery_id` UUID NOT NULL, `from_driver_id` UUID NOT NULL, `to_driver_id` UUID NOT NULL, `authorized_by` UUID NOT NULL, `proof_id` UUID, `reason` Text, `status` Text (`HANDOFF_STATUS`: `INITIATED`, `CONFIRMED_FROM`, `CONFIRMED_TO`, `COMPLETED`, `ABORTED`), `handoff_location` GEOGRAPHY(Point, 4326), `initiated_at` TIMESTAMPTZ DEFAULT NOW(), `completed_at` TIMESTAMPTZ.
* **FK / ON DELETE:** `delivery_id` REFERENCES deliveries(id), `from_driver_id` REFERENCES drivers(id), `to_driver_id` REFERENCES drivers(id), `authorized_by` REFERENCES auth.users(id), `proof_id` REFERENCES delivery_proofs(id).
* **UNIQUE / CHECK:** CHECK status IN ('INITIATED', 'CONFIRMED_FROM', 'CONFIRMED_TO', 'COMPLETED', 'ABORTED').
* **Indexes:** `BTREE(delivery_id)`.
* **RLS:** Conductores involucrados y Admin. Writer: System/Drivers/Admin. Reader: Conductores/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 18. `public.delivery_proofs`
* **Purpose:** Evidencias fotográficas y firmas de custodia. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `delivery_id` UUID NOT NULL, `captured_by` UUID NOT NULL, `proof_type` Text (`PROOF_TYPE`: `PICKUP_CUSTODY`, `DELIVERY_PHOTO`, `DELIVERY_SIGNATURE`, `RETURN_PROOF`, `HANDOFF_PROOF`), `file_path` Text NOT NULL, `captured_at` TIMESTAMPTZ DEFAULT NOW().
* **FK / ON DELETE:** `delivery_id` REFERENCES deliveries(id), `captured_by` REFERENCES auth.users(id).
* **UNIQUE / CHECK:** CHECK proof_type IN ('PICKUP_CUSTODY', 'DELIVERY_PHOTO', 'DELIVERY_SIGNATURE', 'RETURN_PROOF', 'HANDOFF_PROOF').
* **Indexes:** `BTREE(delivery_id)`.
* **RLS:** Involucrados de la entrega y Admin. Writer: Driver/Business/Admin. Reader: Authenticated Involucrados/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 19. `public.delivery_offers`
* **Purpose:** Ofertas temporizadas emitidas por el Dispatch Engine. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **Columns:** `delivery_id` UUID NOT NULL, `driver_id` UUID NOT NULL, `status` (`OFFER_STATUS`), `expires_at` TIMESTAMPTZ NOT NULL, `created_at` TIMESTAMPTZ DEFAULT NOW().
* **FK / ON DELETE:** `delivery_id` REFERENCES deliveries(id), `driver_id` REFERENCES drivers(id).
* **UNIQUE / CHECK:** N/A.
* **Indexes:** `BTREE(driver_id)`, `BTREE(status)`.
* **RLS:** Conductor destinatario y Dispatch. Writer: Dispatch Engine. Reader: Driver/Admin.
* **Sensitivity / Lifecycle / Retention:** Baja. Expira en 15s.

#### 20. `public.delivery_events`
* **Purpose:** Historial inmutable auditable de dominio. MVP.
* **PK:** `id` BigInt GENERATED ALWAYS AS IDENTITY PRIMARY KEY.
* **Columns:** `delivery_id` UUID NOT NULL, `actor_user_id` UUID, `actor_type` Text NOT NULL, `event_type` Text NOT NULL (`EVENT_TYPE`), `metadata` JSONB, `created_at` TIMESTAMPTZ DEFAULT NOW().
* **FK / ON DELETE:** `delivery_id` REFERENCES deliveries(id), `actor_user_id` REFERENCES auth.users(id).
* **UNIQUE / CHECK:** N/A.
* **Indexes:** `BTREE(delivery_id)`, `BTREE(event_type)`.
* **RLS:** Solo lectura por involucrados y Admin. Writer: System/Stored Procedures. Reader: Authenticated Involucrados/Admin.
* **Sensitivity / Lifecycle / Retention:** Media. Permanente.

#### 21. `public.delivery_tracking_points`
* **Purpose:** Historial de coordenadas GPS de ruta de la entrega. MVP.
* **PK:** `id` BigInt GENERATED ALWAYS AS IDENTITY PRIMARY KEY.
* **Columns:** `delivery_id` UUID NOT NULL, `driver_id` UUID NOT NULL, `location` GEOGRAPHY(Point, 4326) NOT NULL, `accuracy` Numeric(6,2), `heading` Numeric(5,2), `speed` Numeric(5,2), `location_quality` Text DEFAULT 'HIGH', `anomaly_flag` Boolean DEFAULT false, `device_timestamp` TIMESTAMPTZ NOT NULL, `server_received_at` TIMESTAMPTZ DEFAULT NOW().
* **FK / ON DELETE:** `delivery_id` REFERENCES deliveries(id), `driver_id` REFERENCES drivers(id).
* **UNIQUE / CHECK:** N/A.
* **Indexes:** `BTREE(delivery_id)`, `GIST(location)`.
* **RLS:** Involucrados y Tracking. Writer: Driver Ingestion API. Reader: Authenticated Involucrados/Admin.
* **Sensitivity / Lifecycle / Retention:** Alta (GPS). Archivo tras 90 días.

---

### 2.5 Tarificación y Finanzas

#### 22. `public.pricing_versions`
* **Purpose:** Versiones de la matriz de tarificación. MVP. PK: `id` UUID. `effective_from` TIMESTAMPTZ, `is_active` Boolean. FK: N/A. Writer: Admin. Reader: System/Admin.

#### 23. `public.pricing_rules`
* **Purpose:** Reglas de tarificación por distancia/tiempo. MVP. PK: `id` UUID. FK: `version_id` REFERENCES pricing_versions(id). `base_fee` Numeric, `km_rate` Numeric. Writer: Admin. Reader: System/Admin.

#### 24. `public.pricing_zones`
* **Purpose:** Polígonos geoespaciales PostGIS. MVP. PK: `id` UUID. `polygon` GEOGRAPHY(Polygon, 4326), `surge_multiplier` Numeric. Writer: Admin. Reader: System/Admin.

#### 25. `public.pricing_adjustments`
* **Purpose:** Recargos o descuentos sobre la entrega (`WAITING_FEE`, `RETURN_FEE`, `CANCEL_FEE`, `DISCOUNT`, `SUBSIDY`, `MANUAL_ADJUSTMENT`). MVP. PK: `id` UUID. FK: `delivery_id` REFERENCES deliveries(id). `amount` Numeric(10,2), `currency` Text DEFAULT 'NIO'. Writer: System/Admin. Reader: Authenticated Involucrados/Admin.

#### 26. `public.ledger_accounts`
* **Purpose:** Cuentas contables para partida doble. MVP. PK: `id` UUID. FK: `user_id` REFERENCES auth.users(id), `business_id` REFERENCES businesses(id). `holder_type` (`USER`, `BUSINESS`, `PLATFORM`), `account_category` (`ASSET_DRIVER_CASH_RECEIVABLE`, `LIABILITY_DRIVER`, `ASSET_BUSINESS_REC`, `REVENUE_PLATFORM`, `BANK_PLATFORM`), `cached_balance` Numeric(12,2). Writer: System Stored Procedures. Reader: Account Holder/Admin.

#### 27. `public.ledger_transactions`
* **Purpose:** Registro maestro de transacciones contables (Journal). MVP. PK: `id` UUID. FK: `delivery_id` REFERENCES deliveries(id). `transaction_type` Text NOT NULL, `created_at` TIMESTAMPTZ DEFAULT NOW(). Writer: System Stored Procedures. Reader: Account Holder/Admin.

#### 28. `public.ledger_postings`
* **Purpose:** Asientos individuales firmados de débito (`+`) y crédito (`-`). MVP. PK: `id` UUID. FK: `transaction_id` REFERENCES ledger_transactions(id), `account_id` REFERENCES ledger_accounts(id). `amount` Numeric(12,2), `currency` Text DEFAULT 'NIO'. Regla: $\sum \text{amount} = 0$. Writer: System Stored Procedures. Reader: Account Holder/Admin.

#### 29. `public.payments`
* **Purpose:** Intentos de pago/recarga de saldo de comercios. MVP. PK: `id` UUID. FK: `business_id` REFERENCES businesses(id). `amount` Numeric, `status` Text (`PAYMENT_STATUS`: `PENDING`, `AUTHORIZED`, `CAPTURED`, `FAILED`, `REFUNDED`). Writer: System/Business. Reader: Business Owner/Admin.

#### 30. `public.driver_payout_methods`
* **Purpose:** Abstracción de métodos de retiro bancario del conductor. MVP. PK: `id` UUID. FK: `driver_id` REFERENCES drivers(id) ON DELETE CASCADE. `provider_type` Text, `masked_display_value` Text, `token_reference` Text, `verification_status` Text (`PAYOUT_METHOD_VERIFICATION_STATUS`: `PENDING`, `VERIFIED`, `REJECTED`, `DISABLED`), `is_active` Boolean. Writer: Driver/Admin. Reader: Driver/Admin.

#### 31. `public.payouts`
* **Purpose:** Solicitudes de retiro de ganancias de conductores. MVP. PK: `id` UUID. FK: `driver_id` REFERENCES drivers(id), `payout_method_id` REFERENCES driver_payout_methods(id). `amount` Numeric, `status` Text (`PAYOUT_STATUS`: `REQUESTED`, `UNDER_REVIEW`, `APPROVED`, `PROCESSING`, `PAID`, `REJECTED`, `FAILED`). Writer: Driver/Admin. Reader: Driver/Admin.

#### 32. `public.cash_settlements`
* **Purpose:** Rendición de cuentas de efectivo cobrado en mano. MVP. PK: `id` UUID. FK: `driver_id` REFERENCES drivers(id), `verified_by` REFERENCES auth.users(id). `expected_amount` Numeric, `reported_amount` Numeric, `settled_amount` Numeric, `difference` Numeric, `currency` Text DEFAULT 'NIO', `status` Text (`CASH_SETTLEMENT_STATUS`: `PENDING`, `UNDER_REVIEW`, `SETTLED`, `DISCREPANCY`, `REJECTED`). Writer: System/Admin. Reader: Driver/Admin.

---

### 2.6 Notificaciones, Soporte y Auditoría

#### 33. `public.device_tokens`
* **Purpose:** Push tokens de dispositivos (FCM/Expo). MVP. PK: `id` UUID. FK: `user_id` REFERENCES auth.users(id). `push_token` Text UNIQUE, `last_seen_at` TIMESTAMPTZ, `is_active` Boolean DEFAULT true. Writer: App Clients. Reader: System/User.

#### 34. `public.notification_outbox`
* **Purpose:** Outbox asíncrono para envío de alertas. MVP. PK: `id` UUID. FK: `recipient_user_id` REFERENCES auth.users(id). `channel` Text, `payload` JSONB, `status` Text (`NOTIFICATION_STATUS`), `attempts` Integer DEFAULT 0. Writer: System. Reader: Notification Worker.

#### 35. `public.notification_deliveries` (Receipts y Deduplicación)
* **Purpose:** Registro de entregas individuales de notificaciones push, desduplicación por receipt y tracking de errores. MVP.
* **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
* **FK:** `notification_id` REFERENCES notification_outbox(id) ON DELETE CASCADE, `device_token_id` REFERENCES device_tokens(id).
* **Columns:** `provider_message_id` Text, `status` Text NOT NULL, `attempt_count` Integer DEFAULT 1, `last_error_code` Text, `sent_at` TIMESTAMPTZ DEFAULT NOW(), `receipt_checked_at` TIMESTAMPTZ.
* **UNIQUE / CHECK:** `UNIQUE(notification_id, device_token_id)`.
* **Indexes:** `BTREE(notification_id)`, `BTREE(provider_message_id)`.
* **RLS:** Solo accesible por Worker/System y Admin. Writer: System Worker. Reader: System/Admin.
* **Sensitivity / Lifecycle / Retention:** Baja. Purga a los 30 días.

#### 36. `public.support_tickets`
* **Purpose:** Tickets de atención a clientes y conductores. MVP. PK: `id` UUID. FK: `delivery_id` REFERENCES deliveries(id), `user_id` REFERENCES auth.users(id). `category` Text, `status` Text (`OPEN`, `IN_PROGRESS`, `RESOLVED`, `CLOSED`). Writer: User/Admin. Reader: User/Admin.

#### 37. `public.audit_logs`
* **Purpose:** Registro inmutable de acciones administrativas sensibles. MVP. PK: `id` BigInt GENERATED ALWAYS AS IDENTITY. FK: `admin_user_id` REFERENCES auth.users(id). `action` Text NOT NULL, `reason` Text NOT NULL, `ip_address` Text, `created_at` TIMESTAMPTZ DEFAULT NOW(). Writer: System/Admin. Reader: SuperAdmin.
