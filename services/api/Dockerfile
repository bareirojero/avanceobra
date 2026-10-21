# API de Avance de Obra (incluye Chromium para el PDF de los informes).
# Se construye desde la raíz del repositorio:
#   docker build -f services/api/Dockerfile -t avance-obra-api .
FROM node:22-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-dejavu-core fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --prod --filter "@registro-obra/api..." --filter "@registro-obra/db"
ENV NODE_ENV=production CHROMIUM_PATH=/usr/bin/chromium PUERTO=8080
EXPOSE 8080
USER node
CMD ["node", "--experimental-strip-types", "--no-warnings", "services/api/src/servidor.ts"]
