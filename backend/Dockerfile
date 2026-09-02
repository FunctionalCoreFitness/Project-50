FROM node:20-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src/ ./src/

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "src/index.js"]
