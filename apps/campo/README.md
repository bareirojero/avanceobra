# App de campo (ReporTE)

App Android (Expo / React Native) para capataces y residentes. Se mantiene lo más simple
posible: sacar la foto, escribir qué se ve (y, si hace falta, marcar zonas numeradas con un
comentario cada una), elegir el ítem del itemizado y guardar. Todo queda en el teléfono y se
envía solo cuando hay señal.

Habla con `services/api` (contrato en `packages/contrato`) y usa los colores de
`packages/ui-tokens`.

## Qué hace

- **Ingresar** con usuario y contraseña (los crea el editor en la web). Se entra una sola
  vez; la sesión se renueva sola.
- **Hoy**: las fotos del día de la persona, con su estado de envío, y el botón "Sacar foto".
- **Foto**: comentario libre de la foto entera y marcas opcionales (punto, círculo, recuadro,
  flecha, trazo), cada una con su número y su comentario. Los números no se reutilizan.
- **Ítem** obligatorio: buscador por número o palabras (también busca en el nombre del
  rubro), los usados hace poco y el itemizado por rubros. Los títulos no se eligen.
- **Envíos**: qué espera señal, qué no se pudo enviar (tocar para reintentar) y la opción
  "Enviar solo con Wi-Fi".
- La persona corrige o borra sus fotos **solo el mismo día**. Después la foto se ve pero no
  se edita (la API responde 403 si se intenta).

No hay porcentajes de avance, notas de voz ni parte diario con clima y personal: el clima y
el personal los carga el editor en la web.

## Cómo está armada

```
src/
  app/                 pantallas (Expo Router)
    ingresar.tsx       usuario + contraseña (se recuerda el usuario)
    reingresar.tsx     si la sesión venció: solo la contraseña, sin perder lo cargado
    (pestanas)/        Hoy y Envíos
    camara.tsx         cámara; comprime la foto y pasa a marcar
    foto/[id].tsx      paso 1: comentario y marcas; paso 2: ítem
  domain/              lógica sin React Native (con pruebas)
    marcas.ts          geometría de las marcas
    itemizado.ts       árbol del itemizado, rubro y buscador
    cola.ts            cola de salida FIFO, reintentos, bloqueo por foto
    fechas.ts          fecha del día en hora de Paraguay
  data/
    db.ts              SQLite: mismas columnas que la API + _pendiente + cola_salida
    repositorio.ts     consultas y guardado (una transacción por foto, encola la subida)
    sincronizacion.ts  sube la cola y baja novedades por cursor; disparadores
    backend-api.ts     cliente de services/api (tokens en el almacén cifrado)
    backend-demo.ts    modo demo sin servidor
  components/          botones, foto con marcas, selector de ítem
```

## Sincronización

- Guardar es local e instantáneo. Una foto encola, en este orden: parte del día (si es
  nuevo, `PUT /partes/:id` con `idParte`), archivo y miniatura (`POST /archivos/subida` y
  `PUT` a la URL firmada), fila de la foto (`PUT /fotos/:id`) y marcas
  (`PUT /anotaciones/:id`).
- Sin señal o con error del servidor (5xx) la cola se frena y reintenta con espera creciente
  (15 s a 15 min). Con un 4xx (permisos, datos inválidos) la foto queda "No se pudo enviar"
  y el resto sigue; tocándola en Envíos se reintenta.
- Si se edita una foto que se está subiendo, se vuelve a subir la versión nueva.
- La bajada (`GET /yo` y `GET /obras/:id/sync?desde=`) no pisa filas con cambios sin subir.
- Si la sesión venció (contraseña cambiada, usuario desactivado), la app pide la contraseña
  de nuevo sin borrar nada.
- Corre al abrir la app, al volver a primer plano, cuando vuelve la señal, después de
  guardar, cada 3 minutos con la app abierta y cada 15 en segundo plano.

## Desarrollo

```bash
pnpm install              # desde la raíz del monorepo
cd apps/campo
pnpm exec tsc --noEmit    # tipos
pnpm exec jest            # pruebas de domain/
pnpm exec expo lint
```

La app usa módulos nativos (cámara, SQLite, almacén cifrado), así que no corre en Expo Go:
hace falta un build de desarrollo (`pnpm exec expo run:android` con Android Studio) o el APK.
La raíz usa `node-linker=hoisted` (`.npmrc`) porque React Native necesita `node_modules`
planos.

### Servidor

Con `EXPO_PUBLIC_API_URL` (ej. `http://10.0.2.2:8080/api` para el emulador con la API local)
la app usa la API. Sin ella arranca en **modo demo**: entra con cualquier usuario, trae la
obra de prueba con un itemizado inventado y simula la subida (respeta si hay señal o no).

### APK

El workflow `.github/workflows/app-campo.yml` verifica la app y arma el APK en cada PR que la
toca, en cada push a `main` y a mano desde Actions. El APK queda en los artefactos de la
corrida. Para que apunte al servidor, cargar la variable del repositorio `API_URL` (es una
dirección pública, no un secreto). Está firmado con la clave de depuración: sirve para
instalar directo en los teléfonos, no para Play Store.
