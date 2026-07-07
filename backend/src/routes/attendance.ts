import express from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { getVietnamDateText } from '../utils/date.js'

export const attendanceRouter = express.Router()

const attendanceConfirmSchema = z
  .object({
    classId: z.number().int().positive(),
    records: z
      .array(
        z.object({
          studentId: z.number().int().positive(),
          status: z.boolean(),
        }),
      )
      .min(1),
  })
  .refine((value) => new Set(value.records.map((record) => record.studentId)).size === value.records.length, {
    message: 'Danh sach diem danh chua hoc vien trung lap.',
  })

const attendanceDateQuerySchema = z.object({
  className: z.string().trim().min(1),
})

const attendanceRecordsQuerySchema = z.object({
  className: z.string().trim().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

const attendanceExportQuerySchema = z
  .object({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((value) => (value.start ? Boolean(value.end) : !value.end), {
    message: 'Cần chọn cả ngày bắt đầu và ngày kết thúc.',
  })
  .refine((value) => (value.start && value.end ? value.start <= value.end : true), {
    message: 'Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.',
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

attendanceRouter.post('/confirm', async (req, res, next) => {
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

    const todayText = getVietnamDateText()
    const { start, end } = getDayRange(todayText)

    const alreadyConfirmedMessage = 'Lop nay da confirm diem danh hom nay. Vui long sang Bao cao nhanh de chinh sua.'

    try {
      await prisma.$transaction(async (tx) => {
        const existingCount = await tx.attendanceRecord.count({
          where: {
            className: classItem.name,
            date: {
              gte: start,
              lte: end,
            },
          },
        })

        if (existingCount > 0) {
          throw new Error('ALREADY_CONFIRMED')
        }

        await tx.attendanceRecord.createMany({
          data: payload.records.map((record) => ({
            studentId: record.studentId,
            studentName: activeStudents.get(record.studentId) ?? '',
            className: classItem.name,
            status: record.status,
            date: start,
          })),
        })
      })
    } catch (transactionError) {
      if (transactionError instanceof Error && transactionError.message === 'ALREADY_CONFIRMED') {
        return res.status(409).json({ message: alreadyConfirmedMessage })
      }
      throw transactionError
    }

    return res.status(201).json({
      saved: payload.records.length,
      className: classItem.name,
      date: start.toISOString(),
    })
  } catch (error) {
    next(error)
  }
})

attendanceRouter.get('/dates', async (req, res, next) => {
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

attendanceRouter.get('/records', async (req, res, next) => {
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

    const latestByStudentId = new Map<number, (typeof records)[number]>()
    records.forEach((record) => {
      if (!latestByStudentId.has(record.studentId)) {
        latestByStudentId.set(record.studentId, record)
      }
    })

    return res.json({
      records: Array.from(latestByStudentId.values()).map((record) => ({
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

attendanceRouter.patch('/records', async (req, res, next) => {
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

attendanceRouter.get('/export', async (req, res, next) => {
  try {
    const query = attendanceExportQuerySchema.parse(req.query)
    const where =
      query.start && query.end
        ? { date: { gte: getDayRange(query.start).start, lte: getDayRange(query.end).end } }
        : {}

    const records = await prisma.attendanceRecord.findMany({
      where,
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
