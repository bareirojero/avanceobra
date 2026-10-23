-- El usuario de solo lectura ve las fotos (con sus marcas) de los informes
-- publicados, y los partes de esos días. La carga cruda sigue siendo solo de
-- editor y campo. La política de informes ya oculta los no publicados al lector.
drop policy ver on partes_diarios;
create policy ver on partes_diarios for select using (
  puedo_cargar(obra_id) or exists (
    select 1 from informes i
     where i.obra_id = partes_diarios.obra_id and i.estado = 'publicado'
       and partes_diarios.fecha between i.fecha_desde and i.fecha_hasta));
drop policy ver on fotos;
create policy ver on fotos for select using (
  puedo_cargar(obra_id) or exists (
    select 1 from informe_fotos x join informes i on i.id = x.informe_id
     where x.foto_id = fotos.id and i.estado = 'publicado'));
drop policy ver on anotaciones;
create policy ver on anotaciones for select using (
  puedo_cargar(obra_id) or exists (select 1 from fotos f where f.id = anotaciones.foto_id));
