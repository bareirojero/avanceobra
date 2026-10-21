-- =============================================================================
-- Avance de Obra: esquema inicial
--
-- Postgres 16, sin dependencias de un proveedor (corre en Azure Database for
-- PostgreSQL, en Docker local o en cualquier Postgres administrado).
--
-- Convenciones (ver docs/ARQUITECTURA.md):
--   * Nombres en español, snake_case, sin tildes.
--   * Lo que crea el teléfono (partes, fotos, anotaciones) lleva un id uuid
--     generado en el teléfono: reintentar una subida es un upsert del mismo id.
--   * Toda tabla tiene creado_en y actualizado_en (los pone la base) y las que
--     se sincronizan tienen eliminado_en (borrado lógico).
--   * Fechas de calendario en hora de Paraguay (America/Asuncion).
--   * Permisos con RLS. La API se conecta con el rol avance_api (sin
--     privilegios de dueño) y en cada transacción declara el usuario con
--     set_config('app.usuario_id', '<uuid>', true).
-- =============================================================================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- Rol con el que se conecta la API. La contraseña se asigna al desplegar,
-- nunca en el repositorio: alter role avance_api with password '...';
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'avance_api') then
    create role avance_api login;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------

-- editor: administra la obra, los usuarios y los informes (web); puede subir fotos.
-- campo:  capataz o residente; sube fotos y comentarios desde la app.
-- lector: solo ve informes publicados.
create type rol_obra as enum ('editor', 'campo', 'lector');
create type cargo_obra as enum ('capataz', 'residente', 'jefe_obra', 'fiscal', 'cliente', 'otro');
create type estado_obra as enum ('activa', 'pausada', 'terminada', 'archivada');
create type tipo_anotacion as enum ('punto', 'circulo', 'rectangulo', 'flecha', 'trazo');
create type origen_foto as enum ('app', 'web');
create type tipo_informe as enum ('diario', 'semanal', 'mensual');
-- generando: la IA está trabajando. borrador: listo para revisar.
-- publicado: revisado por el editor; visible para lectores y descargable.
create type estado_informe as enum ('generando', 'borrador', 'publicado', 'error');

-- -----------------------------------------------------------------------------
-- Utilidades
-- -----------------------------------------------------------------------------

create function tocar_actualizado_en() returns trigger
language plpgsql as $$
begin
  new.actualizado_en := now();
  if tg_op = 'UPDATE' then
    new.creado_en := old.creado_en;  -- inmutable: de ahí sale la regla del mismo día
  end if;
  return new;
end $$;

-- Usuario de la transacción actual (lo declara la API).
create function usuario_actual() returns uuid
language sql stable as $$
  select nullif(current_setting('app.usuario_id', true), '')::uuid
$$;

-- Fecha de hoy en Paraguay.
create function hoy_py() returns date
language sql stable as $$ select (now() at time zone 'America/Asuncion')::date $$;

-- -----------------------------------------------------------------------------
-- Organización y usuarios
-- -----------------------------------------------------------------------------

