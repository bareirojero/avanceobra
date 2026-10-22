-- Cargo "Oficina Técnica" (pedido de Jerónimo tras el primer uso).
alter type cargo_obra add value if not exists 'oficina_tecnica' after 'jefe_obra';
