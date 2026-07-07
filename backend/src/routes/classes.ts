import express from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'
import { hasScheduleConflict, isValidTimeRange } from '../utils/schedule.js'

export const classesRouter = express.Router()

const classInputSchema = z.object({
  name: z.string().trim().min(1),
  schedule: z.string().trim().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  description: z.string().trim().min(1),
})

classesRouter.get('/', async (_req, res, next) => {
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

classesRouter.post('/', async (req, res, next) => {
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

classesRouter.put('/:id', async (req, res, next) => {
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

classesRouter.delete('/:id', async (req, res, next) => {
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

classesRouter.get('/:id/students', async (req, res, next) => {
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
