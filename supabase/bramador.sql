-- Bramador (app del viento de Escuela de Wingfoil) en el proyecto de Supabase compartido con Sliabh.
-- Todo lleva prefijo bram_ y no toca nada más. Sin usuarios de Supabase: cada teléfono tiene id + token.
-- Las tablas tienen RLS sin políticas: solo se accede por las funciones de abajo.

create table public.bram_spots (
  id text primary key, nombre text not null, lat double precision not null, lng double precision not null
);
insert into public.bram_spots values
 ('sanisidro','San Isidro',-34.4678,-58.5086),('peru','Perú Beach',-34.4790,-58.4985),
 ('martinez','Martínez',-34.4885,-58.4905),('olivos','Olivos',-34.5075,-58.4770),
 ('quilmes','Quilmes',-34.7135,-58.2385),('puntalara','Punta Lara',-34.8180,-57.9690);

create table public.bram_riders (
  id uuid primary key, token_hash text not null, nombre text, apellido text, mail text,
  alas jsonb not null default '[]'::jsonb, creado timestamptz not null default now(), visto timestamptz not null default now()
);

create table public.bram_reportes (
  id bigint generated always as identity primary key,
  rider uuid not null references public.bram_riders(id) on delete cascade,
  spot text not null references public.bram_spots(id),
  tag text not null,          -- bien, rachado, pocaagua, gente, bajando, subiendo, ala, o no_<tag> ("Ya no")
  ala_marca text, ala_m numeric(3,1),
  kn numeric(4,1),            -- viento del pronóstico en ese momento (para "días de viento")
  t timestamptz not null default now()
);
create index bram_reportes_spot_t on public.bram_reportes (spot, t desc);
create index bram_reportes_rider_t on public.bram_reportes (rider, t desc);

create table public.bram_sponsors (
  id uuid primary key default gen_random_uuid(),
  nombre text not null, logo text,               -- logo chico como data URL
  spot text references public.bram_spots(id),     -- null = todos los spots
  slot text not null default 'senal',             -- senal (SALÍ), alerta, ...
  desde date not null, hasta date not null, activo boolean not null default true,
  actualizado timestamptz not null default now()
);

create table public.bram_impresiones (
  sponsor uuid not null references public.bram_sponsors(id) on delete cascade,
  slot text not null, spot text not null, dia date not null, n integer not null default 0,
  primary key (sponsor, slot, spot, dia)
);

create table public.bram_config (clave text primary key, valor text not null);

alter table public.bram_spots enable row level security;
alter table public.bram_riders enable row level security;
alter table public.bram_reportes enable row level security;
alter table public.bram_sponsors enable row level security;
alter table public.bram_impresiones enable row level security;
alter table public.bram_config enable row level security;
revoke all on public.bram_spots, public.bram_riders, public.bram_reportes, public.bram_sponsors,
  public.bram_impresiones, public.bram_config from anon, authenticated;

create or replace function public.bram_hoy() returns date language sql stable
set search_path = '' as $$ select (now() at time zone 'America/Argentina/Buenos_Aires')::date $$;

