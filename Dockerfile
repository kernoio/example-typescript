FROM docker.io/node:lts-alpine AS builder
WORKDIR /workspace

RUN apk add --no-cache openssl

COPY package*.json ./
COPY nx.json ./
COPY project.json ./
COPY tsconfig*.json ./
COPY jest.config.ts ./

RUN npm ci || npm install

COPY src ./src
COPY prisma ./prisma

RUN npm run build

FROM docker.io/node:lts-alpine AS runner

ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN apk add --no-cache openssl

RUN addgroup --system api && adduser --system -G api api

COPY --from=builder /workspace/dist/api .

COPY prisma prisma
COPY startup.sh startup.sh

RUN npm --omit=dev -f install

RUN chown -R api:api /app/node_modules/.prisma

USER api

CMD ["./startup.sh"]