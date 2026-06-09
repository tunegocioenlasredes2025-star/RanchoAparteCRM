# Rancho Aparte · CRM

Sistema de gestión integral para **Rancho Aparte**, complejo de canchas de fútbol en Ituzaingó, Buenos Aires.

Reemplaza cuadernos, anotaciones en papel y conversaciones de WhatsApp por un panel profesional y centralizado.

## Características

- **Dashboard** con reservas del día/mañana, facturación (día/semana/mes) y ocupación en tiempo real
- **Reservas** con prevención de superposición de horarios y duplicados
- **Calendario** visual (vista día y semana) por cancha
- **Clientes** generados automáticamente desde las reservas, con historial
- **Finanzas**: ingresos, señas y saldos pendientes, estadísticas
- **Eventos y cumpleaños**
- **Reportes** visuales (gráficos sin librerías externas)
- **Recordatorios por WhatsApp** con un clic
- **Copia de seguridad** export/import en JSON

Canchas: 3 de fútbol 5 (5A, 5B, 5C), 1 de fútbol 7, y la combinación de las tres de F5 en una cancha de fútbol 8.

## Tecnología

100% estático, sin dependencias ni instalación:

- HTML + CSS + JavaScript vanilla
- Persistencia en `localStorage` (los datos viven en el navegador del dispositivo)

## Uso local

Abrí `index.html` en el navegador. No requiere servidor ni build.

## Despliegue

Listo para publicar en Vercel (o cualquier hosting estático): no tiene paso de build, se sirve `index.html` directamente.

> ⚠️ Los datos se guardan en el navegador del dispositivo. Exportá una copia de seguridad periódicamente desde **Configuración → Exportar copia**.
