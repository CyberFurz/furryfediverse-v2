FROM node:22-bookworm

SHELL ["/bin/bash", "-lc"]
ENV DEBIAN_FRONTEND=noninteractive

# System dependencies
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    git \
    curl \
    vim \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm via corepack and pin to the version used by the project
RUN corepack enable

# Prisma engine + esbuild + sharp need native deps at runtime too
RUN apt-get update -y && apt-get install -y --no-install-recommends \
    libssl3 \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Default dev-friendly environment
ENV NODE_ENV=development \
    BETTER_AUTH_URL=http://localhost:4321 \
    HOST=0.0.0.0 \
    PORT=4321
