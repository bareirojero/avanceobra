-- =============================================================================
-- Informe diario automático
--
-- Si a las 23:55 (Paraguay) una obra activa tiene fotos del día y nadie armó el
-- informe, la API lo genera como borrador en nombre de un editor de la obra
-- (POST /api/tareas/informes-diarios, lo llama .github/workflows/informe-automatico.yml).
-- =============================================================================

alter table informes add column automatico boolean not null default false;

-- Obras con fotos ese día y sin informe (o con uno que falló), con el editor que
-- lo firma: el primer editor de la obra o, si no hay, el primer admin de la
-- organización. Security definer: la tarea no tiene usuario y RLS no la dejaría ver.
create function informes_pendientes(p_fecha date)
returns table (obra_id uuid, editor_id uuid, informe_id uuid)
language sql stable security definer set search_path = public as $$
  select o.id,
         coalesce(
           (select m.usuario_id from obra_miembros m join usuarios u on u.id = m.usuario_id
             where m.obra_id = o.id and m.rol = 'editor' and m.eliminado_en is null and u.activo
             order by m.creado_en limit 1),
           (select u.id from usuarios u
             where u.organizacion_id = o.organizacion_id and u.es_admin and u.activo
             order by u.creado_en limit 1)),
         i.id
    from obras o
    left join informes i on i.obra_id = o.id and i.tipo = 'diario' and i.fecha_desde = p_fecha
                        and i.fecha_hasta = p_fecha and i.eliminado_en is null
   where o.eliminado_en is null and o.estado = 'activa'
     and (i.id is null or i.estado = 'error')
     and exists (select 1 from fotos f join partes_diarios p on p.id = f.parte_id
                  where f.obra_id = o.id and p.fecha = p_fecha and f.eliminado_en is null
                    and p.eliminado_en is null)
   order by o.nombre
$$;

revoke execute on function informes_pendientes(date) from public;
grant execute on function informes_pendientes(date) to avance_api;
