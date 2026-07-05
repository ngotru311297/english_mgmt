import cors from 'cors'
import express from 'express'
import morgan from 'morgan'
import { z } from 'zod'
import { prisma } from './lib/prisma.js'
import { hasScheduleConflict, isValidTimeRange } from './utils/schedule.js'

const app = express()
const port = Number(process.env.PORT ?? 4000)

app.use(cors())
app.use(express.json())
app.use(morgan('dev'))

const classInputSchema = z.object({
  name: z.string().trim().min(1),
  schedule: z.string().trim().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  description: z.string().trim().min(1),
})

const studentInputSchema = z.object({
  name: z.string().trim().min(1),
  classId: z.number().int().positive(),
  phone: z.string().trim().min(1),
  parentName: z.string().trim().min(1),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
})

const studentUpdateInputSchema = z.object({
  name: z.string().trim().min(1),
  classId: z.number().int().positive(),
  phone: z.string().trim().min(1),
  parentName: z.string().trim().min(1),
})

const studentStatusInputSchema = z.object({
  status: z.enum(['Active', 'Inactive']),
})

const teacherInputSchema = z.object({
  name: z.string().trim().min(1),
  nickname: z.string().trim().min(1),
  classIds: z.array(z.number().int().positive()).min(1),
  phone: z.string().trim().min(1),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
})

const teacherStatusInputSchema = z.object({
  status: z.enum(['Active', 'Inactive']),
})

const teacherUpdateInputSchema = z.object({
  name: z.string().trim().min(1),
  nickname: z.string().trim().min(1),
  classIds: z.array(z.number().int().positive()).min(1),
  phone: z.string().trim().min(1),
})

const enrollmentSchema = z.object({
  classId: z.number().int().positive(),
  studentId: z.number().int().positive(),
})

const attendanceConfirmSchema = z.object({
  classId: z.number().int().positive(),
  records: z.array(
    z.object({
      studentId: z.number().int().positive(),
      status: z.boolean(),
    }),
  ).min(1),
})

const attendanceDateQuerySchema = z.object({
  className: z.string().trim().min(1),
})

