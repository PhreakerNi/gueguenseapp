# 19 — ARQUITECTURA DE DESPLIEGUE Y CI/CD (DEPLOYMENT ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Pipeline CI/CD, Separación de Entornos, Secretos, Backups y Forced Upgrade Strategy  

---

## 1. Entornos Desacoplados y Gestión de Secretos

1. **Local:** Supabase CLI local (`supabase start`) + Expo Go / Simuladores.
2. **Development:** Proyecto Supabase Dev + EAS Build Preview + Vercel Preview.
3. **Staging:** Proyecto Supabase Staging + TestFlight / Google Play Internal.
4. **Production:** Proyecto Supabase Prod + Google Play Store / Apple App Store + Vercel Production.

* **Gestión de Secretos:** Variables de entorno y llaves privadas gestionadas vía GitHub Actions Secrets, Supabase Vault y Vercel Encrypted Environment Variables.
* **Autorización a Producción:** Despliegues a producción requieren aprobación explícita de `super_admin` o Lead DevOps.

---

## 2. Pipeline CI/CD (GitHub Actions) y Control de Migraciones

```text
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐
│ Pull Request │───►│ Lint & Type  │───►│ Unit Tests   │───►│ Supabase Local     │
│  a `main`    │    │ Check        │    │ (Jest)       │    │ Reset & Migrations │
└──────────────┘    └──────────────┘    └──────────────┘    └─────────┬──────────┘
                                                                      │
┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│ Production   │◄───│ Required     │◄───│ Preview /    │◄─────────────┘
│ Deploy       │    │ Approvals    │    │ Staging      │ (RLS & Integration Tests)
└──────────────┘    └──────────────┘    └──────────────┘
```

* **Migration Drift Check:** El CI valida que las migraciones en `/supabase/migrations` coincidan exactamente con la estructura esperada sin derivaciones.
* **Estrategia Expand/Contract:** Toda modificación de base de datos requiere ser retrocompatible (*forward-fix* preferido sobre *rollback* destructivo).

---

## 3. Backups, Restore Drills y Estrategia de Actualización Forzada

* **Política de Backups:** Point-In-Time Recovery (PITR) de 7 días en producción + Backups diarios automatizados. Simulación de restauración (*Restore Drill*) programada semestralmente.
* **Actualización Forzada de Apps (`min_supported_version`):**
  * Las aplicaciones móviles evalúan en cada inicio `GET /api/v1/config/app-version`.
  * Si la versión instalada es inferior a `min_supported_version`, la app bloquea la interfaz y redirige al usuario a la tienda correspondiente (*Forced Upgrade Banner*).
