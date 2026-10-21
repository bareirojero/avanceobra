-- Datos inventados para desarrollo y demo. Nunca se cargan en producción.
-- Contraseña de todos: obra1234
--   editor    editor (admin)      capataz   campo (capataz)
--   residente campo (residente)   fiscal    lector
-- El itemizado real se importa desde el panel con el Excel de SAP.

insert into organizaciones (id, nombre) values
  ('b0000000-0000-4000-8000-000000000001', 'Organización de prueba');

insert into usuarios (id, organizacion_id, usuario, nombre, clave_hash, es_admin) values
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'editor',    'Editor de prueba',    crypt('obra1234', gen_salt('bf', 10)), true),
  ('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'capataz',   'Capataz de prueba',   crypt('obra1234', gen_salt('bf', 10)), false),
  ('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'residente', 'Residente de prueba', crypt('obra1234', gen_salt('bf', 10)), false),
  ('a0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'fiscal',    'Fiscal de prueba',    crypt('obra1234', gen_salt('bf', 10)), false);

insert into obras (id, organizacion_id, nombre, codigo, sigla, direccion, latitud, longitud, creado_por) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   'Obra de prueba - Fundaciones', 'OC.9999', 'PRB', 'Asunción', -25.2867, -57.5640,
   'a0000000-0000-4000-8000-000000000001');

insert into obra_miembros (obra_id, usuario_id, rol, cargo) values
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'editor', 'jefe_obra'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'campo',  'capataz'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'campo',  'residente'),
  ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 'lector', 'fiscal');

insert into sectores (obra_id, nombre, orden) values
  ('c0000000-0000-4000-8000-000000000001', 'Tribuna norte', 1),
  ('c0000000-0000-4000-8000-000000000001', 'Tribuna sur', 2),
  ('c0000000-0000-4000-8000-000000000001', 'Cabecera este', 3);

-- Itemizado inventado con la misma forma que el Excel de SAP.
select set_config('app.usuario_id', 'a0000000-0000-4000-8000-000000000001', false);
select importar_items('c0000000-0000-4000-8000-000000000001', 'itemizado-prueba.xlsx', '[
  {"codigo":"OC.9999","descripcion":"OBRA DE PRUEBA - FUNDACIONES"},
  {"codigo":"OC.9999D001","descripcion":"TRABAJOS PRELIMINARES","version":"V01","unidad":"UN"},
  {"codigo":"OC.9999D00100101","descripcion":"1-CERRAMIENTO PERIMETRAL","version":"V01","cantidad":1,"unidad":"GLB"},
  {"codigo":"OC.9999D00100102","descripcion":"2-LIMPIEZA DEL TERRENO","version":"V01","cantidad":1,"unidad":"GLB"},
  {"codigo":"OC.9999D002","descripcion":"ZAPATA CORRIDA","version":"V01","unidad":"UN"},
  {"codigo":"OC.9999D00200101","descripcion":"3-REPLANTEO Y TRAZADO","version":"V01","cantidad":100,"unidad":"UN"},
  {"codigo":"OC.9999D00200102","descripcion":"4-EXCAVACION DE ZANJA","version":"V01","cantidad":300,"unidad":"M3"},
  {"codigo":"OC.9999D00200103","descripcion":"5-HORMIGON DE LIMPIEZA","version":"V01","cantidad":30,"unidad":"M3"},
  {"codigo":"OC.9999D00200104","descripcion":"6-ARMADURA DE ZAPATA","version":"V01","cantidad":20000,"unidad":"KG"},
  {"codigo":"OC.9999D00200105","descripcion":"7-HORMIGONADO DE ZAPATA","version":"V01","cantidad":200,"unidad":"M3"}
]'::jsonb);
select set_config('app.usuario_id', '', false);
