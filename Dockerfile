FROM oven/bun:1.4.4-alpine AS build

WORKDIR /workspace

COPY package.json bun.lock ./
COPY tsconfig.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN bun install --frozen-lockfile

COPY backend ./backend
RUN bun run --filter @dividend/backend build

FROM oven/bun:1.4.4-alpine AS runtime

WORKDIR /workspace
ENV NODE_ENV=production

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN bun install --frozen-lockfile --production
COPY --from=build /workspace/backend/dist ./backend/dist

EXPOSE 3000
CMD ["bun", "--cwd", "backend", "run", "start:prod"]
