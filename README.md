# ReporTE

Registro diario de avance de obra. Capataces y residentes sacan fotos desde una app Android, las vinculan a un ítem del itemizado y comentan lo que ven, marcando zonas sobre la foto si hace falta. Desde la web, el editor revisa lo cargado, genera con IA un informe diario coherente, lo corrige y lo descarga en PDF.

La arquitectura, el modelo de datos y los permisos están en [docs/ARQUITECTURA.md](docs/ARQUITECTURA.md). El contrato de la API está en [packages/contrato](packages/contrato/src/index.ts).

## Desarrollo local

Requisitos: Node 22, pnpm 9 y Docker.

```
cp .env.example .env
pnpm install
pnpm db:up          # Postgres y emulador de Blob Storage
pnpm db:migrate     # aplica db/migrations
pnpm db:seed        # datos de prueba (contraseña obra1234)
```

En este repositorio solo hay código. Los datos de obra, las fotos, los informes y las claves viven en la nube de la organización.

## Cómo se trabaja

Cada módulo se desarrolla en su rama y entra a `main` por pull request. Los cambios de base de datos van como migración nueva en `db/migrations/`.
