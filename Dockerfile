# syntax=docker/dockerfile:1

# 1) Compila el frontend (React + Vite)
FROM node:24-alpine AS client
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# 2) Dependencias de producción del servidor
FROM node:24-alpine AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# 3) Imagen final: API + redirecciones + frontend estático (+ worker con otro comando)
FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY server/package.json ./server/
COPY server/src ./server/src
COPY --from=client /app/client/dist ./client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3000}/health" > /dev/null || exit 1
CMD ["node", "server/src/index.js"]
