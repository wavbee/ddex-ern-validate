# DDEX ERN validate service — Node 24 (LTS) on Debian slim.
#
# Defaults to linux/amd64: ddex-parser ships a prebuilt native binary for
# linux-x64-gnu but NOT linux-arm64, so amd64 is the only linux arch on which the
# parser layer runs. This matches CI (ubuntu-latest) and typical x64 hosts; on an
# arm64 host the image runs under emulation. (The service degrades gracefully to
# Layer 1 if the parser is ever missing — see src/ddex.js — but the image ships
# the full parser.) No build toolchain is required; the binary is prebuilt.
# Override with --build-arg IMAGE_PLATFORM=... if you know what you are doing.
ARG IMAGE_PLATFORM=linux/amd64
FROM --platform=${IMAGE_PLATFORM} node:24-slim

ENV NODE_ENV=production \
    PORT=3000

WORKDIR /app

# Install production dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

# Drop privileges to the image's built-in non-root user.
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
