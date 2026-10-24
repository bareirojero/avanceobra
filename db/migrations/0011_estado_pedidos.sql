-- =============================================================================
-- Estado de los pedidos de materiales
--
-- * El editor marca en qué anda cada pedido (uno o varios a la vez) desde la
--   planilla web; campo lo ve en la app, en sus pedidos.
-- * Los pedidos que ya existían quedan como 'enviado' (el valor por defecto).
--   Agregar la columna no toca actualizado_en: la sincronización de fotos y
--   partes no se entera.
-- =============================================================================

alter table pedidos_materiales
  add column estado text not null default 'enviado'
    check (estado in ('enviado', 'rechazado', 'planificando', 'en_compra', 'disponible')),
  add column estado_cambiado_por uuid references usuarios (id),
  add column estado_cambiado_en  timestamptz;

-- Para que campo baje sus pedidos (de todas las fechas) por cursor.
create index on pedidos_materiales (autor_id, actualizado_en);
