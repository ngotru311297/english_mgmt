import { PrismaClient } from '@prisma/client'

process.loadEnvFile()

export const prisma = new PrismaClient()
