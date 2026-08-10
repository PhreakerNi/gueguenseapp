# 19 — ARQUITECTURA DE DESPLIEGUE Y CI/CD (DEPLOYMENT ARCHITECTURE)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN (Pendiente de Aprobación Formal)  
**Dominio:** Pipeline CI/CD, Estrategia Expand/Contract y Control de Cambios en DB  

---

## 1. Pipeline Completo de CI/CD (GitHub Actions)

Queda prohibido aplicar cambios directamente en producción al hacer push a `main`. Todo cambio requiere validación en PRs mediante el siguiente pipeline:

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

## 2. Estrategia Expand/Contract para Base de Datos

No se asume que todas las migraciones SQL son reversibles con un simple `down.sql`. Se aplica el patrón **Expand/Contract** para cambios de esquema sin tiempo de inactividad (*Zero Downtime*):

1. **Fase Expand (Expandir):** Se agregan nuevas tablas, columnas o funciones sin eliminar las antiguas. El código nuevo escribe en ambas columnas.
2. **Fase Transition (Transición):** Se migra el código de las apps para utilizar la nueva estructura.
3. **Fase Contract (Contraer):** Una vez que el 100% del tráfico utiliza la nueva estructura, una migración posterior elimina la columna obsoleta.
