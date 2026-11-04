// Supabase Edge Function — avisos de Bramador con la app cerrada (web push).
//
// La llama el cron cada 3 minutos. Mira, para cada spot:
//   · la estación del Náutico San Isidro (ThingSpeak) contra el pronóstico de ahora (Open-Meteo,
//     pedido sobre el agua igual que la app): 5 kn o más de diferencia → "Subió/Bajó el viento";
//   · los "📈 Subió el viento" de los riders en el agua (bram_subidas, últimos 45 min).
// Si hay cambio, manda la notificación a cada teléfono que sigue ese spot (bram_push).
// Un aviso por spot y tipo por hora (bram_push_avisos). Las suscripciones vencidas se borran.
//
// Las mismas reglas que app.js (cambiosDeViento): si se cambian allá, cambiarlas acá.
// Secretos: VAPID_PUBLIC y VAPID_PRIVATE. SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son automáticos.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
webpush.setVapidDetails('https://www.escueladewingfoil.com.ar/bramador/', Deno.env.get('VAPID_PUBLIC') ?? '', Deno.env.get('VAPID_PRIVATE') ?? '');

const SPOTS = [
  { id: 'sanisidro', n: 'San Isidro', plat: -34.457, plng: -58.497 },
  { id: 'peru', n: 'Perú Beach', plat: -34.468, plng: -58.487 },
  { id: 'martinez', n: 'Martínez', plat: -34.478, plng: -58.479 },
  { id: 'olivos', n: 'Olivos', plat: -34.497, plng: -58.465 },
  { id: 'quilmes', n: 'Quilmes', plat: -34.703, plng: -58.227 },
  { id: 'puntalara', n: 'Punta Lara', plat: -34.807, plng: -57.957 },
];
const CERCA_CNSI = ['sanisidro', 'peru', 'martinez'];
const DIF_KN = 5;
const UNA_HORA = 3600e3;
const RUMBOS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
const rumbo = (g: number) => RUMBOS[Math.round((((g % 360) + 360) % 360) / 22.5) % 16];

async function json(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

async function medidoNautico() {
  try {
    const d = await json('https://api.thingspeak.com/channels/1506798/feeds.json?results=3');
    const f = (d.feeds || []).map((x: any) => ({ t: Date.parse(x.created_at), kn: parseFloat(x.field3), dir: parseFloat(x.field4) }))
      .filter((x: any) => isFinite(x.t) && isFinite(x.kn) && isFinite(x.dir));
    const u = f[f.length - 1];
    return u && Date.now() - u.t < 30 * 60e3 ? u : null;
  } catch { return null; }
}

async function pronosticoAhora(): Promise<Record<string, number>> {
  const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + SPOTS.map((s) => s.plat).join(',') +
    '&longitude=' + SPOTS.map((s) => s.plng).join(',') + '&cell_selection=sea&current=wind_speed_10m&wind_speed_unit=kn';
  const d = await json(url);
  const arr = Array.isArray(d) ? d : [d];
  const out: Record<string, number> = {};
  SPOTS.forEach((s, i) => { const v = arr[i]?.current?.wind_speed_10m; if (isFinite(v)) out[s.id] = v; });
  return out;
}

type Cambio = { spot: typeof SPOTS[number]; tipo: 'sube' | 'baja'; texto: string };

function cambios(pron: Record<string, number>, med: any, subidas: Record<string, any>): Cambio[] {
  const res: Cambio[] = [];
  for (const sp of SPOTS) {
    const p = pron[sp.id];
    const partes: string[] = [];
    let tipo: 'sube' | 'baja' | null = null;
    if (med && isFinite(p) && CERCA_CNSI.includes(sp.id)) {
      const dif = med.kn - p;
      if ((dif >= DIF_KN && med.kn >= 10) || (dif <= -DIF_KN && p >= 12)) {
        tipo = dif > 0 ? 'sube' : 'baja';
        partes.push(`El Náutico mide ${Math.round(med.kn)} kn del ${rumbo(med.dir)} y el pronóstico decía ${Math.round(p)}`);
      }
    }
    const sb = subidas?.[sp.id];
    if (sb && sb.riders > 0) {
      tipo = 'sube';
      partes.push(`${sb.riders} ${sb.riders === 1 ? 'rider en el agua dice' : 'riders en el agua dicen'} que subió`);
    }
    if (tipo) res.push({ spot: sp, tipo, texto: partes.join('. ') });
  }
  return res;
}

Deno.serve(async () => {
  const [pron, med, sub, spons] = await Promise.all([
    pronosticoAhora().catch(() => ({} as Record<string, number>)),
    medidoNautico(),
    sb.rpc('bram_subidas').then((r) => r.data || {}),
    sb.rpc('bram_sponsors_activos').then((r) => r.data || []),
  ]);
  const lista = cambios(pron, med, sub);
  const informe: any[] = [];

  for (const c of lista) {
    const { data: prev } = await sb.from('bram_push_avisos').select('t').eq('spot', c.spot.id).eq('tipo', c.tipo).maybeSingle();
    if (prev && Date.now() - Date.parse(prev.t) < UNA_HORA) { informe.push({ spot: c.spot.id, tipo: c.tipo, omitido: 'ya avisado' }); continue; }

    const sp = (spons as any[]).filter((x) => x.slot === 'alerta' && x.spot === c.spot.id)[0] || (spons as any[]).filter((x) => x.slot === 'alerta' && !x.spot)[0];
    const titulo = (c.tipo === 'sube' ? '⚡ Subió el viento en ' : '📉 Bajó el viento en ') + c.spot.n;
    const cuerpo = c.texto + (sp ? '\nPresentado por ' + sp.nombre : '');
    const payload = JSON.stringify({ title: titulo, body: cuerpo, tag: 'cambio-' + c.spot.id, url: '/bramador/#/spot/' + c.spot.id });

    const { data: subs } = await sb.from('bram_push').select('endpoint, sub').contains('spots', [c.spot.id]);
    let ok = 0;
    await Promise.all((subs || []).map(async (s: any) => {
      try {
        await webpush.sendNotification(s.sub, payload, { TTL: 1800, urgency: 'high' });
        ok++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('bram_push').delete().eq('endpoint', s.endpoint);
      }
    }));
    await sb.from('bram_push_avisos').upsert({ spot: c.spot.id, tipo: c.tipo, t: new Date().toISOString(), texto: c.texto, enviados: ok });
    if (sp && ok) await sb.rpc('bram_impresion', { p_sponsor: sp.id, p_slot: 'alerta', p_spot: c.spot.id }).then(() => {}, () => {});
    informe.push({ spot: c.spot.id, tipo: c.tipo, enviados: ok, de: (subs || []).length });
  }
  return new Response(JSON.stringify({ medido: med, pron, cambios: informe }), { headers: { 'Content-Type': 'application/json' } });
});
