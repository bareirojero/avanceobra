-- =============================================================================
-- Categorías del itemizado (pedido de Jerónimo, 23/10)
--
-- Además de los ítems de obra que vienen del Excel de SAP, cada obra tiene tres
-- entradas fijas a las que se puede vincular una foto:
--   incidente   "Incidente de obra"   (en el informe va siempre primero)
--   dron        "Vuelo de dron"
--   pluviometro "Pluviómetro"
-- Son filas de items con categoría distinta de 'obra', sin padre y sin código
-- PEP: la importación del Excel no las toca ni las da de baja. Las crea la base
-- al dar de alta la obra; las obras que ya existen las reciben acá.
-- =============================================================================

create type categoria_item as enum ('obra', 'incidente', 'dron', 'pluviometro');

alter table items add column categoria categoria_item not null default 'obra';

-- Código fijo, descripción y orden de cada categoría. El orden deja el
-- incidente antes del primer ítem del Excel (que empieza en 1) y dron y
-- pluviómetro al final.
create function items_especiales()
returns table (categoria categoria_item, codigo text, descripcion text, orden integer)
language sql immutable as $$
  values ('incidente'::categoria_item, 'INCIDENTE', 'Incidente de obra', -1),
         ('dron'::categoria_item, 'DRON', 'Vuelo de dron', 1000000),
         ('pluviometro'::categoria_item, 'PLUVIOMETRO', 'Pluviómetro', 1000001)
$$;

-- Agrega a la obra las entradas fijas que le falten. Security definer: la usa
-- el trigger de alta de obra, que puede correr antes de que haya un editor.
create function crear_items_especiales(p_obra uuid) returns void
language sql security definer set search_path = public as $$
  insert into items (obra_id, codigo, descripcion, es_titulo, nivel, orden, categoria)
  select p_obra, e.codigo, e.descripcion, false, 0, e.orden, e.categoria
    from items_especiales() e
   where not exists (select 1 from items i
                      where i.obra_id = p_obra and i.categoria = e.categoria and i.eliminado_en is null)
$$;

create function obras_items_especiales() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform crear_items_especiales(new.id);
  return new;
end $$;
create trigger obras_items_especiales after insert on obras
  for each row execute function obras_items_especiales();

select crear_items_especiales(id) from obras;

-- Importación del itemizado: igual que en 0001, pero solo trabaja sobre los
-- ítems de obra. Las filas del Excel con un código fijo se ignoran.
create or replace function importar_items(p_obra uuid, p_archivo text, p_filas jsonb)
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
    continue when upper(v_codigo) in (select codigo from items_especiales());
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
   where obra_id = p_obra and eliminado_en is null and categoria = 'obra' and not (id = any (v_vistos));

  -- Jerarquía y nivel por prefijo de código.
  update items i set padre_id = (
      select p.id from items p
       where p.obra_id = i.obra_id and p.eliminado_en is null and p.id <> i.id and p.categoria = 'obra'
         and i.codigo like p.codigo || '%'
       order by length(p.codigo) desc limit 1)
   where i.obra_id = p_obra and i.eliminado_en is null and i.categoria = 'obra';

  with recursive arbol as (
    select id, 0 as nivel from items
     where obra_id = p_obra and eliminado_en is null and padre_id is null and categoria = 'obra'
    union all
    select h.id, a.nivel + 1 from items h join arbol a on h.padre_id = a.id
     where h.eliminado_en is null
  )
  update items i set nivel = a.nivel from arbol a where a.id = i.id;

  return v_imp;
end $$;

grant execute on function items_especiales() to avance_api;
