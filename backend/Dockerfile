# Agente Comercial WhatsApp + Barbearia
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    CHROME_PATH=/usr/bin/chromium \
    NODE_ENV=production

# Chromium + deps (WPPConnect / Puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    wget \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev=false

COPY tsconfig.json ./
COPY src ./src
COPY config ./config
COPY assets ./assets
COPY panel ./panel
COPY setup.js ./
COPY install-dependencies.sh ./

RUN npm run build \
  && npm prune --omit=dev \
  && mkdir -p data tokens panel/public

# Volumes esperados: /app/data /app/tokens /app/config
ENV SESSION_NAME=assistente \
    ENGINE_MODE=hybrid \
    NICHE_ID=barbershop \
    DEVICE_NAME="Barbearia Navalha Fina" \
    ASSISTANT_NAME=Alex \
    COMPANY_NAME="Barbearia Navalha Fina"

EXPOSE 3000 8787

# Healthcheck simples: arquivo de log ou processo
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "require('fs').accessSync('package.json')" || exit 1

CMD ["node", "dist/index.cjs"]
