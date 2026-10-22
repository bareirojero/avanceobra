// Carga inicial de producción: organización, primer usuario editor y la obra.
// No hace nada si ya hay una organización. Las contraseñas llegan por
// variables de entorno (secretos de GitHub Actions), nunca por el repositorio.
//   DATABASE_ADMIN_URL, ORG_NOMBRE, EDITOR_USUARIO, EDITOR_NOMBRE, EDITOR_CLAVE,
//   OBRA_NOMBRE, OBRA_CODIGO, OBRA_SIGLA
import pg from 'pg';

const e = (n, def) => {
  const v = process.env[n] || def;
  if (!v) throw new Error(`Falta ${n}`);
  return v;
};

const cliente = new pg.Client({ connectionString: e('DATABASE_ADMIN_URL') });
await cliente.connect();
try {
  const { rows } = await cliente.query('select count(*)::int as n from organizaciones');
  if (rows[0].n > 0) {
    console.log('Ya hay datos: no se cambia nada.');
  } else {
    await cliente.query('begin');
    const org = (await cliente.query('insert into organizaciones (nombre) values ($1) returning id', [e('ORG_NOMBRE')])).rows[0].id;
    const editor = (
      await cliente.query(
        `insert into usuarios (organizacion_id, usuario, nombre, clave_hash, es_admin)
         values ($1, lower($2), $3, crypt($4, gen_salt('bf', 10)), true) returning id`,
        [org, e('EDITOR_USUARIO'), e('EDITOR_NOMBRE'), e('EDITOR_CLAVE')],
      )
    ).rows[0].id;
    const obra = (
      await cliente.query(
        `insert into obras (organizacion_id, nombre, codigo, sigla, creado_por) values ($1, $2, $3, $4, $5) returning id`,
        [org, e('OBRA_NOMBRE', 'ODD - Fundaciones'), e('OBRA_CODIGO', 'OC.0054'), e('OBRA_SIGLA', 'ODD'), editor],
      )
    ).rows[0].id;
    await cliente.query(`insert into obra_miembros (obra_id, usuario_id, rol, cargo) values ($1, $2, 'editor', 'jefe_obra')`, [obra, editor]);
    await cliente.query('commit');
    console.log('Organización, editor y obra creados.');
  }
} finally {
  await cliente.end();
}
