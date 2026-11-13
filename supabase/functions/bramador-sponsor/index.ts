// Supabase Edge Function — sponsors pagos de Bramador con Mercado Pago.
//
// Desde el 13/11 cada contratación es una marca que aparece en Hoy, rotando con
// las demás (hasta 8 a la vez), $99.900 por mes. El formato viejo por spot
// queda por compatibilidad. Por cada una se
// crea un "plan de suscripción" propio en Mercado Pago, así el sponsor paga
// con la cuenta de Mercado Pago que quiera (sin que el mail tenga que
// coincidir) y nosotros sabemos a qué sponsor corresponde cada pago.
//
// Acciones (POST JSON {accion, ...}):
//   contratar   {nombre, spots[], mail, logo?} → {url} para ir a pagar
//   sincronizar {grupo?}                    → revisa los cobros en Mercado Pago
//                                             y prende/extiende los sponsors
// GET/POST de Mercado Pago (webhook) o del cron → sincroniza todo.
//
// El precio y las filas los decide el servidor; nunca se confía en el
// navegador. Solo un cobro confirmado por Mercado Pago prende un sponsor y le
// da un mes (+3 días de gracia). Si el mes siguiente no se cobra, vence solo.
//
// Llave de Mercado Pago: fila 'mp_token' de bram_config. SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY son automáticos. BRAM_SPONSOR_PRECIO opcional.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const PRECIO = Number(Deno.env.get('BRAM_SPONSOR_PRECIO')) || 99900;
const SITIO = 'https://www.escueladewingfoil.com.ar';
const SPOTS: Record<string, string> = {
  sanisidro: 'San Isidro', peru: 'Perú Beach', martinez: 'Martínez',
  olivos: 'Olivos', quilmes: 'Quilmes', puntalara: 'Punta Lara',
};
const MAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

// La llave de Mercado Pago de Bramador vive en bram_config (tabla privada,
// sin acceso público). Si no está, se usa la del proyecto (modo prueba).
let MP = '';
async function cargarLlave() {
  const { data } = await sb.from('bram_config').select('valor').eq('clave', 'mp_token').maybeSingle();
  MP = data?.valor || Deno.env.get('MP_ACCESS_TOKEN') || '';
}

const ORIGENES = ['https://www.escueladewingfoil.com.ar', 'https://escueladewingfoil.com.ar'];
let cors: Record<string, string> = {};
function json(b: unknown, status = 200) {
  return new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}
function mp(path: string, init: RequestInit = {}) {
  return fetch('https://api.mercadopago.com' + path, {
    ...init,
    headers: { Authorization: `Bearer ${MP}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

// ¿La cuenta conectada es real (no de prueba)? Si no, la página no ofrece pagar.
let listoCache: { llave: string; listo: boolean } | null = null;
async function listo() {
  if (listoCache && listoCache.llave === MP) return listoCache.listo;
  const r = await mp('/users/me');
  const u = r.ok ? await r.json() : {};
  const ok = r.ok && !String(u.nickname ?? '').toUpperCase().startsWith('TEST') && !String(u.email ?? '').endsWith('@testuser.com');
  listoCache = { llave: MP, listo: ok };
  return ok;
}

async function contratar(b: Record<string, unknown>) {
  if (b.general === true || (!Array.isArray(b.spots) && !b.spot)) return contratarHoy(b);
  const nombre = String(b.nombre ?? '').trim();
  const mail = String(b.mail ?? '').trim().toLowerCase();
  // Uno o varios spots: $99.900 por cada uno, todo en una sola suscripción.
  const pedidos = Array.isArray(b.spots) ? b.spots : [b.spot];
  const spots = [...new Set(pedidos.map((x) => String(x ?? '')))].filter((x) => SPOTS[x]);
  const logo = typeof b.logo === 'string' ? b.logo : '';
  if (nombre.length < 2 || nombre.length > 40) return json({ error: 'Poné el nombre de tu marca.' }, 400);
  if (!MAIL_RE.test(mail) || mail.length > 120) return json({ error: 'Revisá el mail.' }, 400);
  if (!spots.length || spots.length !== pedidos.length) return json({ error: 'Elegí al menos un spot.' }, 400);
  const nombres = spots.map((x) => SPOTS[x]);
  if (logo && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > 60000)) {
    return json({ error: 'El logo no se pudo leer. Probá con otra imagen.' }, 400);
  }

  const { data: r, error } = await sb.rpc('bram_srv_sponsor_nuevo', { p_secreto: '', p: { nombre, spots, mail, logo: logo || null } });
  if (error || !r) return json({ error: 'No pudimos guardar el pedido. Probá de nuevo.' }, 500);
  if (r.error === 'ocupado') {
    const oc = ((r.spots ?? []) as string[]).map((x) => SPOTS[x] ?? x).join(', ');
    return json({ error: `${oc} ya ${(r.spots ?? []).length > 1 ? 'tienen' : 'tiene'} sponsor. Sacalo de la lista y probá de nuevo.` }, 409);
  }
  if (r.error) return json({ error: 'Hay muchos pedidos ahora. Probá en un rato.' }, 429);

  const res = await mp('/preapproval_plan', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Bramador · Sponsor ${spots.length === 6 ? 'todos los spots' : nombres.join(', ')} · ${nombre}`.slice(0, 120),
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: PRECIO * spots.length, currency_id: 'ARS' },
      back_url: `${SITIO}/bramador/sponsors/gracias/?g=${r.grupo}`,
    }),
  });
  if (!res.ok) {
    console.error('preapproval_plan', res.status, await res.text());
    return json({ error: 'Mercado Pago no respondió. Probá de nuevo en un rato.' }, 502);
  }
  const plan = await res.json();
  await sb.rpc('bram_srv_sponsor_mp', { p_secreto: '', p: { grupo: r.grupo, mp_id: plan.id, mp_estado: 'esperando_pago' } });
  return json({ url: plan.init_point });
}

