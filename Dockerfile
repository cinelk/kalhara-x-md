FROM node:20-alpine

# Install git for npm packages that require it
RUN apk add --no-cache git

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
