import express from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

export const teachersRouter = express.Router()

const teacherInputSchema = z.object({
  name: z.string().trim().min(1),
  nickname: z.string().trim().min(1),
  classIds: z.array(z.number().int().positive()),
  phone: z.string().trim().min(1),
  status: z.enum(['Active', 'Inactive']).optional().default('Active'),
})

const teacherStatusInputSchema = z.object({
  status: z.enum(['Active', 'Inactive']),
})

const teacherUpdateInputSchema = z.object({
  name: z.string().trim().min(1),
  nickname: z.string().trim().min(1),
  classIds: z.array(z.number().int().positive()),
  phone: z.string().trim().min(1),
})

teachersRouter.get('/', async (_req, res, next) => {
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

teachersRouter.post('/', async (req, res, next) => {
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

teachersRouter.put('/:id', async (req, res, next) => {
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

teachersRouter.patch('/:id/status', async (req, res, next) => {
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
