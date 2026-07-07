import express from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

export const studentsRouter = express.Router()

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

studentsRouter.get('/', async (_req, res, next) => {
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

studentsRouter.post('/', async (req, res, next) => {
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

studentsRouter.put('/:id', async (req, res, next) => {
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

studentsRouter.patch('/:id/status', async (req, res, next) => {
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