// Una marca en Hoy, rotando con las demás. Un solo precio por mes.
async function contratarHoy(b: Record<string, unknown>) {
  const nombre = String(b.nombre ?? '').trim();
  const mail = String(b.mail ?? '').trim().toLowerCase();
  const logo = typeof b.logo === 'string' ? b.logo : '';
  if (nombre.length < 2 || nombre.length > 40) return json({ error: 'Poné el nombre de tu marca.' }, 400);
  if (!MAIL_RE.test(mail) || mail.length > 120) return json({ error: 'Revisá el mail.' }, 400);
  if (logo && (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo) || logo.length > 60000)) {
    return json({ error: 'El logo no se pudo leer. Probá con otra imagen.' }, 400);
  }
  const { data: r, error } = await sb.rpc('bram_srv_sponsor_nuevo', { p_secreto: '', p: { general: true, nombre, mail, logo: logo || null } });
  if (error || !r) return json({ error: 'No pudimos guardar el pedido. Probá de nuevo.' }, 500);
  if (r.error === 'lleno') return json({ error: 'Ahora están todos los lugares ocupados. Escribinos por WhatsApp y te avisamos cuando se libere uno.' }, 409);
  if (r.error) return json({ error: 'Hay muchos pedidos ahora. Probá en un rato.' }, 429);
  const res = await mp('/preapproval_plan', {
    method: 'POST',
    body: JSON.stringify({
      reason: `Bramador · Sponsor en Hoy · ${nombre}`.slice(0, 120),
      auto_recurring: { frequency: 1, frequency_type: 'months', transaction_amount: PRECIO, currency_id: 'ARS' },
      back_url: `${SITIO}/bramador/sponsors/gracias/?g=${r.grupo}`,
    }),
  });
  if (!res.ok) {
    console.error('preapproval_plan', res.status, await res.text());
    return json({ error: 'Mercado Pago no respondió. Probá de nuevo en un rato.' }, 502);
  }
  const plan = await res.json();
  await sb.rpc('bram_srv_sponsor_mp', { p_secreto: '', p: { grupo: r.grupo, mp_id: plan.id, mp_estado: 'esperando_pago' } });
  return json({ url: plan.init_point });
}

// Revisa en Mercado Pago las suscripciones de cada plan y anota el último cobro.
async function sincronizar(soloGrupo?: string) {
  const { data: lista, error } = await sb.rpc('bram_srv_sponsors_mp', { p_secreto: '' });
  if (error || !Array.isArray(lista)) return json({ error: 'lista' }, 500);
  let estado: string | null = null, activo = false, n = 0;
  for (const s of lista as { grupo: string; mp_id: string }[]) {
    if (soloGrupo && s.grupo !== soloGrupo) continue;
    const res = await mp(`/preapproval/search?preapproval_plan_id=${encodeURIComponent(s.mp_id)}&limit=20`);
    if (!res.ok) { console.error('search', s.mp_id, res.status); continue; }
    const subs = ((await res.json()).results ?? []) as Array<{ status: string; summarized?: { last_charged_date?: string } }>;
    // Nos quedamos con el último cobro de cualquiera de sus suscripciones.
    let cobrado = '', est = subs.length ? subs[0].status : 'esperando_pago';
    for (const x of subs) {
      const c = x.summarized?.last_charged_date ?? '';
      if (c && c > cobrado) { cobrado = c; est = x.status; }
      if (x.status === 'authorized' && !cobrado) est = 'authorized';
    }
    await sb.rpc('bram_srv_sponsor_mp', { p_secreto: '', p: { grupo: s.grupo, mp_estado: est, cobrado: cobrado || null } });
    n++;
    if (soloGrupo) { estado = est; activo = !!cobrado; }
  }
  return json({ ok: true, n, estado, activo });
}

Deno.serve(async (req: Request) => {
  const o = req.headers.get('origin') ?? '';
  cors = {
    'Access-Control-Allow-Origin': ORIGENES.includes(o) ? o : ORIGENES[0],
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  await cargarLlave();
  if (!MP) return json({ error: 'Falta conectar Mercado Pago.', listo: false }, 503);
  if (req.method === 'GET') return sincronizar(); // webhook de Mercado Pago / cron
  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { /* webhook sin cuerpo */ }
  if (b.accion === 'estado') return json({ listo: await listo(), precio: PRECIO });
  if (b.accion === 'contratar') {
    if (!(await listo()) && b.prueba !== true) return json({ error: 'Todavía no se puede pagar online. Escribinos por WhatsApp.' }, 503);
    return contratar(b);
  }
  if (b.accion === 'sincronizar') {
    const g = typeof b.grupo === 'string' && /^[0-9a-f-]{36}$/.test(b.grupo) ? b.grupo : undefined;
    return sincronizar(g);
  }
  return sincronizar(); // webhook de Mercado Pago (POST con {type, data})
});
