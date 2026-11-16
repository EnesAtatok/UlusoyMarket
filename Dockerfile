# Ulusoy Market — bağımlılıksız Node.js; npm install gerekmez
FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app

# Uygulama dosyaları (canlı veri imaja girmez; bkz. .dockerignore)
COPY package.json server.js ./
COPY lib ./lib
COPY public ./public
COPY data/seed.json ./data/seed.json

# Kalıcı veri: db.json, sessions.json, backups/, uploads/
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/healthz" >/dev/null || exit 1

CMD ["node", "server.js"]
