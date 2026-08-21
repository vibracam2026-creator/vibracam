FROM node:22-slim

# Install system dependencies (needed for image processing, media, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Enable corepack and prepare pnpm
RUN npm install -g corepack@latest

# Copy package files and patches
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches/

# Install dependencies
RUN corepack pnpm install

# Copy application code
COPY . .

# Build the application
RUN corepack pnpm run build

# Set environment variables
ENV NODE_ENV=production

# Render provides the PORT environment variable at runtime
EXPOSE 10000

# Run database migrations, then start the application
CMD ["sh", "-c", "corepack pnpm db:migrate && node dist/index.js"]
