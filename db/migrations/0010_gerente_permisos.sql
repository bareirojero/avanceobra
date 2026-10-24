-- =============================================================================
-- Permisos del rol Gerente
--
-- El gerente ve la obra (nombre, código) y el Dashboard, nada más: ni ítems,
-- ni equipo, ni partes, ni informes, ni pedidos. Las fotos del día le llegan
-- solo por dashboard_fotos(), que las devuelve ya armadas para la galería.
-- =============================================================================

-- puedo_ver deja afuera al gerente: todas las políticas que lo usan (ítems,
-- sectores, miembros, registros del día, informes publicados) lo excluyen.
create or replace function puedo_ver(p_obra uuid) returns boolean
language sql stable as $$ select mi_rol_en(p_obra) in ('editor', 'campo', 'lector') $$;

-- La obra en sí la ve cualquier miembro, gerente incluido (para /yo y el título).
drop policy ver on obras;
create policy ver on obras for select using (mi_rol_en(id) is not null);

-- Usuario que solo es gerente (en todas sus obras activas y sin ser admin): la
-- API le cierra todo salvo su perfil y el Dashboard.
create function solo_gerente(p_usuario uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not u.es_admin
     and exists (select 1 from obra_miembros m where m.usuario_id = u.id and m.eliminado_en is null
                   and m.rol = 'gerente')
     and not exists (select 1 from obra_miembros m where m.usuario_id = u.id and m.eliminado_en is null
                       and m.rol <> 'gerente')
    from usuarios u where u.id = p_usuario
$$;

-- Fotos para la galería del Dashboard: las vigentes del último día con fotos
-- (hasta hoy), con el ítem y quien la sacó. La ve cualquier miembro de la obra.
create function dashboard_fotos(p_obra uuid)
returns table (fecha date, id uuid, archivo_path text, miniatura_path text, ancho integer, alto integer,
               tomada_en timestamptz, comentario text, autor text, item_numero text, item_descripcion text)
language plpgsql stable security definer set search_path = public as $$
declare v_fecha date;
begin
  if mi_rol_en(p_obra) is null then
    raise exception 'No tenés acceso a esta obra' using errcode = '42501';
  end if;
  select max(p.fecha) into v_fecha
    from fotos f join partes_diarios p on p.id = f.parte_id
   where f.obra_id = p_obra and f.eliminado_en is null and p.eliminado_en is null and p.fecha <= hoy_py();
  return query
    select p.fecha, f.id, f.archivo_path, f.miniatura_path, f.ancho, f.alto, f.tomada_en, f.comentario,
           u.nombre, i.numero, i.descripcion
      from fotos f
      join partes_diarios p on p.id = f.parte_id
      join usuarios u on u.id = f.autor_id
      left join items i on i.id = f.item_id
     where f.obra_id = p_obra and p.fecha = v_fecha and f.eliminado_en is null and p.eliminado_en is null
     order by f.tomada_en;
end $$;

revoke execute on function solo_gerente(uuid) from public;
grant execute on function solo_gerente(uuid) to avance_api;
revoke execute on function dashboard_fotos(uuid) from public;
grant execute on function dashboard_fotos(uuid) to avance_api;
