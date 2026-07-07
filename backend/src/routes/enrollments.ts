import express from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

export const enrollmentsRouter = express.Router()

const enrollmentSchema = z.object({
  classId: z.number().int().positive(),
  studentId: z.number().int().positive(),
})

enrollmentsRouter.post('/', async (req, res, next) => {
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

enrollmentsRouter.delete('/', async (req, res, next) => {
  try {
    const payload = enrollmentSchema.parse(req.body)

    const result = await prisma.enrollment.deleteMany({
      where: {
        classId: payload.classId,
        studentId: payload.studentId,
      },
    })

    if (result.count === 0) {
      return res.status(404).json({ message: 'Khong tim thay enrollment.' })
    }

    return res.status(204).send()
  } catch (error) {
    next(error)
  }
})
