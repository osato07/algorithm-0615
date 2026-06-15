FROM node:22-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY client ./client
COPY server ./server

EXPOSE 8080

CMD ["npm", "start"]
