// index.js
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1. 새로운 User 추가
  const newUser = await prisma.user.create({
    data: {
      email: "test@example.com",
      name: "덕태",
    },
  })
  console.log("새 유저 생성:", newUser)

  // 2. 모든 User 조회
  const allUsers = await prisma.user.findMany()
  console.log("전체 유저:", allUsers)
}

// 실행
main()
  .catch((e) => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
