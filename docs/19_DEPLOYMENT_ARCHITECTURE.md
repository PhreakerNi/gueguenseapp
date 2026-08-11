# 19 — ARQUITECTURA DE DESPLIEGUE Y CI/CD (DEPLOYMENT ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.6.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Pipeline CI/CD, Promoción de Entornos, Secretos, Migration Drift, Backups y Forced Upgrade Strategy

---

## 1. Promoción de Entornos y Titularidad de Secretos

1. **Local:** Supabase CLI local (`supabase start`) + Expo Go / Simuladores.
2. **Development:** Proyecto Supabase Dev + EAS Build Preview + Vercel Preview.
3. **Staging:** Proyecto Supabase Staging + TestFlight / Google Play Internal.
4. **Production:** Proyecto Supabase Prod + Google Play Store / Apple App Store + Vercel Production.

- **Secret Ownership por Entorno:** Las claves de producción son gestionadas exclusivamente por el rol `super_admin` o Lead DevOps autorizados.
- **Flujo de Promoción de Migraciones:** `Local` $\rightarrow$ `Dev` $\rightarrow$ `Staging` $\rightarrow$ `Prod`. Queda prohibido alterar esquemas en producción directamente; toda modificación requiere una migración probada en CI.
- **Criterio Forward-Fix:** Ante fallos de esquema, se prefiere aplicar una migración correctiva _forward-fix_ sobre un _rollback_ destructivo.

---

## 2. Pipeline CI/CD (GitHub Actions), Migration Drift y Monitoreo

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

- **Migration Drift Check:** El CI compara el esquema generado por las migraciones contra el esquema esperado detectando cualquier derivación no autorizada.
- **Monitoreo & Incident Response:** Alertas automáticas por aumento en tasa de errores HTTP 5xx o fallos en el Dispatch Engine.

---

## 3. Backups (Configuración Proveedor/Plan), Restore Drills y Forced Upgrade

- **Política de Backups & Restore Drills:** Point-In-Time Recovery (PITR) y backups diarios habilitados según el plan del proveedor Supabase. Se programa un ejercicio de simulación de restauración (_Restore Drill_) semestral liderado por el Lead DevOps.
- **Estrategia de Actualización Forzada de Apps (`min_supported_version`):**
  - Las aplicaciones móviles evalúan en cada inicio `GET /api/v1/config/app-version`.
  - Si la versión instalada es inferior a `min_supported_version`, la app bloquea la interfaz y redirige al usuario a la tienda correspondiente (_Forced Upgrade Banner_).
