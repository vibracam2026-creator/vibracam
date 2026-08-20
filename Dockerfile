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
ENV PORT=3000

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "dist/index.js"]
