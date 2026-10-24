-- =============================================================================
-- Rol Gerente: solo web, solo ve el Dashboard de la obra.
--
-- El valor nuevo del enum va solo en este archivo: Postgres no deja usarlo en la
-- misma transacción en que se agrega. Los permisos están en 0010.
-- =============================================================================

alter type rol_obra add value if not exists 'gerente';
