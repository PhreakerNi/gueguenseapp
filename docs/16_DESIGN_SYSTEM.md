# 16 — SISTEMA DE DISEÑO E IDENTIDAD VISUAL (DESIGN SYSTEM)

**Proyecto:** Güegüense  
**Versión:** 1.2.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Identidad de Marca, Design System, Tokens Visuales y Componentes UX  

---

## 1. Tokens de Diseño (Design Tokens)

### 1.1 Paleta de Colores Marca y Semánticos
* **Naranja Güegüense (`#FF6B00`):** Color primario de marca, CTAs principales, estado de búsqueda y marca visual.
* **Negro Grafito (`#121417`):** Superficie de fondos oscuros en móviles.
* **Gris Card (`#1F242D`):** Fondo de tarjetas y modales.
* **Verde Éxito (`#10B981`):** Disponible, confirmaciones y OTP verificado.
* **Rojo Alerta (`#EF4444`):** Errores, cancelaciones y riesgos.
* **Blanco Texto (`#F9FAFB`):** Tipografía principal sobre superficies oscuras.

### 1.2 Tipografía y Espaciado
* **Fuente:** Inter / Outfit (Google Fonts).
* **Espaciado:** Escala base de 4px (`xs: 4px`, `sm: 8px`, `md: 16px`, `lg: 24px`, `xl: 32px`).
* **Radius:** `Button: 12px`, `Card: 16px`, `Pill: 999px`.

---

## 2. Componentes UX y Ergonomía Móvil

1. **Target Táctil Prominente:** Botones de acción principal con altura mínima de **56px** e interacción con guantes.
2. **Componente `DELIVERY_OTP`:** Teclado numérico gigante estandarizado a **6 dígitos** en la App Driver para ingreso rápido del código dictado por el cliente final.
3. **UX del Negocio:** Envíos recurrentes en < 1 minuto mediante sucursales predeterminadas, clientes recientes y opción "Duplicar Entrega".
