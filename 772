FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends git python3 ffmpeg ca-certificates curl \
 && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .

ENV NODE_ENV=production
ENV PORT=8000
# keep Node inside the 512MB free-plan memory limit
ENV NODE_OPTIONS=--max-old-space-size=320
EXPOSE 8000
CMD ["node", "index.js"]
