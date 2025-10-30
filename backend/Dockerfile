FROM node:18-alpine

WORKDIR /app

# Install netcat for port checking
RUN apk add --no-cache netcat-openbsd curl

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

CMD ["node", "server.js"]
