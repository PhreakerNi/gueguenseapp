# 06 — ARQUITECTURA DE BASE DE DATOS (DATABASE ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.7.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Catálogo Relacional Completo PostgreSQL (37 Entidades MVP Individualizadas con Plantilla de 15 Propiedades)

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

- **Purpose:** Perfil de usuario e identificador de rol de plataforma.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY.
- **Columns:** `id` UUID, `platform_role` Text (`PLATFORM_ROLE`), `full_name` Text, `avatar_url` Text, `phone` Text, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `id` REFERENCES auth.users(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** `UNIQUE(id)`.
- **CHECK:** CHECK platform_role IN ('super_admin', 'admin', 'operator', 'verification_agent', 'none').
- **Indexes:** `BTREE(platform_role)`.
- **RLS:** Lectura propia y Admin; actualización propia.
- **Writer:** User/Backend.
- **Reader:** Authenticated Users.
- **Sensitivity:** Media (PII).
- **Lifecycle:** Creado al registrarse el usuario en auth.users.
- **Retention:** Permanente mientras exista la cuenta.

#### 2. `public.businesses`

- **Purpose:** Expediente legal y comercial de la empresa cliente.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `legal_name` Text, `brand_name` Text, `tax_id` Text, `verification_status` Text (`BUSINESS_VERIFICATION_STATUS`), `account_status` Text (`BUSINESS_ACCOUNT_STATUS`), `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** N/A.
- **ON DELETE:** N/A.
- **UNIQUE:** `UNIQUE(tax_id)`.
- **CHECK:** CHECK verification_status IN ('NOT_REQUIRED', 'PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED'), CHECK account_status IN ('ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED').
- **Indexes:** `BTREE(verification_status)`, `BTREE(account_status)`.
- **RLS:** Lectura y gestión por miembros del negocio autorizados y Admin.
- **Writer:** Business Owner/Admin.
- **Reader:** Business Members/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Creado al registrar la empresa (`verification_status = PENDING`, `account_status = ACTIVE`).
- **Retention:** Permanente.

#### 3. `public.business_members`

- **Purpose:** Relación de membresía entre usuario y empresa comercial.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `business_id` UUID NOT NULL, `user_id` UUID NOT NULL, `role` Text NOT NULL (`BUSINESS_MEMBER_ROLE`), `status` Text NOT NULL DEFAULT 'ACTIVE' (`BUSINESS_MEMBER_STATUS`), `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `business_id` REFERENCES businesses(id), `user_id` REFERENCES auth.users(id).
- **ON DELETE:** CASCADE en ambas FKs.
- **UNIQUE:** `UNIQUE(business_id, user_id)`.
- **CHECK:** CHECK role IN ('business_owner', 'business_manager', 'business_employee'), CHECK status IN ('ACTIVE', 'INVITED', 'SUSPENDED').
- **Indexes:** `BTREE(business_id)`, `BTREE(user_id)`.
- **RLS:** Lectura por miembros de la empresa y Admin.
- **Writer:** Business Owner/Admin.
- **Reader:** Business Members/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Creado al invitar/asociar miembro.
- **Retention:** Permanente.

#### 4. `public.business_member_locations`

- **Purpose:** Alcance N:M de sucursales autorizadas para gerentes y empleados.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `business_member_id` UUID NOT NULL, `business_location_id` UUID NOT NULL, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `business_member_id` REFERENCES business_members(id), `business_location_id` REFERENCES business_locations(id).
- **ON DELETE:** CASCADE en ambas FKs.
- **UNIQUE:** `UNIQUE(business_member_id, business_location_id)`.
- **CHECK:** N/A.
- **Indexes:** `BTREE(business_member_id)`, `BTREE(business_location_id)`.
- **RLS:** Evaluado en RLS para restringir acciones a sucursales permitidas.
- **Writer:** Business Owner/Manager/Admin.
- **Reader:** Business Members/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Asignado al vincular miembro a sucursal.
- **Retention:** Permanente.

#### 5. `public.business_locations`

- **Purpose:** Sucursales de origen para recolección de envíos.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `business_id` UUID NOT NULL, `name` Text NOT NULL, `address_text` Text NOT NULL, `location` GEOGRAPHY(Point, 4326) NOT NULL, `pickup_instructions` Text, `is_active` Boolean DEFAULT true, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `business_id` REFERENCES businesses(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** N/A.
- **CHECK:** N/A.
- **Indexes:** `GIST(location)`, `BTREE(business_id)`.
- **RLS:** Lectura por miembros del comercio y Admin.
- **Writer:** Business Owner/Manager/Admin.
- **Reader:** Business Members/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Creado al dar de alta la sucursal.
- **Retention:** Permanente.

#### 6. `public.drivers`

- **Purpose:** Expediente operativo y legal del motorizado.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY.
- **Columns:** `id` UUID, `verification_status` Text NOT NULL DEFAULT 'PENDING' (`DRIVER_VERIFICATION_STATUS`), `account_status` Text NOT NULL DEFAULT 'REGISTERED' (`DRIVER_ACCOUNT_STATUS`), `national_id_number` Text, `license_number` Text, `rating_avg` Numeric(3,2) DEFAULT 5.00, `total_deliveries` Integer DEFAULT 0, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `id` REFERENCES auth.users(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** `UNIQUE(national_id_number)`, `UNIQUE(license_number)`.
- **CHECK:** CHECK verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED'), CHECK account_status IN ('REGISTERED', 'ACTIVE', 'SUSPENDED', 'BLOCKED', 'CLOSED').
- **Indexes:** `BTREE(verification_status)`, `BTREE(account_status)`.
- **RLS:** Lectura propia y Admin; actualización por Admin/Verification Agent.
- **Writer:** Admin/Driver.
- **Reader:** Authenticated Users.
- **Sensitivity:** Alta (PII).
- **Lifecycle:** Creado al registrarse el conductor (`verification_status = PENDING`, `account_status = REGISTERED`).
- **Retention:** Permanente.

#### 7. `public.driver_documents`

- **Purpose:** Archivo de documentos legales cargados por el conductor.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `driver_id` UUID NOT NULL, `document_type` Text NOT NULL, `file_path` Text NOT NULL, `verification_status` Text DEFAULT 'PENDING' (`DOCUMENT_VERIFICATION_STATUS`), `rejection_reason` Text, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `driver_id` REFERENCES drivers(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** N/A.
- **CHECK:** CHECK verification_status IN ('PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED').
- **Indexes:** `BTREE(driver_id)`, `BTREE(verification_status)`.
- **RLS:** Acceso exclusivo a propio conductor y Verification Agents/Admin.
- **Writer:** Driver/Verification Agent.
- **Reader:** Driver/Admin.
- **Sensitivity:** Alta.
- **Lifecycle:** Creado durante el proceso de onboarding mediante referencia de subida previa autorizada por backend.
- **Retention:** Permanente.

#### 8. `public.vehicles`

- **Purpose:** Motocicleta registrada para la prestación del servicio.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `driver_id` UUID NOT NULL, `make` Text NOT NULL, `model` Text NOT NULL, `year` Integer NOT NULL, `color` Text NOT NULL, `license_plate` Text NOT NULL, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `driver_id` REFERENCES drivers(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** `UNIQUE(license_plate)`.
- **CHECK:** N/A.
- **Indexes:** `BTREE(driver_id)`.
- **RLS:** Lectura por propio conductor y Admin.
- **Writer:** Driver/Admin.
- **Reader:** Authenticated Users.
- **Sensitivity:** Media.
- **Lifecycle:** Creado durante el registro del vehículo.
- **Retention:** Permanente.

#### 9. `public.driver_presence`

- **Purpose:** Mutex operacional y estado de disponibilidad del conductor.
- **MVP Status:** MVP.
- **PK:** `driver_id` UUID PRIMARY KEY.
- **Columns:** `driver_id` UUID, `operational_state` Text NOT NULL DEFAULT 'OFFLINE' (`DRIVER_OPERATIONAL_STATE`), `current_location` GEOGRAPHY(Point, 4326), `location_updated_at` TIMESTAMPTZ.
- **FK:** `driver_id` REFERENCES drivers(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** `UNIQUE(driver_id)`.
- **CHECK:** CHECK operational_state IN ('OFFLINE', 'AVAILABLE', 'OFFERED', 'BUSY', 'PAUSED').
- **Indexes:** `GIST(current_location)`, `BTREE(operational_state)`.
- **RLS:** RLS RESTREÑE ESCRITURA DIRECTA DE COORDENADAS DESDE CLIENTE. Actualización de ubicación realizada por la función/endpoint validado de ingesta GPS.
- **Writer:** Server-side Validated Ingestion / Stored Procedures.
- **Reader:** System/Dispatch/Admin.
- **Sensitivity:** Alta (GPS en tiempo real).
- **Lifecycle:** Creado al registrar al conductor; actualizado de forma continua.
- **Retention:** Estado volátil en vivo.

---

### 2.2 Cotizaciones, Solicitudes y Entregas

#### 10. `public.delivery_requests`

- **Purpose:** Solicitud de envío con snapshots de dirección inmutables.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `business_id` UUID NOT NULL, `location_id` UUID NOT NULL, `pickup_address_snapshot` JSONB NOT NULL, `dropoff_address_snapshot` JSONB NOT NULL, `recipient_name` Text NOT NULL, `recipient_phone` Text NOT NULL, `dropoff_location` GEOGRAPHY(Point, 4326) NOT NULL, `package_type` Text NOT NULL, `cash_to_collect` Numeric(10,2) DEFAULT 0.00, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `business_id` REFERENCES businesses(id), `location_id` REFERENCES business_locations(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** N/A.
- **Indexes:** `BTREE(business_id)`, `GIST(dropoff_location)`.
- **RLS:** Lectura/Escritura por miembros del comercio en sucursal permitida.
- **Writer:** Business Members.
- **Reader:** Business Members/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Creado al iniciar el formulario de cotización.
- **Retention:** Permanente.

#### 11. `public.delivery_quotes`

- **Purpose:** Cotizaciones emitidas para una solicitud (1 Request : N Quotes).
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `delivery_request_id` UUID NOT NULL, `pricing_version_id` UUID, `status` Text NOT NULL DEFAULT 'QUOTED' (`QUOTE_STATUS`), `currency` Text DEFAULT 'NIO', `base_amount` Numeric(10,2), `distance_amount` Numeric(10,2), `time_amount` Numeric(10,2), `zone_amount` Numeric(10,2), `demand_amount` Numeric(10,2), `discount_amount` Numeric(10,2), `quoted_total` Numeric(10,2), `driver_earning_estimate` Numeric(10,2), `platform_revenue_estimate` Numeric(10,2), `expires_at` TIMESTAMPTZ NOT NULL, `consumed_at` TIMESTAMPTZ, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_request_id` REFERENCES delivery_requests(id), `pricing_version_id` REFERENCES pricing_versions(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** Partial Unique Index: Máximo 1 quote `CONSUMED` por `delivery_request_id`.
- **CHECK:** CHECK status IN ('DRAFT', 'QUOTED', 'CONSUMED', 'EXPIRED', 'CANCELED').
- **Indexes:** `BTREE(delivery_request_id)`, `BTREE(status)`.
- **RLS:** Lectura por miembros del negocio autorizados y Admin.
- **Writer:** System Pricing Engine.
- **Reader:** Business Members/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Expira tras el timeout configurable (5 min initial default); pasa a `CONSUMED` al crear delivery.
- **Retention:** Permanente.

#### 12. `public.deliveries`

- **Purpose:** Registro maestro del viaje y máquina de estados.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `request_id` UUID NOT NULL, `quote_id` UUID NOT NULL, `driver_id` UUID, `status` Text NOT NULL DEFAULT 'SEARCHING_DRIVER' (`DELIVERY_STATUS`), `currency` Text DEFAULT 'NIO', `quoted_price` Numeric(10,2), `final_price` Numeric(10,2), `driver_earning` Numeric(10,2), `platform_revenue` Numeric(10,2), `created_at` TIMESTAMPTZ DEFAULT NOW(), `updated_at` TIMESTAMPTZ DEFAULT NOW(), `delivered_at` TIMESTAMPTZ.
- **FK:** `request_id` REFERENCES delivery_requests(id), `quote_id` REFERENCES delivery_quotes(id), `driver_id` REFERENCES drivers(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** `UNIQUE(quote_id)`. Partial Unique Index en `driver_id` para entregas activas (Invariante B).
- **CHECK:** CHECK status IN ('SEARCHING_DRIVER', 'DRIVER_ASSIGNED', 'TO_PICKUP', 'ARRIVED_PICKUP', 'PICKED_UP', 'TO_DROPOFF', 'ARRIVED_DROPOFF', 'DELIVERED', 'RETURN_REQUIRED', 'RETURNING', 'RETURNED', 'CANCELED', 'FAILED').
- **Indexes:** `BTREE(driver_id)`, `BTREE(status)`, `BTREE(request_id)`.
- **RLS:** Comercio, Conductor asignado y Admin.
- **Writer:** System Stored Procedures.
- **Reader:** Authenticated Involucrados/Admin.
- **Sensitivity:** Alta.
- **Lifecycle:** Transita desde `SEARCHING_DRIVER` hasta un estado terminal (`DELIVERED`, `RETURNED`, `CANCELED`, `FAILED`).
- **Retention:** Permanente.

---

### 2.3 Esquema Privado y Secretos Criptográficos (`private`)

#### 13. `private.delivery_secrets`

- **Purpose:** Aislamiento de hashes de OTP, cifrado server-only de OTP y hashes de Pickup Code.
- **MVP Status:** MVP.
- **PK:** `delivery_id` UUID PRIMARY KEY.
- **Columns:** `delivery_id` UUID, `pickup_code_digest` Text, `pickup_code_expires_at` TIMESTAMPTZ, `pickup_code_used_at` TIMESTAMPTZ, `otp_digest` Text NULL, `otp_ciphertext` Text NULL, `otp_expires_at` TIMESTAMPTZ NULL, `otp_attempt_count` Integer DEFAULT 0, `otp_locked_until` TIMESTAMPTZ, `otp_verified_at` TIMESTAMPTZ, `otp_key_version` Text DEFAULT 'v1'.
- **FK:** `delivery_id` REFERENCES public.deliveries(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** `UNIQUE(delivery_id)`.
- **CHECK:** N/A. Invariante: OTP `NULL` en etapas pre-pickup; se genera al transitar a `PICKED_UP`.
- **Indexes:** `BTREE(delivery_id)`.
- **RLS:** INACCESIBLE POR API REST DIRECTA. Acceso exclusivo mediante SECURITY DEFINER functions.
- **Writer:** System Stored Procedures.
- **Reader:** Security Definer Functions.
- **Sensitivity:** Máxima Criptográfica.
- **Lifecycle:** Creado en `ARRIVED_PICKUP`; activado en `PICKED_UP`; bloqueado tras `DELIVERED`.
- **Retention:** Archivo/Purga según política de seguridad.

#### 14. `private.tracking_tokens`

- **Purpose:** Resguardo de hashes SHA-256 de tokens de seguimiento web.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `delivery_id` UUID NOT NULL, `token_hash` Text NOT NULL, `expires_at` TIMESTAMPTZ NOT NULL, `revoked_at` TIMESTAMPTZ, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_id` REFERENCES public.deliveries(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** `UNIQUE(token_hash)`.
- **CHECK:** N/A.
- **Indexes:** `BTREE(token_hash)`.
- **RLS:** Acceso reservado a funciones del backend de tracking token validation.
- **Writer:** System.
- **Reader:** Tracking Validation Backend.
- **Sensitivity:** Alta.
- **Lifecycle:** Generado al crear la entrega; expira al concluir el servicio.
- **Retention:** Purga post-expiración.

#### 15. `public.idempotency_keys`

- **Purpose:** Registro de llaves de idempotencia para prevenir duplicación de mutaciones (Humano, Sistema o Webhook).
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `actor_type` Text NOT NULL, `actor_user_id` UUID NULL, `external_actor_key` Text NULL, `scope` Text NOT NULL, `key` Text NOT NULL, `request_fingerprint` Text NOT NULL, `response_status` Integer NOT NULL, `response_body_ref` Text, `created_at` TIMESTAMPTZ DEFAULT NOW(), `expires_at` TIMESTAMPTZ NOT NULL.
- **FK:** `actor_user_id` REFERENCES auth.users(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** `UNIQUE(scope, key)`.
- **CHECK:** CHECK actor_type IN ('USER', 'SYSTEM', 'WEBHOOK', 'BACKGROUND_JOB').
- **Invariantes de Identidad del Actor:**
  - `actor_type = 'USER'` $\rightarrow$ `actor_user_id NOT NULL`.
  - `actor_type IN ('SYSTEM', 'BACKGROUND_JOB')` $\rightarrow$ `actor_user_id` puede ser NULL; `external_actor_key` identifica el subsistema cuando aplique.
  - `actor_type = 'WEBHOOK'` $\rightarrow$ `external_actor_key` (identificador de proveedor) OBLIGATORIO; `actor_user_id` normalmente NULL.
  - **Comportamiento de Fingerprint:** Mismo `key` + mismo `request_fingerprint` $\rightarrow$ respuesta idempotente previa; mismo `key` + `request_fingerprint` distinto $\rightarrow$ `IDEMPOTENCY_FINGERPRINT_MISMATCH` (422).
- **Indexes:** `BTREE(scope, key)`.
- **RLS:** Acceso por propio actor o worker del sistema.
- **Writer:** System/Api Gateway.
- **Reader:** System/Actor.
- **Sensitivity:** Media.
- **Lifecycle:** Expira tras 24 horas.
- **Retention:** Purga automática post-expiración.

---

### 2.4 Incidentes, Despacho, Custodia y Pruebas

#### 16. `public.incidents`

- **Purpose:** Registro desacoplado de incidencias operativas.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `delivery_id` UUID NOT NULL, `reported_by` UUID NOT NULL, `incident_type` Text NOT NULL (`INCIDENT_TYPE`), `status` Text NOT NULL DEFAULT 'OPEN' (`INCIDENT_STATUS`), `resolution_notes` Text, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_id` REFERENCES deliveries(id), `reported_by` REFERENCES auth.users(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** CHECK status IN ('OPEN', 'UNDER_INVESTIGATION', 'RESOLVED_CONTINUE', 'RESOLVED_RETURN', 'RESOLVED_HANDOFF', 'CLOSED').
- **Indexes:** `BTREE(delivery_id)`, `BTREE(status)`.
- **RLS:** Reportante, involucrados de la entrega y Admin.
- **Writer:** User/Admin.
- **Reader:** Authenticated Involucrados/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Creado al reportar un problema; cerrado por operador.
- **Retention:** Permanente.

#### 17. `public.custody_handoffs`

- **Purpose:** Registro de traspasos presenciales supervisados de custodia entre conductores.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `delivery_id` UUID NOT NULL, `from_driver_id` UUID NOT NULL, `to_driver_id` UUID NOT NULL, `authorized_by` UUID NOT NULL, `proof_id` UUID, `reason` Text, `status` Text NOT NULL DEFAULT 'INITIATED' (`HANDOFF_STATUS`), `handoff_location` GEOGRAPHY(Point, 4326), `initiated_at` TIMESTAMPTZ DEFAULT NOW(), `completed_at` TIMESTAMPTZ.
- **FK:** `delivery_id` REFERENCES deliveries(id), `from_driver_id` REFERENCES drivers(id), `to_driver_id` REFERENCES drivers(id), `authorized_by` REFERENCES auth.users(id), `proof_id` REFERENCES delivery_proofs(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** CHECK status IN ('INITIATED', 'CONFIRMED_FROM', 'CONFIRMED_TO', 'COMPLETED', 'ABORTED').
- **Indexes:** `BTREE(delivery_id)`.
- **RLS:** Conductores involucrados y Admin.
- **Writer:** System/Conductores/Admin.
- **Reader:** Conductores/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Creado y autorizado por Admin (`POST /api/v1/admin/handoffs`); finaliza en `COMPLETED` tras `confirm-to`.
- **Retention:** Permanente.

#### 18. `public.delivery_proofs`

- **Purpose:** Evidencias fotográficas y firmas digitales de custodia.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `delivery_id` UUID NOT NULL, `captured_by` UUID NOT NULL, `proof_type` Text NOT NULL (`PROOF_TYPE`), `file_path` Text NOT NULL, `captured_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_id` REFERENCES deliveries(id), `captured_by` REFERENCES auth.users(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** CHECK proof_type IN ('PICKUP_CUSTODY', 'DELIVERY_PHOTO', 'DELIVERY_SIGNATURE', 'RETURN_PROOF', 'HANDOFF_PROOF').
- **Indexes:** `BTREE(delivery_id)`.
- **RLS:** Involucrados de la entrega y Admin.
- **Writer:** Driver/Business/Admin.
- **Reader:** Authenticated Involucrados/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Registrado al capturar evidencia.
- **Retention:** Permanente.

#### 19. `public.delivery_offers`

- **Purpose:** Ofertas temporizadas emitidas por el Dispatch Engine.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `delivery_id` UUID NOT NULL, `driver_id` UUID NOT NULL, `status` Text NOT NULL DEFAULT 'OPEN' (`OFFER_STATUS`), `expires_at` TIMESTAMPTZ NOT NULL, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_id` REFERENCES deliveries(id), `driver_id` REFERENCES drivers(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** N/A.
- **CHECK:** CHECK status IN ('OPEN', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELED').
- **Indexes:** `BTREE(driver_id)`, `BTREE(status)`.
- **RLS:** Conductor destinatario de la oferta y Dispatch Engine.
- **Writer:** Dispatch Engine.
- **Reader:** Driver/Admin.
- **Sensitivity:** Baja.
- **Lifecycle:** Expira tras 15 segundos (initial default / configurable policy).
- **Retention:** Purga periódica post-expiración.

#### 20. `public.delivery_events`

- **Purpose:** Historial inmutable auditable de eventos de dominio.
- **MVP Status:** MVP.
- **PK:** `id` BigInt GENERATED ALWAYS AS IDENTITY PRIMARY KEY.
- **Columns:** `id` BigInt, `delivery_id` UUID NOT NULL, `actor_user_id` UUID, `actor_type` Text NOT NULL, `event_type` Text NOT NULL (`EVENT_TYPE`), `metadata` JSONB, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_id` REFERENCES deliveries(id), `actor_user_id` REFERENCES auth.users(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** N/A.
- **Indexes:** `BTREE(delivery_id)`, `BTREE(event_type)`.
- **RLS:** Solo lectura por involucrados y Admin.
- **Writer:** System Stored Procedures.
- **Reader:** Authenticated Involucrados/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Apéndice inmutable (_append-only_).
- **Retention:** Permanente.

#### 21. `public.delivery_tracking_points`

- **Purpose:** Coordenadas GPS registradas durante el viaje.
- **MVP Status:** MVP.
- **PK:** `id` BigInt GENERATED ALWAYS AS IDENTITY PRIMARY KEY.
- **Columns:** `id` BigInt, `delivery_id` UUID NOT NULL, `driver_id` UUID NOT NULL, `location` GEOGRAPHY(Point, 4326) NOT NULL, `accuracy` Numeric(6,2), `heading` Numeric(5,2), `speed` Numeric(5,2), `location_quality` Text DEFAULT 'HIGH', `anomaly_flag` Boolean DEFAULT false, `device_timestamp` TIMESTAMPTZ NOT NULL, `server_received_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_id` REFERENCES deliveries(id), `driver_id` REFERENCES drivers(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** N/A.
- **CHECK:** N/A.
- **Indexes:** `BTREE(delivery_id)`, `GIST(location)`.
- **RLS:** RLS BLOQUEA LECTURA DIRECTA A CLIENTES TRACKING ANÓNIMOS. Escritura permitida únicamente vía backend de ingesta GPS validada.
- **Writer:** Validated Location Ingestion Backend.
- **Reader:** Authenticated Involucrados/Admin.
- **Sensitivity:** Alta (GPS).
- **Lifecycle:** Generado continuamente durante el tránsito.
- **Retention:** Archivado post-entrega.

---

### 2.5 Tarificación y Finanzas

#### 22. `public.pricing_versions`

- **Purpose:** Matriz versionada de reglas de precios.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `name` Text NOT NULL, `effective_from` TIMESTAMPTZ NOT NULL, `effective_to` TIMESTAMPTZ, `is_active` Boolean DEFAULT true, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** N/A.
- **ON DELETE:** N/A.
- **UNIQUE:** N/A.
- **CHECK:** N/A.
- **Indexes:** `BTREE(is_active)`.
- **RLS:** Lectura pública autenticada; escritura exclusiva por Admin.
- **Writer:** Admin.
- **Reader:** System/Admin.
- **Sensitivity:** Baja.
- **Lifecycle:** Creada por Admin para ajustar la tarificación global.
- **Retention:** Permanente.

#### 23. `public.pricing_rules`

- **Purpose:** Reglas por distancia, tiempo y tarifa base.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `pricing_version_id` UUID NOT NULL, `base_fee` Numeric(10,2) NOT NULL, `per_km_rate` Numeric(10,2) NOT NULL, `per_minute_rate` Numeric(10,2) NOT NULL, `min_fare` Numeric(10,2) NOT NULL.
- **FK:** `pricing_version_id` REFERENCES pricing_versions(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** N/A.
- **CHECK:** N/A.
- **Indexes:** `BTREE(pricing_version_id)`.
- **RLS:** Lectura autenticada; escritura exclusiva por Admin.
- **Writer:** Admin.
- **Reader:** System/Admin.
- **Sensitivity:** Baja.
- **Lifecycle:** Asociada a la versión de precios.
- **Retention:** Permanente.

#### 24. `public.pricing_zones`

- **Purpose:** Polígonos geoespaciales PostGIS para tarifas de zona o alta demanda.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `name` Text NOT NULL, `polygon` GEOGRAPHY(Polygon, 4326) NOT NULL, `surge_multiplier` Numeric(3,2) DEFAULT 1.00, `is_active` Boolean DEFAULT true.
- **FK:** N/A.
- **ON DELETE:** N/A.
- **UNIQUE:** N/A.
- **CHECK:** N/A.
- **Indexes:** `GIST(polygon)`.
- **RLS:** Lectura autenticada; escritura exclusiva por Admin.
- **Writer:** Admin.
- **Reader:** System/Admin.
- **Sensitivity:** Baja.
- **Lifecycle:** Creada por Admin para delimitar polígonos urbanos.
- **Retention:** Permanente.

#### 25. `public.pricing_adjustments`

- **Purpose:** Recargos o descuentos aplicados a una entrega.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `delivery_id` UUID NOT NULL, `adjustment_type` Text NOT NULL (`PRICING_ADJUSTMENT_TYPE`), `amount` Numeric(10,2) NOT NULL, `currency` Text DEFAULT 'NIO', `reason` Text, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_id` REFERENCES deliveries(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** CHECK adjustment_type IN ('WAITING_FEE', 'RETURN_FEE', 'CANCEL_FEE', 'DISCOUNT', 'SUBSIDY', 'MANUAL_ADJUSTMENT').
- **Indexes:** `BTREE(delivery_id)`.
- **RLS:** Involucrados de la entrega y Admin.
- **Writer:** System/Admin.
- **Reader:** Authenticated Involucrados/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Generado en demoras, devoluciones o ajustes de arbitraje.
- **Retention:** Permanente.

#### 26. `public.ledger_accounts`

- **Purpose:** Cuentas contables individuales para partida doble.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `holder_type` Text NOT NULL, `user_id` UUID, `business_id` UUID, `account_category` Text NOT NULL, `cached_balance` Numeric(12,2) DEFAULT 0.00, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `user_id` REFERENCES auth.users(id), `business_id` REFERENCES businesses(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** `UNIQUE(holder_type, user_id, business_id, account_category)`.
- **CHECK:** CHECK account_category IN ('ASSET_DRIVER_CASH_RECEIVABLE', 'LIABILITY_DRIVER', 'ASSET_BUSINESS_REC', 'REVENUE_PLATFORM', 'BANK_PLATFORM').
- **Indexes:** `BTREE(user_id)`, `BTREE(business_id)`.
- **RLS:** Lectura por titular y Admin; modificación exclusiva por procedimientos contables backend.
- **Writer:** System Stored Procedures.
- **Reader:** Titular/Admin.
- **Sensitivity:** Alta.
- **Lifecycle:** Creada al dar de alta el perfil de usuario o empresa.
- **Retention:** Permanente.

#### 27. `public.ledger_transactions`

- **Purpose:** Registro maestro de transacciones contables (Journal).
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `delivery_id` UUID, `transaction_type` Text NOT NULL, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_id` REFERENCES deliveries(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** N/A.
- **Indexes:** `BTREE(delivery_id)`.
- **RLS:** Lectura por involucrados y Admin.
- **Writer:** System Stored Procedures.
- **Reader:** Titular/Admin.
- **Sensitivity:** Alta.
- **Lifecycle:** Registro inmutable del asiento.
- **Retention:** Permanente.

#### 28. `public.ledger_postings`

- **Purpose:** Asientos individuales firmados de débito (`+`) y crédito (`-`).
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `transaction_id` UUID NOT NULL, `account_id` UUID NOT NULL, `amount` Numeric(12,2) NOT NULL, `currency` Text DEFAULT 'NIO', `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `transaction_id` REFERENCES ledger_transactions(id), `account_id` REFERENCES ledger_accounts(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** N/A. Invariante: $\sum \text{amount} = 0$ por `transaction_id`.
- **Indexes:** `BTREE(transaction_id)`, `BTREE(account_id)`.
- **RLS:** Lectura por titular de la cuenta y Admin.
- **Writer:** System Stored Procedures.
- **Reader:** Titular/Admin.
- **Sensitivity:** Alta.
- **Lifecycle:** Asiento contable inmutable.
- **Retention:** Permanente.

#### 29. `public.payments`

- **Purpose:** Intentos de recarga de saldo o pago de comercios.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `business_id` UUID NOT NULL, `amount` Numeric(10,2) NOT NULL, `currency` Text DEFAULT 'NIO', `status` Text NOT NULL DEFAULT 'PENDING' (`PAYMENT_STATUS`), `provider_reference` Text, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `business_id` REFERENCES businesses(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** CHECK status IN ('PENDING', 'AUTHORIZED', 'CAPTURED', 'FAILED', 'REFUNDED').
- **Indexes:** `BTREE(business_id)`, `BTREE(status)`.
- **RLS:** Lectura por miembros del negocio y Admin.
- **Writer:** System/Payment Gateway.
- **Reader:** Business Members/Admin.
- **Sensitivity:** Alta.
- **Lifecycle:** Pasa de `PENDING` a `CAPTURED` o `FAILED`.
- **Retention:** Permanente.

#### 30. `public.driver_payout_methods`

- **Purpose:** Abstracción de métodos de retiro bancario del conductor.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `driver_id` UUID NOT NULL, `provider_type` Text NOT NULL, `masked_display_value` Text NOT NULL, `token_reference` Text NOT NULL, `verification_status` Text DEFAULT 'PENDING' (`PAYOUT_METHOD_VERIFICATION_STATUS`), `is_active` Boolean DEFAULT true, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `driver_id` REFERENCES drivers(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** N/A.
- **CHECK:** CHECK verification_status IN ('PENDING', 'VERIFIED', 'REJECTED', 'DISABLED').
- **Indexes:** `BTREE(driver_id)`.
- **RLS:** Lectura/Escritura por propio conductor y Admin.
- **Writer:** Driver/Admin.
- **Reader:** Driver/Admin.
- **Sensitivity:** Alta.
- **Lifecycle:** Registrado por el conductor para recibir pagos.
- **Retention:** Permanente.

#### 31. `public.payouts`

- **Purpose:** Solicitudes de retiro de ganancias de conductores.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `driver_id` UUID NOT NULL, `payout_method_id` UUID NOT NULL, `amount` Numeric(10,2) NOT NULL, `currency` Text DEFAULT 'NIO', `status` Text NOT NULL DEFAULT 'REQUESTED' (`PAYOUT_STATUS`), `created_at` TIMESTAMPTZ DEFAULT NOW(), `processed_at` TIMESTAMPTZ.
- **FK:** `driver_id` REFERENCES drivers(id), `payout_method_id` REFERENCES driver_payout_methods(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** CHECK status IN ('REQUESTED', 'UNDER_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED', 'FAILED').
- **Indexes:** `BTREE(driver_id)`, `BTREE(status)`.
- **RLS:** Propio conductor y Admin.
- **Writer:** Driver/Admin.
- **Reader:** Driver/Admin.
- **Sensitivity:** Alta.
- **Lifecycle:** `REQUESTED` $\rightarrow$ `APPROVED` $\rightarrow$ `PROCESSING` $\rightarrow$ `PAID`.
- **Retention:** Permanente.

#### 32. `public.cash_settlements`

- **Purpose:** Rendición de cuentas de efectivo cobrado en mano.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `driver_id` UUID NOT NULL, `verified_by` UUID NOT NULL, `expected_amount` Numeric(10,2) NOT NULL, `reported_amount` Numeric(10,2) NOT NULL, `settled_amount` Numeric(10,2) NOT NULL, `difference` Numeric(10,2) DEFAULT 0.00, `currency` Text DEFAULT 'NIO', `status` Text NOT NULL DEFAULT 'PENDING' (`CASH_SETTLEMENT_STATUS`), `created_at` TIMESTAMPTZ DEFAULT NOW(), `settled_at` TIMESTAMPTZ.
- **FK:** `driver_id` REFERENCES drivers(id), `verified_by` REFERENCES auth.users(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** CHECK status IN ('PENDING', 'UNDER_REVIEW', 'SETTLED', 'DISCREPANCY', 'REJECTED').
- **Indexes:** `BTREE(driver_id)`.
- **RLS:** Conductor y Admin.
- **Writer:** Admin/System.
- **Reader:** Driver/Admin.
- **Sensitivity:** Alta.
- **Lifecycle:** Registrado al conciliar efectivo en mano.
- **Retention:** Permanente.

---

### 2.6 Notificaciones, Soporte y Auditoría

#### 33. `public.device_tokens`

- **Purpose:** Push tokens de dispositivos (FCM/Expo).
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `user_id` UUID NOT NULL, `push_token` Text NOT NULL, `last_seen_at` TIMESTAMPTZ DEFAULT NOW(), `is_active` Boolean DEFAULT true, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `user_id` REFERENCES auth.users(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** `UNIQUE(push_token)`.
- **CHECK:** N/A.
- **Indexes:** `BTREE(user_id)`.
- **RLS:** Registro por propio usuario y worker del sistema.
- **Writer:** App Clients/System.
- **Reader:** System/User.
- **Sensitivity:** Media.
- **Lifecycle:** Registrado al iniciar sesión en app móvil.
- **Retention:** Permanente mientras el token sea válido.

#### 34. `public.notification_outbox`

- **Purpose:** Outbox asíncrono para envío de notificaciones push.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `recipient_user_id` UUID NOT NULL, `channel` Text NOT NULL, `payload` JSONB NOT NULL, `status` Text NOT NULL DEFAULT 'QUEUED' (`NOTIFICATION_STATUS`), `attempts` Integer DEFAULT 0, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `recipient_user_id` REFERENCES auth.users(id).
- **ON DELETE:** CASCADE.
- **UNIQUE:** N/A.
- **CHECK:** CHECK status IN ('QUEUED', 'SENDING', 'DELIVERED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT').
- **Indexes:** `BTREE(status)`.
- **RLS:** Solo accesible por Workers del sistema y Admin.
- **Writer:** System.
- **Reader:** Notification Worker.
- **Sensitivity:** Baja.
- **Lifecycle:** Creado por eventos; procesado por el worker.
- **Retention:** Purga automática a los 30 días.

#### 35. `public.notification_deliveries`

- **Purpose:** Registro de intentos de entrega de push, desduplicación y recibos de notificación.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `notification_id` UUID NOT NULL, `device_token_id` UUID NOT NULL, `provider_message_id` Text, `status` Text NOT NULL DEFAULT 'QUEUED' (`NOTIFICATION_STATUS`), `attempt_count` Integer DEFAULT 1, `last_error_code` Text, `sent_at` TIMESTAMPTZ DEFAULT NOW(), `receipt_checked_at` TIMESTAMPTZ.
- **FK:** `notification_id` REFERENCES notification_outbox(id), `device_token_id` REFERENCES device_tokens(id).
- **ON DELETE:** CASCADE en ambas FKs.
- **UNIQUE:** `UNIQUE(notification_id, device_token_id)`.
- **CHECK:** CHECK status IN ('QUEUED', 'SENDING', 'DELIVERED', 'FAILED_RETRYABLE', 'FAILED_PERMANENT').
- **Indexes:** `BTREE(notification_id)`, `BTREE(provider_message_id)`.
- **RLS:** Solo accesible por Worker del sistema y Admin.
- **Writer:** Notification Worker.
- **Reader:** Notification Worker/Admin.
- **Sensitivity:** Baja.
- **Lifecycle:** Creado durante el despacho push.
- **Retention:** Purga a los 30 días.

#### 36. `public.support_tickets`

- **Purpose:** Tickets de atención a clientes y conductores.
- **MVP Status:** MVP.
- **PK:** `id` UUID PRIMARY KEY DEFAULT gen_random_uuid().
- **Columns:** `id` UUID, `delivery_id` UUID, `user_id` UUID NOT NULL, `category` Text NOT NULL, `status` Text NOT NULL DEFAULT 'OPEN', `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `delivery_id` REFERENCES deliveries(id), `user_id` REFERENCES auth.users(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** CHECK status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED').
- **Indexes:** `BTREE(user_id)`, `BTREE(status)`.
- **RLS:** Usuario creador y Admin/Soporte.
- **Writer:** User/Admin.
- **Reader:** User/Admin.
- **Sensitivity:** Media.
- **Lifecycle:** Creado por usuario; resuelto por operador.
- **Retention:** Permanente.

#### 37. `public.audit_logs`

- **Purpose:** Log inmutable de acciones administrativas sensibles.
- **MVP Status:** MVP.
- **PK:** `id` BigInt GENERATED ALWAYS AS IDENTITY PRIMARY KEY.
- **Columns:** `id` BigInt, `admin_user_id` UUID NOT NULL, `action` Text NOT NULL, `reason` Text NOT NULL, `ip_address` Text, `created_at` TIMESTAMPTZ DEFAULT NOW().
- **FK:** `admin_user_id` REFERENCES auth.users(id).
- **ON DELETE:** RESTRICT.
- **UNIQUE:** N/A.
- **CHECK:** N/A.
- **Indexes:** `BTREE(admin_user_id)`.
- **RLS:** Lectura exclusiva por SuperAdmin; apéndice inmutable (_append-only_).
- **Writer:** System/Admin Action.
- **Reader:** SuperAdmin.
- **Sensitivity:** Alta.
- **Lifecycle:** Creado al ejecutar una acción administrativa sensible.
- **Retention:** 365 días mínimo.
