FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./

COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY apps/bot/package.json ./apps/bot/package.json

RUN npm ci

COPY apps ./apps

EXPOSE 3000 5173

CMD ["npm", "run", "dev:api"]
