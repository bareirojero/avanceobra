# API

Node 22 + Fastify. Corre TypeScript directo con `--experimental-strip-types` (sin paso de compilación).

```
pnpm --filter @registro-obra/api dev     # con .env de la raíz
pnpm --filter @registro-obra/api test    # pruebas de punta a punta (Postgres + Azurite)
```

- Contrato: `packages/contrato/src/index.ts`. Permisos: en la base (RLS); la API declara el usuario en cada transacción (`conUsuario`).
- Archivos: Azure Blob Storage con URLs firmadas (`src/archivos.ts`).
- Informes: importa `@registro-obra/informes` (services/informes) y le pasa un `Almacen` (`src/rutas/informes.ts`).
