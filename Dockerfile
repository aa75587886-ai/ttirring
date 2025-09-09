# ---- build/run image ----
FROM node:22-alpine

WORKDIR /app

# 기본 호환 + 헬스체크용 curl
RUN apk add --no-cache libc6-compat curl

# 패키지 설치 (prod)
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
# pino-pretty 런타임 설치 (개발 의존성 아님)
RUN npm install --no-save pino-pretty

# Prisma 스키마/클라이언트
COPY prisma ./prisma
RUN npx prisma generate

# 앱 소스 전체
COPY . .

ENV PORT=3000
EXPOSE 3000

# 컨테이너 시작 시: 마이그레이션 적용 후 서버 실행
CMD ["sh", "-c", "npx prisma migrate deploy && node server/server.js"]
