# 14 — OPERACIONES ADMINISTRATIVAS (ADMIN OPERATIONS)

**Proyecto:** Güegüense  
**Versión:** 1.0.0-phase0  
**Dominio:** Panel de Control Administrativo, Operaciones en Vivo, Verificaciones y Auditoría  

---

## 1. Misión del Panel Güegüense Admin

El panel **Güegüense Admin** (`/apps/admin-web`) es la herramienta web centralizada utilizada exclusivamente por los equipos operativos, de verificación y directivos para controlar, supervisar, auditar y mantener la salud de toda la plataforma en tiempo real.

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           PANEL GÜEGÜENSE ADMIN (WEB)                           │
├─────────────────┬───────────────────────────────────────────────────────────────┤
│  MÓDULOS        │  VISTAS PRINCIPALES                                           │
├─────────────────┼───────────────────────────────────────────────────────────────┤
│ Dashboard       │ Mapa en vivo de flota activa, métricas del día, alertas.      │
├─────────────────┼───────────────────────────────────────────────────────────────┤
│ Verificación    │ Cola de revisión de documentos de conductores (Visor Seguro). │
├─────────────────┼───────────────────────────────────────────────────────────────┤
│ Operaciones     │ Monitor de entregas activas, reasignación manual e incidencias.│
├─────────────────┼───────────────────────────────────────────────────────────────┤
│ Tarifas / Zonas │ Editor visual de polígonos geoespaciales y tabla de precios. │
├─────────────────┼───────────────────────────────────────────────────────────────┤
│ Finanzas        │ Aprobación de retiros (Payouts), balance de efectivo y Ledger.│
└─────────────────┴───────────────────────────────────────────────────────────────┘
```

---

## 2. Descripción de Módulos Operativos

### 2.1 Módulo: Dashboard de Operaciones en Vivo (`/admin/dashboard`)
* **Mapa Global de Flota:** Despliega marcadores en tiempo real con código de colores según el estado operativo:
  * 🟢 Verde: Motorizado disponible (`AVAILABLE`).
  * 🔵 Azul: Motorizado asignado / en ruta (`ASSIGNED` / `DELIVERING`).
  * 🔴 Rojo: Entrega retrasada o en disputa (`DISPUTED`).
* **KPIs Rápidos:** Solicitudes del día, tiempo promedio de asignación, tasa de cumplimiento, volumen financiero acumulado.

### 2.2 Módulo: Cola de Verificación Documental (`/admin/verifications`)
* **Cola de Trabajo:** Muestra la lista de motorizados en estado `UNDER_REVIEW` ordenados por antigüedad de registro.
* **Visor de Documentos Cifrado:** Permite auditar fotos de Cédula, Licencia y Matrícula servidas vía URLs firmadas con expiración de 15 minutos.
* **Acciones:**
  * **Aprobar:** Cambia estado a `VERIFIED`. Habilita al conductor para recibir viajes.
  * **Rechazar:** Requiere seleccionar el motivo (ej. *Licencia vencida*, *Foto de cédula ilegible*) y enviar notificación al motorizado.

### 2.3 Módulo: Control de Entregas e Incidencias (`/admin/dispatch`)
* **Tabla de Entregas Activas:** Filtros por negocio, sucursal, estado de máquina y conductor.
* **Acción de Reasignación de Emergencia:** Permite a un operador liberar una entrega asignada a un conductor que sufrió un contratiempo y adjudicarla a otro motorizado verificado cercano.
* **Cancelación Forzada por Auditoría:** Cancela entregas bloqueadas aplicando devoluciones o penalizaciones contables según corresponda.

### 2.4 Módulo: Configuración de Tarifas y Zonas (`/admin/pricing`)
* **Editor Geoespacial de Zonas:** Permite dibujar polígonos sobre el mapa (PostGIS Polygons) para definir recargos por zona periférica.
* **Gestor de Parámetros:** Ajuste de tarifa base, precio por kilómetro extra, tarifa por minuto de espera y comisión de la plataforma.

### 2.5 Módulo: Finanzas y Retiros (`/admin/finance`)
* **Aprobación de Payouts:** Muestra las solicitudes de transferencia bancaria de los conductores. El Admin verifica que no existan disputas ni efectivo retenido antes de dar el clic de aprobación.
* **Auditoría de Ledger:** Registro de asientos de partida doble para trazabilidad de cada córdoba procesado.
