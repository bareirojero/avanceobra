-- =============================================================================
-- Revisiones del informe: el PDF publicado queda congelado
--
-- Al publicar, la API guarda una revisión con el contenido del editor y una foto
-- de los datos del día tal como estaban (fotos, comentarios, marcas, ítems,
-- sectores, personas). El PDF de esa revisión se arma solo con eso: lo que pase
-- después en la base (fotos corregidas o borradas, ítems renombrados) no lo cambia.
--
-- Para corregir un informe publicado, el editor lo vuelve a borrador y lo publica
-- de nuevo: eso crea la revisión siguiente (Rev. 0, Rev. 1, ...) con su código,
-- ej. ODD-001-007-R1. Las anteriores quedan guardadas con su PDF.
--
-- * informes.revision: la revisión vigente (la última publicada); null si nunca
--   se publicó. informes.pdf_path pasa a ser el PDF de esa revisión.
-- * Una revisión no se modifica ni se borra (trigger). Solo se completan una vez
--   datos y pdf_path si estaban vacíos.
-- * Los informes que ya estaban publicados pasan a ser su Rev. 0, con el PDF que
--   ya tenían. Si no tenían PDF, los datos se congelan al armarlo por primera vez.
-- =============================================================================

create table informe_revisiones (
  id            uuid primary key default gen_random_uuid(),
  informe_id    uuid not null references informes (id),
  obra_id       uuid not null references obras (id),
  revision      integer not null check (revision >= 0),
  codigo        text not null,                -- ODD-001-007-R0
  contenido     jsonb not null,               -- ContenidoInforme tal como se publicó
  datos         jsonb,                        -- datos del día congelados (DatosDelDia)
  pdf_path      text,                         -- informes/{obra}/{informe}-r{n}.pdf
  publicado_por uuid references usuarios (id),
  publicado_en  timestamptz not null default now(),
  creado_en     timestamptz not null default now(),
  unique (informe_id, revision)
);
create index on informe_revisiones (obra_id);

alter table informes add column revision integer;

create function revision_inmutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Una revisión publicada del informe no se borra';
  end if;
  if new.informe_id is distinct from old.informe_id or new.obra_id is distinct from old.obra_id
     or new.revision is distinct from old.revision or new.codigo is distinct from old.codigo
     or new.contenido is distinct from old.contenido or new.publicado_por is distinct from old.publicado_por
     or new.publicado_en is distinct from old.publicado_en or new.creado_en is distinct from old.creado_en
     or (old.datos is not null and new.datos is distinct from old.datos)
     or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path) then
    raise exception 'Una revisión publicada del informe no se modifica';
  end if;
  return new;
end $$;
create trigger informe_revisiones_inmutable before update or delete on informe_revisiones
  for each row execute function revision_inmutable();

-- Lo publicado hasta hoy pasa a ser la Rev. 0, con el PDF que ya tenía.
insert into informe_revisiones (informe_id, obra_id, revision, codigo, contenido, pdf_path, publicado_por, publicado_en)
select i.id, i.obra_id, 0,
       coalesce(o.sigla, 'INF') || '-001-' || lpad(i.numero::text, greatest(3, length(i.numero::text)), '0') || '-R0',
       i.contenido, i.pdf_path, i.publicado_por, coalesce(i.publicado_en, i.actualizado_en)
  from informes i join obras o on o.id = i.obra_id
 where i.estado = 'publicado' and i.contenido is not null and i.eliminado_en is null;
update informes i set revision = 0
 where exists (select 1 from informe_revisiones r where r.informe_id = i.id);

alter table informe_revisiones enable row level security;
-- El editor ve todas; los demás, las de informes que pueden ver (los publicados).
create policy ver on informe_revisiones for select
  using (soy_editor(obra_id) or exists (select 1 from informes i where i.id = informe_id));
create policy crear on informe_revisiones for insert with check (soy_editor(obra_id));
create policy editar on informe_revisiones for update using (soy_editor(obra_id)) with check (soy_editor(obra_id));

grant select, insert, update on informe_revisiones to avance_api;
