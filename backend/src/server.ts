import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import { z } from 'zod'
import { prisma } from './lib/prisma.js'
import { classesRouter } from './routes/classes.js'
import { studentsRouter } from './routes/students.js'
import { teachersRouter } from './routes/teachers.js'
import { enrollmentsRouter } from './routes/enrollments.js'
import { attendanceRouter } from './routes/attendance.js'
import { tuitionRouter } from './routes/tuition.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/classes', classesRouter)
app.use('/api/students', studentsRouter)
app.use('/api/teachers', teachersRouter)
app.use('/api/enrollments', enrollmentsRouter)
app.use('/api/attendance', attendanceRouter)
app.use('/api/tuition', tuitionRouter)

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error)

  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: 'Du lieu dau vao khong hop le.', issues: error.issues })
  }

  if (error && typeof error === 'object' && 'code' in error) {
    const knownError = error as { code?: string }
    if (knownError.code === 'P2002') {
      return res.status(409).json({ message: 'Du lieu bi trung lap.' })
    }
    if (knownError.code === 'P2025') {
      return res.status(404).json({ message: 'Khong tim thay ban ghi.' })
    }
  }

  return res.status(500).json({ message: 'Loi he thong.' })
})

const server = app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`)
})

const shutdown = async () => {
  server.close()
  await prisma.$disconnect()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
