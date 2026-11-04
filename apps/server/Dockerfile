FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ pkg-config libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev fonts-dejavu-core fonts-liberation && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/storefront/package.json apps/storefront/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --workspace server --include-workspace-root
COPY apps/server apps/server
# Schema generation needs a signing key; this temporary build key is never a runtime environment variable.
RUN JWT_SECRET=$(node -p "require('crypto').randomBytes(48).toString('hex')") APP_ENV=dev npm run build -w server && mkdir -p apps/server/static/private-jobs apps/server/static/assets && chown -R node:node apps/server/static
USER node
WORKDIR /usr/src/app/apps/server
CMD ["node", "dist/index-worker.js"]
