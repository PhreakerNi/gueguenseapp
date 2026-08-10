# 19 — ARQUITECTURA DE DESPLIEGUE Y CI/CD (DEPLOYMENT ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Pipeline de CI/CD, Ambientes de Despliegue, Gestión de Secretos y Mobil Builds  

---

## 1. Definición de Ambientes de Despliegue

El proyecto Güegüense mantiene 4 ambientes estrictamente aislados para garantizar la estabilidad del servicio en producción:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        AMBIENTES DE DESPLIEGUE                         │
├─────────────────┬──────────────────────────────────────────────────────┤
│ `Local`         │ Entorno de desarrollo local (Docker + Supabase CLI)  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `Development`   │ Ambientes de PRs automatizados para pruebas internas  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `Staging`       │ Réplica exacta de producción con datos anonimizados  │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `Production`    │ Ambiente en vivo para usuarios finales y comercios   │
└─────────────────┴──────────────────────────────────────────────────────┘
```

---

## 2. Pipeline de CI/CD (GitHub Actions)

Toda actualización del repositorio desencadena la validación automatizada antes de cualquier integración:

```text
┌────────────────┐    ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│   Git Push /   │───►│ Lint & Type    │───►│ Automated      │───►│ Build & Deploy │
│  Pull Request  │    │ Check (TS)     │    │ Tests (Jest)   │    │ Preview / Prod │
└────────────────┘    └────────────────┘    └────────────────┘    └────────────────┘
```

1. **Paso 1: Quality Gate:** Ejecuta `eslint` y `tsc --noEmit` en todos los paquetes del monorepo.
2. **Paso 2: Database & RLS Tests:** Levanta una instancia de prueba de Supabase vía CLI y corre el suite de tests de políticas RLS y migraciones SQL.
3. **Paso 3: Deployment Trigger:**
   * Push a `main` $\rightarrow$ Despliegue automático de `admin-web` y `tracking-web` en **Vercel**.
   * Push a `main` $\rightarrow$ Aplicación de migraciones SQL en Supabase Staging/Production via `supabase db push`.
   * Releases etiquetados (`vX.Y.Z`) $\rightarrow$ Compilación de aplicaciones móviles iOS/Android en **Expo Application Services (EAS Build)** y publicación en App Store y Google Play.

---

## 3. Estrategia de Migraciones y Rollback

* **Migraciones SQL Inmutables:** Guardadas en `/database/migrations` etiquetadas por timestamp (ej. `20260810143000_create_deliveries.sql`).
* **Regla de Cero Breaking Changes:** Ninguna migración elimina o renombra columnas en uso activo sin un período de compatibilidad previa de dos pasos.
* **Estrategia de Rollback:**
  * **Web (Next.js):** Reversión instantánea a la versión previa en Vercel (< 10 segundos).
  * **Database:** Ejecución del script de migración inversa `down.sql` previamente auditado.
  * **Mobile (Expo):** Publicación de correcciones urgentes vía **EAS Update (OTA Update)** en JavaScript sin requerir revisión de las tiendas de aplicaciones si no hay cambios en código nativo.

---

## 4. Gestión de Variables de Entorno y Secretos

1. **Variables de Cliente (Públicas):** Almacenadas en `.env.production` e inyectadas en tiempo de compilación (`NEXT_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_GOOGLE_MAPS_KEY`).
2. **Secretos de Servidor (Privados):** Almacenados en GitHub Secrets y Vercel Environment Variables (`SUPABASE_SERVICE_ROLE_KEY`, `FCM_SERVER_KEY`, `DATABASE_URL`). NUNCA se incluyen en los bundles móviles o clientes web.
