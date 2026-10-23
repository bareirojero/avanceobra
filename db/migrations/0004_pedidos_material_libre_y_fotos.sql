-- =============================================================================
-- Pedidos de materiales: material escrito a mano y fotos de referencia
--
-- * Si el material no está en el catálogo, campo lo escribe a mano
--   (material_texto, unidad_texto). En el Excel sale "CREAR RECURSO EN SAP".
-- * Fotos opcionales del producto, solo de referencia:
--   pedidos/{obra}/{autor}/{foto}.jpg en el almacenamiento.
-- =============================================================================

alter table pedidos_materiales
  alter column material_id drop not null,
  add column material_texto text,
  add column unidad_texto   text,
  add column fotos          text[] not null default '{}',
  add constraint pedido_con_material check (material_id is not null or nullif(trim(material_texto), '') is not null);

drop policy crear on pedidos_materiales;
create policy crear on pedidos_materiales for insert
  with check (autor_id = usuario_actual() and puedo_cargar(obra_id)
              and (material_id is null or exists (select 1 from materiales m where m.id = material_id
                                                     and m.organizacion_id = mi_organizacion()))
              and exists (select 1 from items i where i.id = item_id
                             and i.obra_id = pedidos_materiales.obra_id and not i.es_titulo));
