FROM node:22-bookworm

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
RUN npm ci --ignore-scripts

COPY src/ ./src/

CMD ["npx", "tsx", "src/main.ts"]
