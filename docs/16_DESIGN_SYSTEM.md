# 16 — SISTEMA DE DISEÑO E IDENTIDAD VISUAL (DESIGN SYSTEM)

**Proyecto:** Güegüense  
**Versión:** 1.4.0-phase0  
**Estado:** FASE 0 — EN REVISIÓN / CANDIDATA A APROBACIÓN  
**Dominio:** Identidad de Marca, Design Tokens, UI Scale, Componentes y Layouts de Delivery Activo  

---

## 1. Tokens de Diseño y Escala Tipográfica (Design Tokens)

### 1.1 Paleta de Colores Marca y Semánticos
* **Naranja Güegüense (`#FF6B00`):** Primario de marca, CTAs, búsqueda y estado activo.
* **Negro Grafito (`#121417`):** Fondo oscuro principal en aplicaciones móviles.
* **Gris Card (`#1F242D`):** Superficie de tarjetas, modales y bottom sheets.
* **Verde Éxito (`#10B981`):** Disponible, confirmaciones y OTP validado.
* **Rojo Alerta (`#EF4444`):** Errores, riesgos y cancelaciones.
* **Blanco Radiante (`#F9FAFB`):** Tipografía sobre fondos oscuros.

### 1.2 Tipografía, Espaciado, Radius y Elevación
* **Fuentes:** Inter / Outfit (Google Fonts). Pesos: `400 (Regular)`, `500 (Medium)`, `600 (SemiBold)`, `700 (Bold)`.
* **Escala Espaciado:** `xs: 4px`, `sm: 8px`, `md: 16px`, `lg: 24px`, `xl: 32px`, `xxl: 48px`.
* **Radii:** `Button: 12px`, `Card: 16px`, `Pill: 999px`, `Input: 10px`.
* **Touch Target:** Altura mínima de **56px** en botones principales para operación táctil con guantes.

---

## 2. Catálogo Canónico de Componentes UI y Layouts

1. **Teclado Numérico `DELIVERY_OTP`:** Entrada táctil gigante de 6 dígitos estandarizada para el conductor.
2. **Bottom Sheets de Estado de Entrega:** Panel deslizable inferior con la acción primaria prominente por etapa (`Ir a Sucursal`, `Llegué al Negocio`, `Ver Código Pickup`, `Ir a Cliente`, `Llegué a Cliente`, `Ingresar OTP`).
3. **Map Overlays de Navegación:** Tarjeta flotante superior con dirección objetivo, distancia remanente y ETA.
4. **Estados de UI:** Soporte completo de componentes para `Loading`, `Skeleton Screens`, `Empty States`, `Error Banners`, `Offline Indicators` y `Disabled States`.
