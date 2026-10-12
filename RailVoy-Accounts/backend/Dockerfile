# ── RailVoy-Accounts Backend Dockerfile ─────────────────────────────────────
FROM node:20-alpine AS base

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 4002

CMD ["node", "server.js"]
