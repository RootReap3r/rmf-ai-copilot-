# ─────────────────────────────────────────────────────────────────
# Stage 1: build the React frontend
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ─────────────────────────────────────────────────────────────────
# Stage 2: backend + serve built frontend
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY server/package.json ./server/
RUN cd server && npm install --omit=dev

COPY server/ ./server/
COPY --from=client-build /app/client/dist ./client/dist

WORKDIR /app/server
EXPOSE 3001

# Persist storage.json outside the container image
VOLUME ["/app/server/data"]

CMD ["node", "index.js"]