create or replace function public._bram_rider_ok(p_id uuid, p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.bram_riders r where r.id = p_id
    and r.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex'))
$$;

create or replace function public._bram_admin_ok(p_clave text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.bram_config c where c.clave = 'admin'
    and c.valor = extensions.crypt(coalesce(p_clave,''), c.valor))
$$;

-- Alta o actualización del rider (la primera vez fija el token).
create or replace function public.bram_registrar(p_id uuid, p_token text, p_nombre text, p_apellido text, p_mail text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_token is null or length(p_token) < 24 then return false; end if;
  if exists(select 1 from public.bram_riders where id = p_id) then
    if not public._bram_rider_ok(p_id, p_token) then return false; end if;
    update public.bram_riders set nombre = coalesce(nullif(left(p_nombre,60),''), nombre),
      apellido = coalesce(nullif(left(p_apellido,60),''), apellido), mail = coalesce(nullif(left(p_mail,120),''), mail), visto = now()
      where id = p_id;
  else
    insert into public.bram_riders(id, token_hash, nombre, apellido, mail)
      values (p_id, encode(extensions.digest(p_token, 'sha256'), 'hex'), nullif(left(p_nombre,60),''), nullif(left(p_apellido,60),''), nullif(left(p_mail,120),''));
  end if;
  return true;
end $$;

create or replace function public.bram_guardar_alas(p_id uuid, p_token text, p_alas jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not public._bram_rider_ok(p_id, p_token) or jsonb_typeof(p_alas) <> 'array' or jsonb_array_length(p_alas) > 12 then return false; end if;
  update public.bram_riders set alas = p_alas, visto = now() where id = p_id;
  return true;
end $$;

-- Estado del spot: últimas 2 h, un voto por rider y etiqueta, los nuevos pesan más.
create or replace function public.bram_estado(p_spot text) returns jsonb
language sql stable security definer set search_path = '' as $$
  with ult as (
    select rider, tag, max(t) t, (array_agg(ala_marca order by t desc))[1] marca, (array_agg(ala_m order by t desc))[1] m
    from public.bram_reportes where spot = p_spot and t > now() - interval '2 hours' group by rider, tag
  ), w as (
    select *, exp(-extract(epoch from now() - t) / 3600.0) peso from ult
  ), est as (
    select p.tag, sum(p.peso) - coalesce((select sum(n.peso) from w n where n.tag = 'no_' || p.tag), 0) puntaje,
           count(distinct p.rider) riders, max(p.t) ultimo
    from w p where p.tag in ('bien','rachado','pocaagua','gente','bajando','subiendo') group by p.tag
  ), gan as (select * from est where puntaje > 0.3 order by puntaje desc, ultimo desc limit 1),
  alas as (select * from w where tag = 'ala' and m is not null),
  rango as (select floor(m)::int base, count(*) c from alas group by 1 order by 2 desc, 1 limit 1),
  marcas as (select marca, count(*) c from alas where marca is not null group by 1 order by 2 desc, 1 limit 2)
  select jsonb_build_object(
    'tag', (select tag from gan), 'riders', (select riders from gan),
    'hace', (select extract(epoch from now() - ultimo)::int from gan),
    'otros', (select coalesce(jsonb_agg(jsonb_build_object('tag', tag, 'riders', riders) order by puntaje desc), '[]') from est where puntaje > 0.3 and tag <> coalesce((select tag from gan), '')),
    'alas_n', (select count(distinct rider) from alas),
    'alas_rango', (select base from rango),
    'alas_marcas', (select coalesce(jsonb_agg(marca order by c desc, marca), '[]') from marcas))
$$;

-- Un toque desde el spot. Valida distancia (1,5 km), etiqueta y frecuencia.
create or replace function public.bram_reportar(p_id uuid, p_token text, p_spot text, p_tag text,
  p_lat double precision, p_lng double precision, p_marca text default null, p_m numeric default null, p_kn numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare s record; dist double precision; prev bigint;
begin
  if not public._bram_rider_ok(p_id, p_token) then return jsonb_build_object('ok', false, 'motivo', 'rider'); end if;
  if p_tag not in ('bien','rachado','pocaagua','gente','bajando','subiendo','ala','no_bien','no_rachado','no_pocaagua','no_gente','no_bajando','no_subiendo') then
    return jsonb_build_object('ok', false, 'motivo', 'tag'); end if;
  select * into s from public.bram_spots where id = p_spot;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'spot'); end if;
  if p_lat is null or p_lng is null then return jsonb_build_object('ok', false, 'motivo', 'lejos'); end if;
  dist := 2 * 6371000 * asin(sqrt(power(sin(radians(p_lat - s.lat) / 2), 2) +
          cos(radians(s.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - s.lng) / 2), 2)));
  if dist > 1500 then return jsonb_build_object('ok', false, 'motivo', 'lejos', 'metros', round(dist)); end if;
  if (select count(*) from public.bram_reportes where rider = p_id and t > now() - interval '1 day') >= 40 then
    return jsonb_build_object('ok', false, 'motivo', 'muchos'); end if;
  if p_tag = 'ala' and (p_m is null or p_m < 1 or p_m > 12) then return jsonb_build_object('ok', false, 'motivo', 'ala'); end if;
  -- El mismo toque en 10 minutos no suma otro voto: solo renueva la hora.
  select id into prev from public.bram_reportes where rider = p_id and spot = p_spot and tag = p_tag and t > now() - interval '10 minutes' order by t desc limit 1;
  if prev is not null then
    update public.bram_reportes set t = now(), ala_marca = left(p_marca,30), ala_m = p_m, kn = coalesce(p_kn, kn) where id = prev;
  else
    insert into public.bram_reportes(rider, spot, tag, ala_marca, ala_m, kn) values (p_id, p_spot, p_tag, left(p_marca,30), p_m, p_kn);
  end if;
  update public.bram_riders set visto = now() where id = p_id;
  return jsonb_build_object('ok', true, 'estado', public.bram_estado(p_spot));
end $$;

-- "Subió el viento": por spot, riders que lo dijeron en los últimos 45 min (si son más que los que dicen "Ya no").
-- La app la consulta cada 2 minutos para avisar rápido en ese spot.
create or replace function public.bram_subidas() returns jsonb
language sql stable security definer set search_path = '' as $$
  with ult as (
    select rider, spot, tag, max(t) t from public.bram_reportes
    where tag in ('subiendo','no_subiendo') and t > now() - interval '45 minutes' group by rider, spot, tag
  ), s as (
    select spot, count(*) filter (where tag = 'subiendo') si, count(*) filter (where tag = 'no_subiendo') no,
           max(t) filter (where tag = 'subiendo') ultimo
    from ult group by spot
  )
  select coalesce(jsonb_object_agg(spot, jsonb_build_object('riders', si, 'hace', extract(epoch from now() - ultimo)::int, 't', extract(epoch from ultimo)::bigint)), '{}'::jsonb)
  from s where si > no
$$;

-- Sponsors vigentes hoy (la app los guarda y elige por spot y lugar).
create or replace function public.bram_sponsors_activos() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'nombre', nombre, 'logo', logo, 'spot', spot, 'slot', slot,
    'v', extract(epoch from actualizado)::bigint) order by spot nulls last), '[]')
  from public.bram_sponsors where activo and public.bram_hoy() between desde and hasta
