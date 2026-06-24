/* ============================================================
   Configuración Supabase — Rancho Aparte
   La "publishable key" está pensada para ir en el navegador.
   La seguridad real la dan las políticas RLS (ver supabase/schema.sql).
   ============================================================ */
window.SUPA_URL = 'https://fvxhmqbflihqpkktvjla.supabase.co';
window.SUPA_KEY = 'sb_publishable_Ye7SkkwGzPjk1uWac52kFQ_2ybDyooE';

/* Datos del negocio usados por la web pública de reservas */
window.RANCHO = {
  nombre: 'Rancho Aparte',
  whatsapp: '5491123149842',                 // sin signos, con código país
  // Cómo paga la seña el cliente (EDITAR con tu alias real de Mercado Pago / CBU)
  aliasPago: 'rancho.aparte.mp',
  // Seña = porcentaje del precio total
  senaPorcentaje: 50,
  horaApertura: 9,
  horaCierre: 24,
  precios: { F5: 24000, F7: 32000, F8: 60000 },
  courts: [
    { id: 'c5a', name: 'Cancha 5A', short: '5A', type: 'F5' },
    { id: 'c5b', name: 'Cancha 5B', short: '5B', type: 'F5' },
    { id: 'c5c', name: 'Cancha 5C', short: '5C', type: 'F5' },
    { id: 'c7',  name: 'Cancha 7',  short: '7',  type: 'F7' },
    { id: 'c8',  name: 'Cancha 8 (las tres de F5)', short: '8', type: 'F8' },
  ],
  // Qué espacios físicos ocupa cada cancha reservable
  occupies: { c5a:['c5a'], c5b:['c5b'], c5c:['c5c'], c7:['c7'], c8:['c5a','c5b','c5c'] },
};
