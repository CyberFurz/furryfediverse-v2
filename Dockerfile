FROM node:22-bookworm-slim AS builder
WORKDIR /app

ARG BETTER_AUTH_SECRET
ARG BETTER_AUTH_URL
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV BETTER_AUTH_URL=${BETTER_AUTH_URL}

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

RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/generated ./generated

EXPOSE 4321
CMD ["sh", "-c", "pnpm prisma migrate deploy && node dist/server/entry.mjs"]
