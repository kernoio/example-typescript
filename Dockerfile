FROM docker.io/node:lts-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig*.json ./

RUN npm ci
COPY . .
RUN npx nx reset && npm run build

FROM docker.io/node:lts-alpine

ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

RUN addgroup --system api && \
          adduser --system -G api api

COPY --from=builder /app/dist/api .
COPY package*.json ./
COPY startup.sh startup.sh
RUN sed -i 's/\r$//' startup.sh && chmod +x startup.sh

RUN npm -f install

CMD ["./startup.sh"]
