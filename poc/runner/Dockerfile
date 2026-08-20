FROM node:22-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    docker.io curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src/ ./src/

CMD ["npx", "tsx", "src/index.ts"]
