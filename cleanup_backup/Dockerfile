# ---- build/run image ----
FROM node:22-alpine

WORKDIR /app

# 필요시 기본 libc 호환
RUN apk add --no-cache libc6-compat

# 패키지 설치
COPY package.json package-lock.json* ./
RUN npm ci

# Prisma 스키마/클라이언트
COPY prisma ./prisma
RUN npx prisma generate

# 앱 소스
COPY api ./api
COPY server ./server

ENV PORT=3000
EXPOSE 3000

# 컨테이너 시작 시: 마이그레이션 적용 후 서버 실행
CMD ["sh", "-c", "npx prisma migrate deploy && node server/server.js"]