create table organizaciones (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  zona_horaria   text not null default 'America/Asuncion',
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table usuarios (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones (id),
  usuario         text not null check (usuario ~ '^[a-z0-9._-]{3,40}$'),
  nombre          text not null,
  clave_hash      text not null,             -- bcrypt (pgcrypto crypt/gen_salt('bf'))
  -- Puede crear usuarios y obras. Lo tienen los usuarios con rol Editor.
  es_admin        boolean not null default false,
  activo          boolean not null default true,
  -- Al cambiar la contraseña o desactivar se invalidan las sesiones abiertas.
  version_sesion  integer not null default 1,
  ultimo_ingreso  timestamptz,
  creado_por      uuid references usuarios (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (organizacion_id, usuario)
);
-- El usuario es único en todo el sistema: la pantalla de ingreso no pide empresa.
create unique index usuarios_usuario_unico on usuarios (usuario);

-- Sesiones de larga duración (el teléfono inicia sesión una vez).
-- Se guarda solo el hash del token de renovación.
create table sesiones (
  id             uuid primary key default gen_random_uuid(),
  usuario_id     uuid not null references usuarios (id) on delete cascade,
  token_hash     text not null unique,
  dispositivo    text,                       -- "app Android", "web"
  version_sesion integer not null,
  vence_en       timestamptz not null,
  ultimo_uso     timestamptz not null default now(),
  revocada_en    timestamptz,
  creado_en      timestamptz not null default now()
);
create index on sesiones (usuario_id);

-- -----------------------------------------------------------------------------
-- Obras, sectores e ítems
-- -----------------------------------------------------------------------------

create table obras (
  id                 uuid primary key default gen_random_uuid(),
  organizacion_id    uuid not null references organizaciones (id),
  nombre             text not null,          -- "ODD - Fundaciones"
  codigo             text,                   -- elemento PEP SAP raíz, ej. "OC.0054"
  sigla              text,                   -- para numerar informes, ej. "ODD"
  cliente            text,
  direccion          text,
  latitud            double precision,       -- para el clima del informe
  longitud           double precision,
  fecha_inicio       date,
  fecha_fin_prevista date,
  estado             estado_obra not null default 'activa',
  notas_para_informe text,                   -- instrucciones fijas para la IA
  creado_por         uuid references usuarios (id),
  creado_en          timestamptz not null default now(),
  actualizado_en     timestamptz not null default now(),
  eliminado_en       timestamptz
);
create index on obras (organizacion_id);

create table obra_miembros (
  obra_id        uuid not null references obras (id) on delete cascade,
  usuario_id     uuid not null references usuarios (id) on delete cascade,
  rol            rol_obra not null,
  cargo          cargo_obra,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz,
  primary key (obra_id, usuario_id)
);
create index on obra_miembros (usuario_id);

-- Sectores físicos, jerárquicos y opcionales: "Tribuna norte" > "Eje 5".
create table sectores (
  id             uuid primary key default gen_random_uuid(),
  obra_id        uuid not null references obras (id) on delete cascade,
  padre_id       uuid references sectores (id),
  nombre         text not null,
  orden          integer not null default 0,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);
create index on sectores (obra_id);

-- Cada carga del Excel del itemizado queda registrada.
create table importaciones_items (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references obras (id) on delete cascade,
  archivo_nombre  text not null,
  version         text,                      -- columna VERSIÓN del Excel SAP, ej. "V01"
  filas           integer not null,
  importado_por   uuid not null references usuarios (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

-- Ítems del itemizado, jerárquicos según el código PEP SAP
-- (OC.0054 > OC.0054D001 > OC.0054D001001 > OC.0054D00100101).
create table items (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references obras (id) on delete cascade,
  padre_id        uuid references items (id),
  codigo          text not null,             -- elemento PEP SAP
  numero          text,                      -- "15" del texto "15-CERRAMIENTO..."
  descripcion     text not null,
  unidad          text,                      -- GLB, M3, M2, KG, UN...
  cantidad        numeric(16, 3),
  es_titulo       boolean not null default false, -- agrupador: no se le asignan fotos
  nivel           integer not null default 0,
  orden           integer not null default 0,
  inicio_previsto date,                      -- cronograma opcional
  fin_previsto    date,
  importacion_id  uuid references importaciones_items (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  eliminado_en    timestamptz,
  check (fin_previsto is null or inicio_previsto is null or fin_previsto >= inicio_previsto)
);
create index on items (obra_id);
create unique index items_codigo_unico on items (obra_id, codigo) where eliminado_en is null;

-- -----------------------------------------------------------------------------
-- Carga de campo
-- -----------------------------------------------------------------------------

-- Id determinístico del parte: uuid v5 de "{obra}/{autor}/{fecha}". Igual a
-- idParte() de packages/contrato. Dos teléfonos de la misma persona generan el
-- mismo id para el mismo día y sus fotos quedan en el mismo parte.
create function id_parte(p_obra uuid, p_autor uuid, p_fecha date) returns uuid
language sql immutable as $$
  select uuid_generate_v5('6f1c2a4e-8b3d-4c7a-9e2f-5a1b3c4d5e6f'::uuid,
                          p_obra::text || '/' || p_autor::text || '/' || p_fecha::text)
$$;

-- Parte diario: agrupa lo que cargó una persona en una obra en un día.
create table partes_diarios (
  id             uuid primary key,
  obra_id        uuid not null references obras (id),
  autor_id       uuid not null references usuarios (id),
  fecha          date not null,
  notas          text,                       -- comentario general del día (opcional)
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz,
  unique (obra_id, autor_id, fecha),
  check (id = id_parte(obra_id, autor_id, fecha))
);
create index on partes_diarios (obra_id, fecha);

-- Datos del día de la obra que van al informe, cargados a mano por el editor:
-- clima y personal. Uno por obra y día.
create table registros_dia (
  obra_id        uuid not null references obras (id),
  fecha          date not null,
  clima          text,                       -- "Soleado, 31 °C"
  hubo_lluvia    boolean,
  -- [{ "oficio": "oficial", "cantidad": 2, "empresa": "propia" }]
  personal       jsonb not null default '[]'::jsonb,
  observaciones  text,
  actualizado_por uuid references usuarios (id),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz,
  primary key (obra_id, fecha)
);

create table fotos (
  id             uuid primary key,
  parte_id       uuid not null references partes_diarios (id),
  obra_id        uuid not null references obras (id),
  autor_id       uuid not null references usuarios (id),
  item_id        uuid not null references items (id),  -- obligatorio
  sector_id      uuid references sectores (id),
  origen         origen_foto not null default 'app',
  tomada_en      timestamptz not null,
  latitud        double precision,
  longitud       double precision,
  -- Rutas en el almacenamiento: fotos/{obra}/{autor}/{id}.jpg y {id}_mini.jpg
  archivo_path   text not null,
  miniatura_path text not null,
  ancho          integer,
  alto           integer,
  comentario     text,                       -- lo que escribe debajo de la foto
  orden          integer not null default 0,
  descripcion_ia text,                       -- lo escribe el servidor
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz
);
create index on fotos (obra_id, tomada_en);
create index on fotos (parte_id);
create index on fotos (item_id);

-- Marcas numeradas sobre la foto, opcionales. Coordenadas normalizadas 0..1
-- (x a la derecha, y hacia abajo):
--   punto {"x","y"} · circulo {"cx","cy","r"} (r relativo al ancho)
--   rectangulo {"x","y","w","h"} · flecha {"x1","y1","x2","y2"} (punta en 2)
--   trazo {"puntos":[[x,y],...]}
create table anotaciones (
  id             uuid primary key,
  foto_id        uuid not null references fotos (id),
  obra_id        uuid not null references obras (id),
  autor_id       uuid not null references usuarios (id),
  numero         integer not null,           -- nunca se reutiliza ni renumera
  tipo           tipo_anotacion not null,
  geometria      jsonb not null,
  color          text not null default '#FFC20E',
  comentario     text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminado_en   timestamptz,
  unique (foto_id, numero)
);
create index on anotaciones (foto_id);

-- -----------------------------------------------------------------------------
-- Informes
-- -----------------------------------------------------------------------------

create table informes (
  id              uuid primary key default gen_random_uuid(),
  obra_id         uuid not null references obras (id),
  tipo            tipo_informe not null default 'diario',
  numero          integer,                   -- correlativo por obra y tipo; se muestra como ODD-001-001
  fecha_desde     date not null,
  fecha_hasta     date not null,
  estado          estado_informe not null default 'generando',
  -- contenido_ia: lo que escribió la IA (no se toca). contenido: lo que corrige
  -- el editor. Forma en packages/contrato (ContenidoInforme).
  contenido_ia    jsonb,
  contenido       jsonb,
  version_esquema integer not null default 3,
  modelo_ia       text,
  error           text,
  pdf_path        text,                      -- informes/{obra}/{id}.pdf
  generado_por    uuid references usuarios (id),
  publicado_por   uuid references usuarios (id),
  publicado_en    timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  eliminado_en    timestamptz,
  check (fecha_hasta >= fecha_desde)
);
create index on informes (obra_id, fecha_desde);
create unique index informes_vigente_unico on informes (obra_id, tipo, fecha_desde, fecha_hasta)
  where eliminado_en is null;

-- Número correlativo por obra y tipo, lo asigna la base al crear el informe.
create function numerar_informe() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.numero is null then
    perform pg_advisory_xact_lock(hashtext(new.obra_id::text || new.tipo::text));
    select coalesce(max(numero), 0) + 1 into new.numero
      from informes where obra_id = new.obra_id and tipo = new.tipo;
  end if;
  return new;
end $$;
create trigger informes_numero before insert on informes
  for each row execute function numerar_informe();

-- Qué fotos alimentaron cada informe (los semanales y mensuales resumen
-- informes diarios y sus fotos sin volver a leer todo).
create table informe_fotos (
  informe_id uuid not null references informes (id) on delete cascade,
  foto_id    uuid not null references fotos (id),
  incluida   boolean not null default true,  -- false: la IA la vio pero no la usó
  primary key (informe_id, foto_id)
);

-- -----------------------------------------------------------------------------
-- Triggers de actualizado_en e índices de sincronización
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'organizaciones','usuarios','obras','obra_miembros','sectores','importaciones_items',
    'items','partes_diarios','registros_dia','fotos','anotaciones','informes'
  ] loop
    execute format('create trigger %I before insert or update on %I
                      for each row execute function tocar_actualizado_en()',
                   t || '_actualizado_en', t);
    execute format('create index on %I (actualizado_en)', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Funciones de permisos (security definer: leen sin pasar por RLS)
-- -----------------------------------------------------------------------------

create function mi_organizacion() returns uuid
language sql stable security definer set search_path = public as $$
  select organizacion_id from usuarios where id = usuario_actual() and activo
$$;

create function soy_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from usuarios where id = usuario_actual() and activo), false)
$$;

-- Rol en la obra (null si no es miembro). Un admin actúa como editor en las
-- obras de su organización.
create function mi_rol_en(p_obra uuid) returns rol_obra
language sql stable security definer set search_path = public as $$
  select case
    when soy_admin() and exists (select 1 from obras o where o.id = p_obra
                                  and o.organizacion_id = mi_organizacion())
      then 'editor'::rol_obra
    else (select m.rol from obra_miembros m join usuarios u on u.id = m.usuario_id
           where m.obra_id = p_obra and m.usuario_id = usuario_actual()
             and m.eliminado_en is null and u.activo)
  end
$$;

create function puedo_ver(p_obra uuid) returns boolean
language sql stable as $$ select mi_rol_en(p_obra) is not null $$;

create function puedo_cargar(p_obra uuid) returns boolean
language sql stable as $$ select mi_rol_en(p_obra) in ('editor', 'campo') $$;

create function soy_editor(p_obra uuid) returns boolean
language sql stable as $$ select mi_rol_en(p_obra) = 'editor' $$;

-- El usuario de campo corrige o borra lo suyo solo el mismo día en que lo cargó
-- (fecha de creado_en en Paraguay); después, solo el editor.
create function puedo_corregir(p_obra uuid, p_autor uuid, p_fecha date) returns boolean
language sql stable as $$
  select soy_editor(p_obra)
      or (p_autor = usuario_actual() and puedo_cargar(p_obra) and p_fecha = hoy_py())
$$;

-- -----------------------------------------------------------------------------
-- RLS. Los clientes nunca borran filas: marcan eliminado_en.
-- -----------------------------------------------------------------------------

alter table organizaciones      enable row level security;
alter table usuarios            enable row level security;
alter table sesiones            enable row level security;
alter table obras               enable row level security;
alter table obra_miembros       enable row level security;
alter table sectores            enable row level security;
alter table importaciones_items enable row level security;
alter table items               enable row level security;
alter table partes_diarios      enable row level security;
alter table registros_dia       enable row level security;
alter table fotos               enable row level security;
alter table anotaciones         enable row level security;
alter table informes            enable row level security;
alter table informe_fotos       enable row level security;

create policy ver on organizaciones for select using (id = mi_organizacion());

-- Usuarios: se ven los de la propia organización. Altas y cambios, solo por
-- las funciones crear_usuario y actualizar_usuario. La API nunca lee clave_hash.
create policy ver on usuarios for select using (organizacion_id = mi_organizacion());

-- Sesiones: solo por funciones (sin políticas = sin acceso directo).

create policy ver on obras for select using (puedo_ver(id));
create policy crear on obras for insert with check (organizacion_id = mi_organizacion() and soy_admin());
create policy editar on obras for update using (soy_editor(id));

create policy ver on obra_miembros for select using (puedo_ver(obra_id));
create policy crear on obra_miembros for insert with check (soy_editor(obra_id));
create policy editar on obra_miembros for update using (soy_editor(obra_id));

create policy ver on sectores for select using (puedo_ver(obra_id));
create policy crear on sectores for insert with check (soy_editor(obra_id));
create policy editar on sectores for update using (soy_editor(obra_id));

create policy ver on importaciones_items for select using (soy_editor(obra_id));
create policy crear on importaciones_items for insert with check (soy_editor(obra_id));

create policy ver on items for select using (puedo_ver(obra_id));
create policy crear on items for insert with check (soy_editor(obra_id));
create policy editar on items for update using (soy_editor(obra_id));

-- Carga de campo: la ven editores y campo; los lectores ven el informe.
create policy ver on partes_diarios for select using (puedo_cargar(obra_id));
create policy crear on partes_diarios for insert
  with check (autor_id = usuario_actual() and puedo_cargar(obra_id));
create policy editar on partes_diarios for update
  using (puedo_corregir(obra_id, autor_id, fecha))
  with check (puedo_corregir(obra_id, autor_id, fecha));

create policy ver on registros_dia for select using (puedo_ver(obra_id));
create policy crear on registros_dia for insert with check (soy_editor(obra_id));
create policy editar on registros_dia for update using (soy_editor(obra_id)) with check (soy_editor(obra_id));

create policy ver on fotos for select using (puedo_cargar(obra_id));
create policy crear on fotos for insert
  with check (autor_id = usuario_actual() and puedo_cargar(obra_id)
              and exists (select 1 from partes_diarios p where p.id = parte_id
                             and p.obra_id = fotos.obra_id and p.autor_id = usuario_actual())
              and exists (select 1 from items i where i.id = item_id
                             and i.obra_id = fotos.obra_id and not i.es_titulo
                             and i.eliminado_en is null));
create policy editar on fotos for update
  using (puedo_corregir(obra_id, autor_id, (creado_en at time zone 'America/Asuncion')::date))
  with check (puedo_corregir(obra_id, autor_id, (creado_en at time zone 'America/Asuncion')::date)
              and exists (select 1 from items i where i.id = item_id
                             and i.obra_id = fotos.obra_id and not i.es_titulo));

create policy ver on anotaciones for select using (puedo_cargar(obra_id));
create policy crear on anotaciones for insert
  with check (autor_id = usuario_actual() and puedo_cargar(obra_id)
              and exists (select 1 from fotos f where f.id = foto_id
                             and f.obra_id = anotaciones.obra_id and f.autor_id = usuario_actual()));
create policy editar on anotaciones for update
  using (exists (select 1 from fotos f where f.id = foto_id
                  and puedo_corregir(f.obra_id, f.autor_id, (f.creado_en at time zone 'America/Asuncion')::date)));

-- Informes: el editor ve y edita todos; campo y lector, solo los publicados.
create policy ver on informes for select
  using (soy_editor(obra_id) or (estado = 'publicado' and puedo_ver(obra_id)));
create policy crear on informes for insert with check (soy_editor(obra_id));
create policy editar on informes for update using (soy_editor(obra_id)) with check (soy_editor(obra_id));

create policy ver on informe_fotos for select
  using (exists (select 1 from informes i where i.id = informe_id));
create policy crear on informe_fotos for insert
  with check (exists (select 1 from informes i where i.id = informe_id and soy_editor(i.obra_id)));
create policy editar on informe_fotos for update
  using (exists (select 1 from informes i where i.id = informe_id and soy_editor(i.obra_id)));

-- -----------------------------------------------------------------------------
-- Funciones de autenticación y usuarios (security definer)
-- -----------------------------------------------------------------------------

-- Devuelve el usuario si la contraseña es correcta; null si no.
create function verificar_credenciales(p_usuario text, p_clave text)
returns table (id uuid, version_sesion integer)
language sql security definer set search_path = public as $$
  update usuarios u set ultimo_ingreso = now()
   where u.usuario = lower(trim(p_usuario)) and u.activo
     and u.clave_hash = crypt(p_clave, u.clave_hash)
  returning u.id, u.version_sesion
$$;

create function abrir_sesion(p_usuario uuid, p_token_hash text, p_dispositivo text, p_dias integer)
returns uuid
language sql security definer set search_path = public as $$
  insert into sesiones (usuario_id, token_hash, dispositivo, version_sesion, vence_en)
  select id, p_token_hash, p_dispositivo, version_sesion, now() + make_interval(days => p_dias)
    from usuarios where id = p_usuario and activo
  returning id
$$;

-- Valida un token de renovación y lo rota (devuelve el usuario y su versión).
create function renovar_sesion(p_token_hash text, p_nuevo_hash text, p_dias integer)
returns table (usuario_id uuid, version_sesion integer)
language sql security definer set search_path = public as $$
  update sesiones s
     set token_hash = p_nuevo_hash, ultimo_uso = now(),
         vence_en = now() + make_interval(days => p_dias)
    from usuarios u
   where s.token_hash = p_token_hash and s.revocada_en is null and s.vence_en > now()
     and u.id = s.usuario_id and u.activo and u.version_sesion = s.version_sesion
  returning s.usuario_id, s.version_sesion
$$;

create function cerrar_sesion(p_token_hash text) returns void
language sql security definer set search_path = public as $$
  update sesiones set revocada_en = now() where token_hash = p_token_hash
$$;

-- Versión vigente de la sesión del usuario (la API la compara con la del token).
create function version_sesion_vigente(p_usuario uuid) returns integer
language sql stable security definer set search_path = public as $$
  select version_sesion from usuarios where id = p_usuario and activo
$$;

-- Alta de usuario por un admin (rol Editor). Si se pasa p_obra, lo agrega a la
-- obra con ese rol. Un editor queda como admin.
create function crear_usuario(p_usuario text, p_nombre text, p_clave text,
                              p_rol rol_obra, p_obra uuid default null,
                              p_cargo cargo_obra default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not soy_admin() then
    raise exception 'Solo un editor puede crear usuarios' using errcode = '42501';
  end if;
  if length(p_clave) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres' using errcode = '22023';
  end if;
  insert into usuarios (organizacion_id, usuario, nombre, clave_hash, es_admin, creado_por)
  values (mi_organizacion(), lower(trim(p_usuario)), trim(p_nombre),
          crypt(p_clave, gen_salt('bf', 10)), p_rol = 'editor', usuario_actual())
  returning id into v_id;
  if p_obra is not null then
    if not soy_editor(p_obra) then
      raise exception 'No sos editor de esa obra' using errcode = '42501';
    end if;
    insert into obra_miembros (obra_id, usuario_id, rol, cargo) values (p_obra, v_id, p_rol, p_cargo);
  end if;
  return v_id;
end $$;

-- Cambios de un admin sobre otro usuario: nombre, activo, contraseña, admin.
create function actualizar_usuario(p_id uuid, p_nombre text default null, p_activo boolean default null,
                                   p_clave text default null, p_es_admin boolean default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not soy_admin() then
    raise exception 'Solo un editor puede modificar usuarios' using errcode = '42501';
  end if;
  if p_id = usuario_actual() and (p_activo is false or p_es_admin is false) then
    raise exception 'No podés quitarte el acceso a vos mismo' using errcode = '22023';
  end if;
  if p_clave is not null and length(p_clave) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres' using errcode = '22023';
  end if;
  update usuarios set
    nombre     = coalesce(trim(p_nombre), nombre),
    activo     = coalesce(p_activo, activo),
    es_admin   = coalesce(p_es_admin, es_admin),
    clave_hash = case when p_clave is null then clave_hash else crypt(p_clave, gen_salt('bf', 10)) end,
    version_sesion = version_sesion
                     + case when p_clave is not null or p_activo is false then 1 else 0 end
  where id = p_id and organizacion_id = mi_organizacion();
  if not found then
    raise exception 'Usuario inexistente' using errcode = 'P0002';
  end if;
end $$;

-- Cada uno puede cambiar su propia contraseña.
create function cambiar_mi_clave(p_actual text, p_nueva text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if length(p_nueva) < 6 then
    raise exception 'La contraseña debe tener al menos 6 caracteres' using errcode = '22023';
  end if;
  update usuarios set clave_hash = crypt(p_nueva, gen_salt('bf', 10)),
                      version_sesion = version_sesion + 1
   where id = usuario_actual() and clave_hash = crypt(p_actual, clave_hash);
  if not found then
    raise exception 'La contraseña actual no es correcta' using errcode = '28P01';
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Importación del itemizado (Excel SAP)
-- -----------------------------------------------------------------------------

-- p_filas: [{ "codigo": "OC.0054D00100101", "descripcion": "15-CERRAMIENTO...",
--             "unidad": "GLB", "cantidad": 1, "version": "V01",
--             "inicio_previsto": null, "fin_previsto": null }]
-- La jerarquía sale del código: el padre es el ítem con el código más largo que
-- sea prefijo del código. Sin cantidad = título. "15-" se separa como número.
-- Ítems con el mismo código conservan su id (no se rompen fotos vinculadas);
-- los que ya no vienen se marcan eliminados.
create function importar_items(p_obra uuid, p_archivo text, p_filas jsonb)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_imp uuid;
  v_fila jsonb;
  v_orden integer := 0;
  v_codigo text;
  v_desc text;
  v_numero text;
  v_cant numeric;
  v_id uuid;
  v_vistos uuid[] := '{}';
begin
  if not soy_editor(p_obra) then
    raise exception 'Solo el editor de la obra puede importar el itemizado' using errcode = '42501';
  end if;

  insert into importaciones_items (obra_id, archivo_nombre, version, filas, importado_por)
  values (p_obra, p_archivo,
          (select max(f->>'version') from jsonb_array_elements(p_filas) f),
          jsonb_array_length(p_filas), usuario_actual())
  returning id into v_imp;

  for v_fila in select * from jsonb_array_elements(p_filas) loop
    v_codigo := trim(v_fila->>'codigo');
    continue when v_codigo is null or v_codigo = '';
    v_orden := v_orden + 1;
    v_desc := trim(v_fila->>'descripcion');
    v_numero := substring(v_desc from '^(\d+)\s*-');
    if v_numero is not null then
      v_desc := trim(regexp_replace(v_desc, '^\d+\s*-\s*', ''));
    end if;
    v_cant := nullif(v_fila->>'cantidad', '')::numeric;

    insert into items (obra_id, codigo, numero, descripcion, unidad, cantidad, es_titulo, orden,
                       inicio_previsto, fin_previsto, importacion_id)
    values (p_obra, v_codigo, v_numero, v_desc,
            case when v_cant is null then null else nullif(trim(v_fila->>'unidad'), '') end,
            v_cant, v_cant is null, v_orden,
            (v_fila->>'inicio_previsto')::date, (v_fila->>'fin_previsto')::date, v_imp)
    on conflict (obra_id, codigo) where eliminado_en is null do update set
      numero = excluded.numero, descripcion = excluded.descripcion, unidad = excluded.unidad,
      cantidad = excluded.cantidad, es_titulo = excluded.es_titulo, orden = excluded.orden,
      inicio_previsto = excluded.inicio_previsto, fin_previsto = excluded.fin_previsto,
      importacion_id = excluded.importacion_id
    returning id into v_id;
    v_vistos := v_vistos || v_id;
  end loop;

  update items set eliminado_en = now()
   where obra_id = p_obra and eliminado_en is null and not (id = any (v_vistos));

  -- Jerarquía y nivel por prefijo de código.
  update items i set padre_id = (
      select p.id from items p
       where p.obra_id = i.obra_id and p.eliminado_en is null and p.id <> i.id
         and i.codigo like p.codigo || '%'
       order by length(p.codigo) desc limit 1)
   where i.obra_id = p_obra and i.eliminado_en is null;

  with recursive arbol as (
    select id, 0 as nivel from items
     where obra_id = p_obra and eliminado_en is null and padre_id is null
    union all
    select h.id, a.nivel + 1 from items h join arbol a on h.padre_id = a.id
     where h.eliminado_en is null
  )
  update items i set nivel = a.nivel from arbol a where a.id = i.id;

  return v_imp;
end $$;

-- -----------------------------------------------------------------------------
-- Permisos del rol de la API
-- -----------------------------------------------------------------------------

grant usage on schema public to avance_api;
grant select, insert, update on all tables in schema public to avance_api;
revoke all on sesiones from avance_api;
-- usuarios: lectura sin clave_hash; altas y cambios solo por funciones.
revoke all on usuarios from avance_api;
grant select (id, organizacion_id, usuario, nombre, es_admin, activo, version_sesion,
              ultimo_ingreso, creado_por, creado_en, actualizado_en) on usuarios to avance_api;
grant execute on all functions in schema public to avance_api;