$$;

create or replace function public.bram_impresion(p_sponsor uuid, p_slot text, p_spot text) returns void
language sql security definer set search_path = '' as $$
  insert into public.bram_impresiones(sponsor, slot, spot, dia, n)
  select p_sponsor, left(p_slot,20), left(p_spot,20), public.bram_hoy(), 1
  where exists(select 1 from public.bram_sponsors where id = p_sponsor)
  on conflict (sponsor, slot, spot, dia) do update set n = public.bram_impresiones.n + 1
$$;

-- ───────── Admin (clave de Francisco) ─────────
create or replace function public.bram_admin_ok(p_clave text) returns boolean
language sql stable security definer set search_path = '' as $$ select public._bram_admin_ok(p_clave) $$;

create or replace function public.bram_admin_sponsors(p_clave text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._bram_admin_ok(p_clave) then raise exception 'clave'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(s) || jsonb_build_object('impresiones', (select coalesce(sum(n),0) from public.bram_impresiones i where i.sponsor = s.id)) order by s.desde desc, s.nombre), '[]') from public.bram_sponsors s);
end $$;

create or replace function public.bram_admin_guardar_sponsor(p_clave text, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare nid uuid;
begin
  if not public._bram_admin_ok(p_clave) then raise exception 'clave'; end if;
  if nullif(p->>'id','') is null then
    insert into public.bram_sponsors(nombre, logo, spot, slot, desde, hasta, activo)
    values (p->>'nombre', p->>'logo', nullif(p->>'spot',''), coalesce(nullif(p->>'slot',''),'senal'), (p->>'desde')::date, (p->>'hasta')::date, coalesce((p->>'activo')::boolean, true))
    returning id into nid;
  else
    update public.bram_sponsors set nombre = p->>'nombre', logo = coalesce(p->>'logo', logo), spot = nullif(p->>'spot',''),
      slot = coalesce(nullif(p->>'slot',''),'senal'), desde = (p->>'desde')::date, hasta = (p->>'hasta')::date,
      activo = coalesce((p->>'activo')::boolean, true), actualizado = now()
    where id = (p->>'id')::uuid returning id into nid;
  end if;
  return nid;
end $$;

-- Sin función de borrar: un sponsor se apaga (activo = false) y sus impresiones quedan.

-- Panel para sponsors, entre dos fechas (hora de Buenos Aires).
create or replace function public.bram_admin_panel(p_clave text, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  if not public._bram_admin_ok(p_clave) then raise exception 'clave'; end if;
  with rep as (
    select r.*, (r.t at time zone 'America/Argentina/Buenos_Aires')::date dia from public.bram_reportes r
    where (r.t at time zone 'America/Argentina/Buenos_Aires')::date between p_desde and p_hasta
  )
  select jsonb_build_object(
    'reportes_dia', (select coalesce(jsonb_agg(x order by x.dia, x.spot), '[]') from (select dia, spot, count(*) reportes, count(distinct rider) riders from rep group by 1,2) x),
    'riders_semana', (select coalesce(jsonb_agg(x order by x.semana), '[]') from (select date_trunc('week', dia)::date semana, count(distinct rider) riders from rep group by 1) x),
    'riders_mes', (select coalesce(jsonb_agg(x order by x.mes), '[]') from (select to_char(dia, 'YYYY-MM') mes, count(distinct rider) riders from rep group by 1) x),
    'dias_viento', (select coalesce(jsonb_agg(x order by x.dia, x.spot), '[]') from (select dia, spot, max(kn) kn_max, count(*) reportes, count(distinct rider) riders from rep group by 1,2 having max(kn) >= 12) x),
    'alas_medida', (select coalesce(jsonb_agg(x order by x.spot, x.riders desc), '[]') from (select spot, ala_m m, count(distinct rider) riders from rep where tag = 'ala' and ala_m is not null group by 1,2) x),
    'alas_marca', (select coalesce(jsonb_agg(x order by x.spot, x.riders desc), '[]') from (select spot, ala_marca marca, count(distinct rider) riders from rep where tag = 'ala' and ala_marca is not null group by 1,2) x),
    'etiquetas', (select coalesce(jsonb_agg(x order by x.spot, x.reportes desc), '[]') from (select spot, tag, count(*) reportes from rep group by 1,2) x),
    'impresiones', (select coalesce(jsonb_agg(x order by x.mes, x.sponsor, x.slot, x.spot), '[]') from (
        select to_char(i.dia, 'YYYY-MM') mes, s.nombre sponsor, i.slot, i.spot, sum(i.n) impresiones
        from public.bram_impresiones i join public.bram_sponsors s on s.id = i.sponsor
        where i.dia between p_desde and p_hasta group by 1,2,3,4) x),
    'riders_total', (select count(*) from public.bram_riders)
  ) into r;
  return r;
end $$;


-- La clave de admin se guarda encriptada en bram_config (clave = 'admin') con extensions.crypt(..., gen_salt('bf')).
