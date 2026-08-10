# 05 — ARQUITECTURA TÉCNICA DE SISTEMAS (SYSTEM ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Arquitectura de Software, Diagramas de Componentes y Stack Tecnológico  

---

## 1. Visión General de Arquitectura

Güegüense adopta una arquitectura modular limpia orientada al dominio (**Domain-Driven Monorepo**). El sistema separa estrictamente las aplicaciones cliente de la lógica de negocio, centralizando la validación de contratos, schemas de datos y la máquina de estados en paquetes compartidos.

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              APLICACIONES CLIENTES                              │
│                                                                                 │
│   ┌──────────────────────┐    ┌──────────────────────┐    ┌─────────────────┐   │
│   │  business-mobile     │    │    driver-mobile     │    │   admin-web     │   │
│   │ (React Native/Expo)  │    │ (React Native/Expo)  │    │   (Next.js)     │   │
│   └──────────┬───────────┘    └──────────┬───────────┘    └────────┬────────┘   │
└──────────────┼───────────────────────────┼─────────────────────────┼────────────┘
               │                           │                         │
               └───────────────────────────┼─────────────────────────┘
                                           │ (TypeScript Shared Types / Schemas)
┌──────────────────────────────────────────▼──────────────────────────────────────┐
│                               PAQUETES COMPARTIDOS                              │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐     │
│   │ @gueguense/  │   │ @gueguense/  │   │ @gueguense/  │   │ @gueguense/  │     │
│   │    types     │   │   schemas    │   │    domain    │   │      ui      │     │
│   └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘     │
└──────────────────────────────────────────┬──────────────────────────────────────┘
                                           │ (API Rest / Edge Functions / Realtime)
┌──────────────────────────────────────────▼──────────────────────────────────────┐
│                             BACKEND Y BASE DE DATOS                             │
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                      Supabase / PostgreSQL Server                        │   │
│   │  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────────────┐  │   │
│   │  │   PostGIS Geo    │  │ Row Level Secur. │  │ PL/pgSQL Atomic Func. │  │   │
│   │  └──────────────────┘  └──────────────────┘  └───────────────────────┘  │   │
│   └──────────┬───────────────────────┬────────────────────────┬─────────────┘   │
│              │                       │                        │                 │
│   ┌──────────▼───────────┐ ┌─────────▼──────────┐ ┌───────────▼────────────┐   │
│   │ Realtime Engine Web  │ │ Edge Functions API │ │  Storage (Doc Privados)│   │
│   └──────────────────────┘ └────────────────────┘ └────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Definición del Stack Tecnológico

| Capa | Tecnología Seleccionada | Justificación Técnica |
| :--- | :--- | :--- |
| **Lenguaje Base** | **TypeScript 5.x** | Tipado estático de extremo a extremo, previniendo errores de runtime en producción. |
| **Apps Móviles** | **React Native + Expo (EAS)** | Despliegue multiplataforma (iOS/Android), rendimiento nativo y acceso robusto a sensores GPS en background. |
| **Panel Web & Tracking**| **Next.js (App Router)** | Renderizado en servidor (SSR), optimización SEO, carga ultrarrápida para el cliente web sin login. |
| **Base de Datos Core** | **PostgreSQL 15+ (Supabase)** | Base de datos relacional robusta con soporte para ACID contable e integridad referencial. |
| **Motor Geoespacial** | **PostGIS Extension** | Cálculo de distancias esféricas reales (`ST_DistanceSphere`), geofencing e índices de cuadrícula espacial (`GIST`). |
| **Autenticación** | **Supabase Auth / JWT** | Tokens seguros con refresco automático, soporte OTP celular y políticas nativas RLS. |
| **Realtime / WebSockets**| **Supabase Realtime (Elixir/Phoenix)**| Suscripción en tiempo real a cambios de estado de entrega y transmisión de coordenadas GPS sin saturar la DB. |
| **Mapas y Rutas** | **Google Maps Platform API** | Autocompletado de direcciones, geocodificación inversa, matriz de distancias y renderizado de mapas. |
| **Almacenamiento Privado**| **Supabase Storage (Private Buckets)**| Cifrado de documentos sensibles de motorizados servidos exclusivamente vía URLs firmadas con expiración. |

---

## 3. Estructura de Módulos y Paquetes (Monorepo Workspace)

### 3.1 Apps (`/apps`)
* `business-mobile`: Aplicación móvil para comercios. Enfoque en velocidad de creación de órdenes y seguimiento.
* `driver-mobile`: Aplicación móvil para conductores. Enfoque en interfaz táctil de alta visibilidad, gestión de presencia y navegación GPS.
* `admin-web`: Dashboard web administrativo Next.js para control operativo, verificación de documentos, tarifas y disputas.
* `tracking-web`: Portal web ligero de seguimiento de pedidos en tiempo real para consumidores finales.

### 3.2 Paquetes Compartidos (`/packages`)
* `@gueguense/types`: Tipos e interfaces globales TypeScript (`Delivery`, `Driver`, `Business`, `LedgerEntry`).
* `@gueguense/schemas`: Validadores Zod compartidos para requests de API, formularios y payloads de notificaciones.
* `@gueguense/domain`: Lógica de negocio pura (definición de la máquina de estados, validadores de transiciones, fórmulas de comisiones).
* `@gueguense/ui`: Sistema de diseño compartido, componentes primitivos (Buttons, Cards, Inputs, Status Badges).

---

## 4. Estrategia de Comunicación entre Componentes

1. **Peticiones Síncronas (REST / Edge Functions):**
   * Creación de envíos, cotización, actualización de estados de verificación, procesamiento de PIN y solicitudes de retiros.
2. **Comunicación Asíncrona en Tiempo Real (Realtime WebSockets):**
   * Canal `delivery:{id}`: Escuchado por el Negocio y el Tracking Web del Cliente para recibir actualizaciones de ubicación del conductor.
   * Canal `driver:offers:{driver_id}`: Escuchado por la App Driver para recibir ofertas de viajes entrantes emitidas por el Dispatch Engine.
3. **Eventos y Notificaciones Push:**
   * Firebase Cloud Messaging (**FCM**) / Apple Push Notification Service (**APNs**) via Expo Notifications para despertar la app del motorizado ante una nueva oferta cuando la pantalla está apagada.
