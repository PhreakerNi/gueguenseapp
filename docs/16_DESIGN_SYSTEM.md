# 16 — SISTEMA DE DISEÑO E IDENTIDAD VISUAL (DESIGN SYSTEM)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Identidad de Marca, Design System, UI Tokens y Ergonomía Móvil  

---

## 1. Identidad Conceptual y Paleta de Colores

La identidad visual de **Güegüense** proyecta fuerza, profesionalismo, modernidad y confiabilidad operativa. Su esquema cromático utiliza una base sólida de **Negro Grafito** combinada con **Naranja Güegüense** como color primario de acción de marca.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                          PALETA DE COLORES BASE                        │
├─────────────────┬───────────┬──────────────────────────────────────────┤
│ Naranja Brand   │ `#FF6B00` │ Primario / CTA Principal / Acción / Logo │
├─────────────────┼───────────┼──────────────────────────────────────────┤
│ Grafito Fondo   │ `#121417` │ Superficie Móvil Dark / Identidad Base   │
├─────────────────┼───────────┼──────────────────────────────────────────┤
│ Verde Éxito     │ `#10B981` │ Disponible / Confirmado / Éxito / PIN    │
├─────────────────┼───────────┼──────────────────────────────────────────┤
│ Rojo Alerta     │ `#EF4444` │ Error / Cancelación / Riesgo / Detener   │
├─────────────────┼───────────┼──────────────────────────────────────────┤
│ Amarillo Alerta │ `#F59E0B` │ Retraso Leve / En Espera / Precaución    │
├─────────────────┼───────────┼──────────────────────────────────────────┤
│ Gris Superficie │ `#1F242D` │ Tarjetas / Cards / Modales               │
├─────────────────┼───────────┼──────────────────────────────────────────┤
│ Blanco Texto    │ `#F9FAFB` │ Titulares y texto sobre fondos oscuros   │
└─────────────────┴───────────┴──────────────────────────────────────────┘
```

---

## 2. Tokens de Diseño (Design Tokens)

### 2.1 Tipografía (Typography)
* **Familia Tipográfica:** Inter / Outfit (Google Fonts) en React Native y Web.
* **Escala:**
  * `Heading XL` (28px / Bold): Títulos de pantallas principales (*"Solicitar Delivery"*).
  * `Heading L` (22px / SemiBold): Nombres de negocios y montos de ganancia (*"C$ 65.00"*).
  * `Body Regular` (16px / Regular): Direcciones e instrucciones.
  * `Caption` (13px / Medium): Marcas de tiempo y etiquetas de estado.

### 2.2 Espaciado y Formas (Spacing & Radius)
* **Escala de Espaciado:** Multiplos de 4px (`xs: 4px`, `sm: 8px`, `md: 16px`, `lg: 24px`, `xl: 32px`).
* **Border Radius (Esquinas):**
  * `Radius Cards`: 16px (Bordes redondeados modernos y suaves).
  * `Radius Buttons`: 12px (Botones de acción táctil prominentes).
  * `Radius Chips / Badges`: 999px (Pills de estado).

---

## 3. Ergonomía UX Móvil para la App Motorizado

El conductor trabaja conduciendo en motocicleta. Por ende, la interfaz debe diseñarse contemplando:

1. **Target Táctil Prominente:** Botones principales con una altura mínima de **56px** y ancho completo (*Full Width*) para fácil pulsación incluso con guantes.
2. **Alto Contraste y Jerarquía:** Fondo oscuro con texto blanco radiante (`#F9FAFB`) y botones primarios en Naranja (`#FF6B00`) para legibilidad bajo luz solar directa.
3. **Una Acción Principal por Pantalla:** Evitar la sobrecarga cognitiva. Durante el trayecto, la pantalla debe ser dominada por el mapa y el botón único de avance (*"Llegué al Negocio"* -> *"Pedido Recogido"* -> *"Llegué a Cliente"*).
4. **Feedback Háptico y Sonoro:** Vibración y tonos distintos al recibir una oferta o confirmar un PIN.

---

## 4. Componentes Primitivos Compartidos (`@gueguense/ui`)

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        COMPONENTES PRIMITIVOS                          │
├─────────────────┬──────────────────────────────────────────────────────┤
│ `Button`        │ Variantes: `primary` (Naranja), `success` (Verde),   │
│                 │ `danger` (Rojo), `ghost` (Transparente).             │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `StatusBadge`   │ Componente tipo Pill con animación de pulso para     │
│                 │ indicar estados (`AVAILABLE`, `SEARCHING`, etc.).    │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `DeliveryCard`   │ Tarjeta de resumen de viaje con avatar, direcciones  │
│                 │ y ganancia destacada.                                │
├─────────────────┼──────────────────────────────────────────────────────┤
│ `PINInput`      │ Cuadrícula de 4 dígitos de gran tamaño para ingreso  │
│                 │ rápido de PIN de confirmación.                       │
└─────────────────┴──────────────────────────────────────────────────────┘
```
