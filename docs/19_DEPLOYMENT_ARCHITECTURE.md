# 19 — ARQUITECTURA DE DESPLIEGUE Y CI/CD (DEPLOYMENT ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.3.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Pipeline CI/CD, Entornos, Estrategia Expand/Contract y Control de Versión Mínima de Apps  

---

## 1. Ambientes de Entorno y Separación de Proyectos

1. **Local:** Supabase CLI local (`supabase start`) + Expo Go / Simuladores.
2. **Development:** Proyecto Supabase Dev + EAS Build Preview.
3. **Staging:** Proyecto Supabase Staging + TestFlight / Google Play Internal.
4. **Production:** Proyecto Supabase Prod + Google Play Store / Apple App Store + Vercel Prod.

---

## 2. Pipeline Completo de CI/CD (GitHub Actions) y Gates de Aprobación

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

---

## 3. Estrategia de Actualización Forzada de Apps (Minimum Supported Version)

Para prevenir fallos cuando la API sufre breaking changes o migraciones de esquema:
* Las aplicaciones móviles evalúan en cada inicio el endpoint `GET /api/v1/config/app-version`.
* Si la versión instalada es inferior a `min_supported_version`, la app bloquea la navegación e instruye al usuario a actualizar desde Google Play Store / Apple App Store (**Forced Upgrade Banner**).
