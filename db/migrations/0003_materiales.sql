-- =============================================================================
-- Materiales: catálogo de la organización y pedidos de obra
--
-- * El catálogo (código, descripción, unidad) se carga desde un Excel, como el
--   itemizado, y es uno para toda la organización. Lo importa un editor.
-- * Campo pide desde la app: material, cantidad, sector (un ítem del
--   itemizado, como en el día de obra) y para cuándo lo necesita. El pedido
--   lleva un id generado en el teléfono: reintentar es idempotente.
-- * Editor y solo lectura bajan todos los pedidos de la obra en Excel. El
--   código del material sale en el Excel; la app de campo no lo muestra.
-- =============================================================================

create table importaciones_materiales (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones (id),
  archivo_nombre  text not null,
  filas           integer not null,
  importado_por   uuid not null references usuarios (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);

create table materiales (
  id              uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references organizaciones (id),
  codigo          text not null,
  descripcion     text not null,
  unidad          text,                      -- M3, KG, BOLSA, UN...
  orden           integer not null default 0,
  importacion_id  uuid references importaciones_materiales (id),
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  eliminado_en    timestamptz
);
create index on materiales (organizacion_id);
create unique index materiales_codigo_unico on materiales (organizacion_id, codigo) where eliminado_en is null;

create table pedidos_materiales (
  id              uuid primary key,          -- generado en el teléfono
  obra_id         uuid not null references obras (id),
  autor_id        uuid not null references usuarios (id),
  material_id     uuid not null references materiales (id),
  item_id         uuid not null references items (id),  -- sector: ítem del itemizado
  cantidad        numeric(16, 3) not null check (cantidad > 0),
  necesario_para  date,                      -- fecha en que hace falta en obra
  pedido_en       timestamptz not null,      -- cuándo lo pidió (hora del teléfono)
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  eliminado_en    timestamptz
);
create index on pedidos_materiales (obra_id, pedido_en);

do $$
declare t text;
begin
  foreach t in array array['importaciones_materiales', 'materiales', 'pedidos_materiales'] loop
    execute format('create trigger %I before insert or update on %I
                      for each row execute function tocar_actualizado_en()',
                   t || '_actualizado_en', t);
    execute format('create index on %I (actualizado_en)', t);
  end loop;
end $$;

alter table importaciones_materiales enable row level security;
alter table materiales               enable row level security;
alter table pedidos_materiales       enable row level security;

create policy ver on importaciones_materiales for select using (organizacion_id = mi_organizacion() and soy_admin());
create policy crear on importaciones_materiales for insert with check (organizacion_id = mi_organizacion() and soy_admin());

create policy ver on materiales for select using (organizacion_id = mi_organizacion());
create policy crear on materiales for insert with check (organizacion_id = mi_organizacion() and soy_admin());
create policy editar on materiales for update using (organizacion_id = mi_organizacion() and soy_admin());

-- Pedidos: los ven el editor y solo lectura (para bajar el Excel) y quien lo hizo.
create policy ver on pedidos_materiales for select
  using (mi_rol_en(obra_id) in ('editor', 'lector') or autor_id = usuario_actual());
create policy crear on pedidos_materiales for insert
  with check (autor_id = usuario_actual() and puedo_cargar(obra_id)
              and exists (select 1 from materiales m where m.id = material_id
                             and m.organizacion_id = mi_organizacion())
              and exists (select 1 from items i where i.id = item_id
                             and i.obra_id = pedidos_materiales.obra_id and not i.es_titulo));
create policy editar on pedidos_materiales for update using (soy_editor(obra_id));

-- p_filas: [{ "codigo": "MAT-0001", "descripcion": "Cemento CPII", "unidad": "BOLSA" }]
-- Los materiales con el mismo código conservan su id (no se rompen pedidos
-- viejos); los que ya no vienen se marcan eliminados.
create function importar_materiales(p_archivo text, p_filas jsonb)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_imp uuid;
  v_org uuid := mi_organizacion();
begin
  if not soy_admin() then
    raise exception 'Solo un editor puede importar materiales' using errcode = '42501';
  end if;

  insert into importaciones_materiales (organizacion_id, archivo_nombre, filas, importado_por)
  values (v_org, p_archivo, jsonb_array_length(p_filas), usuario_actual())
  returning id into v_imp;

  -- De una vez (el catálogo de SAP puede tener decenas de miles de filas). Un código
  -- repetido (SAP lo repite por centro) se carga una vez, con su primera fila.
  insert into materiales (organizacion_id, codigo, descripcion, unidad, orden, importacion_id)
  select v_org, codigo, descripcion, unidad, orden, v_imp from (
    select distinct on (codigo) codigo, descripcion, unidad, n as orden
      from (select trim(f.codigo) as codigo, trim(f.descripcion) as descripcion,
                   nullif(trim(f.unidad), '') as unidad, f.n
              from rows from (jsonb_to_recordset(p_filas) as (codigo text, descripcion text, unidad text))
                   with ordinality as f(codigo, descripcion, unidad, n)) x
     where coalesce(codigo, '') <> '' and coalesce(descripcion, '') <> ''
     order by codigo, n
  ) fuente
  on conflict (organizacion_id, codigo) where eliminado_en is null do update set
    descripcion = excluded.descripcion, unidad = excluded.unidad, orden = excluded.orden,
    importacion_id = excluded.importacion_id;

  -- Lo que no vino en esta planilla quedó con otra importación.
  update materiales set eliminado_en = now()
   where organizacion_id = v_org and eliminado_en is null and importacion_id is distinct from v_imp;

  return v_imp;
end $$;

grant select, insert, update on importaciones_materiales, materiales, pedidos_materiales to avance_api;
grant execute on function importar_materiales(text, jsonb) to avance_api;
