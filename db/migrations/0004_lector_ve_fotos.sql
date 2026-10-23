-- El usuario de solo lectura ve el día de obra y las fotos de los informes
-- publicados (antes solo editor y campo podían leer partes, fotos y marcas).
drop policy ver on partes_diarios;
create policy ver on partes_diarios for select using (puedo_ver(obra_id));
drop policy ver on fotos;
create policy ver on fotos for select using (puedo_ver(obra_id));
drop policy ver on anotaciones;
create policy ver on anotaciones for select using (puedo_ver(obra_id));
