FROM node:20-alpine

# Install git, ffmpeg, and python3 for yt-dlp
RUN apk add --no-cache git ffmpeg python3

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
