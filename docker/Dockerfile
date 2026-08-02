# --- Build frontend assets and version stamp ---
FROM node:22-alpine AS builder

WORKDIR /app

# .git is excluded from the build context; CI passes GIT_SHA so version stamps match the commit.
ARG GIT_SHA
ENV GIT_SHA=${GIT_SHA}

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build \
    && test -f static/style.css || printf '/* Legacy stylesheet placeholder */\n' > static/style.css \
    && test -f client/index.html

# --- Production image ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV BIND_HOST=0.0.0.0
ENV PORT=2121
ENV FORCE_SECURE_COOKIES=false

RUN apk add --no-cache su-exec ffmpeg

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/server ./server
COPY --from=builder /app/client/index.html ./client/index.html
COPY --from=builder /app/version.txt ./
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/static ./static
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

RUN mkdir -p config backup \
    && chown -R node:node /app

EXPOSE 2121

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:2121/api/config/public').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
