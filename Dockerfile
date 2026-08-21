FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN npm install -g corepack@latest

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches/
RUN corepack pnpm install

COPY . .

RUN corepack pnpm run build

ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

CMD ["sh", "-c", "corepack pnpm db:migrate && exec node dist/index.js"]
