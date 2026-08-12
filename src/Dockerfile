# Runs on Railway, Render, Fly.io, Azure Container Apps, or any Docker host.
FROM node:22-bookworm-slim

# better-sqlite3 and sharp are native modules; these are needed if npm has to
# compile from source instead of using a prebuilt binary.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
# --include=dev is required: the start script runs via tsx, a devDependency.
RUN npm ci --include=dev

COPY . .

# Persistent state lives here. Mount a volume at /data or you lose run
# history and generated artifacts on every redeploy.
ENV NODE_ENV=production \
    DB_PATH=/data/state.db \
    ARTIFACTS_DIR=/data/artifacts
RUN mkdir -p /data

EXPOSE 3000
CMD ["npm", "start"]