const attendanceRecordsQuerySchema = z.object({
  className: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const attendanceUpdateSchema = z.object({
  records: z
    .array(
      z.object({
        id: z.number().int().positive(),
        status: z.boolean(),
      }),
    )
    .min(1),
})

const getDayRange = (dateText: string) => {
  const start = new Date(`${dateText}T00:00:00.000Z`)
  const end = new Date(`${dateText}T23:59:59.999Z`)
  return { start, end }
}

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.get('/api/classes', async (_req, res, next) => {
  try {
    const classes = await prisma.class.findMany({
      where: { status: 'Learning' },
      orderBy: { id: 'asc' },
    })

    const activeStudentCounts = await Promise.all(
      classes.map(async (item) => {
        const count = await prisma.student.count({
          where: {
            classId: item.id,
            status: 'Active',
          },
        })

        return { classId: item.id, count }
      }),
    )

    const activeCountByClassId = new Map(activeStudentCounts.map((item) => [item.classId, item.count]))

    res.json(
      classes.map((item) => ({
        id: item.id,
        name: item.name,
        schedule: item.schedule,
        startTime: item.startTime,
        endTime: item.endTime,
        description: item.description,
        status: item.status,
        count: activeCountByClassId.get(item.id) ?? 0,
      })),
    )
  } catch (error) {
    next(error)
  }
})

app.post('/api/classes', async (req, res, next) => {
  try {
    const payload = classInputSchema.parse(req.body)

    if (!isValidTimeRange(payload.startTime, payload.endTime)) {
      return res.status(400).json({ message: 'Khoang thoi gian khong hop le.' })
    }

    const existing = await prisma.class.findMany({
      where: { status: 'Learning' },
      select: { id: true, schedule: true, startTime: true, endTime: true },
    })

    if (hasScheduleConflict(payload, existing)) {
      return res.status(409).json({ message: 'Lich hoc bi trung voi lop khac.' })
    }

    const created = await prisma.class.create({ data: payload })
    return res.status(201).json(created)
  } catch (error) {
    next(error)
  }
})

app.put('/api/classes/:id', async (req, res, next) => {
  try {
    const classId = Number(req.params.id)
    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({ message: 'classId khong hop le.' })
    }

    const payload = classInputSchema.parse(req.body)

    if (!isValidTimeRange(payload.startTime, payload.endTime)) {
      return res.status(400).json({ message: 'Khoang thoi gian khong hop le.' })
    }

    const existing = await prisma.class.findMany({
      where: { status: 'Learning' },
      select: { id: true, schedule: true, startTime: true, endTime: true },
    })

    if (hasScheduleConflict(payload, existing, classId)) {
      return res.status(409).json({ message: 'Lich hoc bi trung voi lop khac.' })
    }

    const updated = await prisma.class.update({
      where: { id: classId },
      data: payload,
    })

    return res.json(updated)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/classes/:id', async (req, res, next) => {
  try {
    const classId = Number(req.params.id)
    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({ message: 'classId khong hop le.' })
    }

    await prisma.class.update({
      where: { id: classId },
      data: { status: 'Finish' },
    })
    return res.status(204).send()
  } catch (error) {
    next(error)
  }
})

app.get('/api/students', async (_req, res, next) => {
  try {
    const students = await prisma.student.findMany({
      orderBy: { id: 'asc' },
      include: { class: true },
    })

    res.json(
      students.map((item) => ({
        id: item.id,
        name: item.name,
        classId: item.classId,
        className: item.class.name,
        phone: item.phone,
        parentName: item.parentName,
        status: item.status,
      })),
    )
  } catch (error) {
    next(error)
  }
})

app.post('/api/students', async (req, res, next) => {
  try {
    const payload = studentInputSchema.parse(req.body)
    const classExists = await prisma.class.findUnique({ where: { id: payload.classId } })

    if (!classExists) {
      return res.status(404).json({ message: 'Khong tim thay lop hoc.' })
    }

    const created = await prisma.student.create({
      data: payload,
      include: { class: true },
    })

    return res.status(201).json({
      id: created.id,
      name: created.name,
      classId: created.classId,
      className: created.class.name,
      phone: created.phone,
      parentName: created.parentName,
      status: created.status,
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/students/:id', async (req, res, next) => {
  try {
    const studentId = Number(req.params.id)
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ message: 'studentId khong hop le.' })
    }

    const payload = studentUpdateInputSchema.parse(req.body)
    const classExists = await prisma.class.findUnique({ where: { id: payload.classId } })

    if (!classExists) {
      return res.status(404).json({ message: 'Khong tim thay lop hoc.' })
    }

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: payload,
      include: { class: true },
    })

    return res.json({
      id: updated.id,
      name: updated.name,
      classId: updated.classId,
      className: updated.class.name,
      phone: updated.phone,
      parentName: updated.parentName,
      status: updated.status,
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/students/:id/status', async (req, res, next) => {
  try {
    const studentId = Number(req.params.id)
    if (!Number.isInteger(studentId) || studentId <= 0) {
      return res.status(400).json({ message: 'studentId khong hop le.' })
    }

    const payload = studentStatusInputSchema.parse(req.body)

    const updated = await prisma.student.update({
      where: { id: studentId },
      data: { status: payload.status },
      include: { class: true },
    })

    return res.json({
      id: updated.id,
      name: updated.name,
      classId: updated.classId,
      className: updated.class.name,
      phone: updated.phone,
      parentName: updated.parentName,
      status: updated.status,
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/teachers', async (_req, res, next) => {
  try {
    const teachers = await prisma.teacher.findMany({
      orderBy: { id: 'asc' },
      include: {
        classLinks: {
          include: { class: true },
        },
      },
    })

    res.json(
      teachers.map((item) => ({
        id: item.id,
        name: item.name,
        nickname: item.nickname,
        classIds: item.classLinks.map((link) => link.classId),
        classNames: item.classLinks.map((link) => link.class.name),
        phone: item.phone,
        status: item.status,
      })),
    )
  } catch (error) {
    next(error)
  }
})

app.post('/api/teachers', async (req, res, next) => {
  try {
    const payload = teacherInputSchema.parse(req.body)
    const uniqueClassIds = Array.from(new Set(payload.classIds))
    const classItems = await prisma.class.findMany({ where: { id: { in: uniqueClassIds } } })

    if (classItems.length !== uniqueClassIds.length) {
      return res.status(404).json({ message: 'Khong tim thay lop hoc.' })
    }

    const created = await prisma.teacher.create({
      data: {
        name: payload.name,
        nickname: payload.nickname,
        phone: payload.phone,
        status: payload.status,
        classLinks: {
          create: uniqueClassIds.map((classId) => ({ classId })),
        },
      },
      include: {
        classLinks: {
          include: { class: true },
        },
      },
    })

    return res.status(201).json({
      id: created.id,
      name: created.name,
      nickname: created.nickname,
      classIds: created.classLinks.map((link) => link.classId),
      classNames: created.classLinks.map((link) => link.class.name),
      phone: created.phone,
      status: created.status,
    })
  } catch (error) {
    next(error)
  }
})

app.put('/api/teachers/:id', async (req, res, next) => {
  try {
    const teacherId = Number(req.params.id)
    if (!Number.isInteger(teacherId) || teacherId <= 0) {
      return res.status(400).json({ message: 'teacherId khong hop le.' })
    }

    const payload = teacherUpdateInputSchema.parse(req.body)
    const uniqueClassIds = Array.from(new Set(payload.classIds))

    const classItems = await prisma.class.findMany({ where: { id: { in: uniqueClassIds } } })
    if (classItems.length !== uniqueClassIds.length) {
      return res.status(404).json({ message: 'Khong tim thay lop hoc.' })
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.teacherClass.deleteMany({ where: { teacherId } })

      return tx.teacher.update({
        where: { id: teacherId },
        data: {
          name: payload.name,
          nickname: payload.nickname,
          phone: payload.phone,
          classLinks: {
            create: uniqueClassIds.map((classId) => ({ classId })),
          },
        },
        include: {
          classLinks: {
            include: { class: true },
          },
        },
      })
    })

    return res.json({
      id: updated.id,
      name: updated.name,
      nickname: updated.nickname,
      classIds: updated.classLinks.map((link) => link.classId),
      classNames: updated.classLinks.map((link) => link.class.name),
      phone: updated.phone,
      status: updated.status,
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/teachers/:id/status', async (req, res, next) => {
  try {
    const teacherId = Number(req.params.id)
    if (!Number.isInteger(teacherId) || teacherId <= 0) {
      return res.status(400).json({ message: 'teacherId khong hop le.' })
    }

    const payload = teacherStatusInputSchema.parse(req.body)

    const updated = await prisma.teacher.update({
      where: { id: teacherId },
      data: { status: payload.status },
      include: {
        classLinks: {
          include: { class: true },
        },
      },
    })

    return res.json({
      id: updated.id,
      name: updated.name,
      nickname: updated.nickname,
      classIds: updated.classLinks.map((link) => link.classId),
      classNames: updated.classLinks.map((link) => link.class.name),
      phone: updated.phone,
      status: updated.status,
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/enrollments', async (req, res, next) => {
  try {
    const payload = enrollmentSchema.parse(req.body)

    const classExists = await prisma.class.findUnique({ where: { id: payload.classId } })
    const studentExists = await prisma.student.findUnique({ where: { id: payload.studentId } })

    if (!classExists || !studentExists) {
      return res.status(404).json({ message: 'Khong tim thay lop hoc hoac hoc vien.' })
    }

    const enrollment = await prisma.enrollment.create({ data: payload })
    return res.status(201).json(enrollment)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/enrollments', async (req, res, next) => {
  try {
    const payload = enrollmentSchema.parse(req.body)

    await prisma.enrollment.deleteMany({
      where: {
        classId: payload.classId,
        studentId: payload.studentId,
      },
    })

    return res.status(204).send()
  } catch (error) {
    next(error)
  }
})

app.get('/api/classes/:id/students', async (req, res, next) => {
  try {
    const classId = Number(req.params.id)
    if (!Number.isInteger(classId) || classId <= 0) {
      return res.status(400).json({ message: 'classId khong hop le.' })
    }

    const classItem = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        students: {
          orderBy: { id: 'asc' },
        },
      },
    })

    if (!classItem) {
      return res.status(404).json({ message: 'Khong tim thay lop hoc.' })
    }

    return res.json({
      id: classItem.id,
      name: classItem.name,
      students: classItem.students.map((row) => ({
        id: row.id,
        name: row.name,
        classId: row.classId,
        className: classItem.name,
        phone: row.phone,
        parentName: row.parentName,
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.post('/api/attendance/confirm', async (req, res, next) => {
  try {
    const payload = attendanceConfirmSchema.parse(req.body)

    const classItem = await prisma.class.findUnique({
      where: { id: payload.classId },
      include: {
        students: {
          where: { status: 'Active' },
          select: { id: true, name: true },
        },
      },
    })

    if (!classItem) {
      return res.status(404).json({ message: 'Khong tim thay lop hoc.' })
    }

    const activeStudents = new Map(classItem.students.map((item) => [item.id, item.name]))
    const invalidRecord = payload.records.find((record) => !activeStudents.has(record.studentId))

    if (invalidRecord) {
      return res.status(400).json({ message: 'Hoc vien khong thuoc lop hoc hoac dang Inactive.' })
    }

    const confirmedDate = new Date()
    const confirmedDateText = confirmedDate.toISOString().slice(0, 10)
    const { start, end } = getDayRange(confirmedDateText)

    const existingCount = await prisma.attendanceRecord.count({
      where: {
        className: classItem.name,
        date: {
          gte: start,
          lte: end,
        },
      },
    })

    if (existingCount > 0) {
      return res.status(409).json({ message: 'Lop nay da confirm diem danh hom nay. Vui long sang Bao cao nhanh de chinh sua.' })
    }

    await prisma.attendanceRecord.createMany({
      data: payload.records.map((record) => ({
        studentName: activeStudents.get(record.studentId) ?? '',
        className: classItem.name,
        status: record.status,
        date: confirmedDate,
      })),
    })

    return res.status(201).json({
      saved: payload.records.length,
      className: classItem.name,
      date: confirmedDate.toISOString(),
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/attendance/dates', async (req, res, next) => {
  try {
    const query = attendanceDateQuerySchema.parse(req.query)

    const rows = await prisma.attendanceRecord.findMany({
      where: { className: query.className },
      orderBy: { date: 'desc' },
      select: { date: true },
    })

    const uniqueDates = Array.from(new Set(rows.map((row) => row.date.toISOString().slice(0, 10))))
    return res.json({ dates: uniqueDates })
  } catch (error) {
    next(error)
  }
})

app.get('/api/attendance/records', async (req, res, next) => {
  try {
    const query = attendanceRecordsQuerySchema.parse(req.query)
    const { start, end } = getDayRange(query.date)

    const records = await prisma.attendanceRecord.findMany({
      where: {
        className: query.className,
        date: {
          gte: start,
          lte: end,
        },
      },
      orderBy: [{ studentName: 'asc' }, { createdAt: 'desc' }],
    })

    const latestByStudentName = new Map<string, (typeof records)[number]>()
    records.forEach((record) => {
      if (!latestByStudentName.has(record.studentName)) {
        latestByStudentName.set(record.studentName, record)
      }
    })

    return res.json({
      records: Array.from(latestByStudentName.values()).map((record) => ({
        id: record.id,
        studentName: record.studentName,
        className: record.className,
        status: record.status,
        date: record.date.toISOString(),
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/attendance/records', async (req, res, next) => {
  try {
    const payload = attendanceUpdateSchema.parse(req.body)

    await prisma.$transaction(
      payload.records.map((record) =>
        prisma.attendanceRecord.update({
          where: { id: record.id },
          data: { status: record.status },
        }),
      ),
    )

    return res.json({ updated: payload.records.length })
  } catch (error) {
    next(error)
  }
})

app.get('/api/attendance/export', async (_req, res, next) => {
  try {
    const records = await prisma.attendanceRecord.findMany({
      orderBy: [{ date: 'desc' }, { className: 'asc' }, { studentName: 'asc' }],
    })

    return res.json({
      records: records.map((record) => ({
        id: record.id,
        studentName: record.studentName,
        className: record.className,
        status: record.status,
        date: record.date.toISOString(),
      })),
    })
  } catch (error) {
    next(error)
  }
})

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
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
