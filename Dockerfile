FROM node:22-bookworm-slim AS builder
WORKDIR /app

ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV BETTER_AUTH_URL=${BETTER_AUTH_URL}

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm prisma generate && pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321

RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/generated ./generated

EXPOSE 4321
CMD ["sh", "-c", "printf 'Startup env check: DATABASE_URL set=%s, BETTER_AUTH_URL=%s\n' \"${DATABASE_URL:+yes}\" \"${BETTER_AUTH_URL:-unset}\" && pnpm dlx prisma@7.8.0 migrate deploy && node dist/server/entry.mjs"]
