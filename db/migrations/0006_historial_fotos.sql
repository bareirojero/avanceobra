-- =============================================================================
-- Historial de cambios en fotos y marcas
--
-- El editor puede corregir o borrar desde la web cualquier foto, su comentario y
-- las marcas, de cualquier día. Cada cambio queda registrado acá: quién, cuándo,
-- qué cambió (antes y después) y, si lo escribió, por qué.
--
-- * Lo escribe solo el trigger (security definer): la API no inserta, no edita ni
--   borra filas de esta tabla.
-- * Se registra todo cambio real en los campos que se muestran, lo haga el autor
--   (el mismo día, desde la app) o el editor. Reenviar los mismos valores (la app
--   reintenta) no deja registro.
-- * El motivo lo declara la API en la transacción:
--   set_config('app.motivo', '<texto>', true).
-- =============================================================================

create table historial_fotos (
  id            uuid primary key default gen_random_uuid(),
  obra_id       uuid not null references obras (id),
  foto_id       uuid not null references fotos (id),
  anotacion_id  uuid references anotaciones (id),   -- null: cambio en la foto
  usuario_id    uuid references usuarios (id),      -- quién hizo el cambio
  -- editar | borrar | restaurar
  accion        text not null check (accion in ('editar', 'borrar', 'restaurar')),
  -- {"comentario": {"antes": "...", "despues": "..."}, "item_id": {...}}
  cambios       jsonb not null default '{}'::jsonb,
  motivo        text,
  creado_en     timestamptz not null default now()
);
create index on historial_fotos (foto_id, creado_en);
create index on historial_fotos (obra_id, creado_en);

create function registrar_cambio_foto() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  campos text[];
  c text;
  antes jsonb := to_jsonb(old);
  despues jsonb := to_jsonb(new);
  cambios jsonb := '{}'::jsonb;
  accion text := 'editar';
  foto uuid;
  marca uuid;
begin
  if tg_table_name = 'fotos' then
    campos := array['item_id', 'sector_id', 'comentario'];
    foto := new.id;
  else
    campos := array['comentario', 'geometria'];
    foto := new.foto_id;
    marca := new.id;
  end if;

  if old.eliminado_en is null and new.eliminado_en is not null then
    accion := 'borrar';
  elsif old.eliminado_en is not null and new.eliminado_en is null then
    accion := 'restaurar';
  end if;

  foreach c in array campos loop
    if antes -> c is distinct from despues -> c then
      cambios := cambios || jsonb_build_object(c, jsonb_build_object('antes', antes -> c, 'despues', despues -> c));
    end if;
  end loop;

  if accion = 'editar' and cambios = '{}'::jsonb then
    return new;
  end if;

  insert into historial_fotos (obra_id, foto_id, anotacion_id, usuario_id, accion, cambios, motivo)
  values (new.obra_id, foto, marca, usuario_actual(), accion, cambios,
          nullif(trim(current_setting('app.motivo', true)), ''));
  return new;
end $$;

create trigger fotos_historial after update on fotos
  for each row execute function registrar_cambio_foto();
create trigger anotaciones_historial after update on anotaciones
  for each row execute function registrar_cambio_foto();

-- Lo ven el editor de la obra y el autor de la foto.
alter table historial_fotos enable row level security;
create policy ver on historial_fotos for select using (
  soy_editor(obra_id) or exists (select 1 from fotos f where f.id = foto_id and f.autor_id = usuario_actual()));

grant select on historial_fotos to avance_api;
