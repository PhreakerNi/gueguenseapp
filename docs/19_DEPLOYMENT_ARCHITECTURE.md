# 19 — ARQUITECTURA DE DESPLIEGUE Y CI/CD (DEPLOYMENT ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Pipeline CI/CD, Entornos, Secretos y Estrategia Expand/Contract en DB  

---

## 1. Ambientes de Entorno y Control de Cambios

1. **Local:** Supabase CLI local (`supabase start`) + Expo Go / Simuladores.
2. **Development:** Proyecto Supabase Dev + EAS Build Preview.
3. **Staging:** Proyecto Supabase Staging + TestFlight / Google Play Internal.
4. **Production:** Proyecto Supabase Prod + Google Play Store / Apple App Store + Vercel Prod.

---

## 2. Pipeline Completo de CI/CD (GitHub Actions)

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

## 3. Estrategia Expand/Contract para Base de Datos

Las migraciones de base de datos aplican el patrón **Expand/Contract**:
* **Expand:** Se añaden nuevas columnas/tablas sin eliminar estructuras anteriores.
* **Transition:** La aplicación escribe en ambas estructuras.
* **Contract:** Tras verificar la migración completa de los clientes, una migración posterior elimina la columna obsoleta.
