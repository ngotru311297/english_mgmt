import express from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma.js'

export const tuitionRouter = express.Router()

const tuitionSettingInputSchema = z.object({
  feePerSession: z.number().int().nonnegative(),
})

const tuitionSummaryQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
})

const tuitionPaymentInputSchema = z.object({
  studentName: z.string().trim().min(1),
  className: z.string().trim().min(1),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  paid: z.boolean(),
})

const getMonthRange = (monthText: string) => {
  const [yearStr, monthStr] = monthText.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0))
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
  return { start, end }
}

const getTuitionSetting = () =>
  prisma.tuitionSetting.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, feePerSession: 0 },
  })

tuitionRouter.get('/settings', async (_req, res, next) => {
  try {
    const setting = await getTuitionSetting()
    return res.json({ feePerSession: setting.feePerSession })
  } catch (error) {
    next(error)
  }
})

tuitionRouter.put('/settings', async (req, res, next) => {
  try {
    const payload = tuitionSettingInputSchema.parse(req.body)
    const setting = await prisma.tuitionSetting.upsert({
      where: { id: 1 },
      update: { feePerSession: payload.feePerSession },
      create: { id: 1, feePerSession: payload.feePerSession },
    })

    return res.json({ feePerSession: setting.feePerSession })
  } catch (error) {
    next(error)
  }
})

tuitionRouter.get('/summary', async (req, res, next) => {
  try {
    const query = tuitionSummaryQuerySchema.parse(req.query)
    const { start, end } = getMonthRange(query.month)

    const [setting, groups, payments] = await Promise.all([
      getTuitionSetting(),
      prisma.attendanceRecord.groupBy({
        by: ['studentName', 'className'],
        where: { status: true, date: { gte: start, lte: end } },
        _count: { _all: true },
      }),
      prisma.tuitionPayment.findMany({ where: { month: query.month } }),
    ])

    const paidByKey = new Map(payments.map((payment) => [`${payment.studentName}|${payment.className}`, payment.paid]))

    const rows = groups
      .map((group) => ({
        studentName: group.studentName,
        className: group.className,
        sessions: group._count._all,
        amount: group._count._all * setting.feePerSession,
        paid: paidByKey.get(`${group.studentName}|${group.className}`) ?? false,
      }))
      .sort((a, b) => a.className.localeCompare(b.className) || a.studentName.localeCompare(b.studentName))

    const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0)

    return res.json({ feePerSession: setting.feePerSession, rows, totalAmount })
  } catch (error) {
    next(error)
  }
})

tuitionRouter.patch('/payments', async (req, res, next) => {
  try {
    const payload = tuitionPaymentInputSchema.parse(req.body)
    const payment = await prisma.tuitionPayment.upsert({
      where: {
        studentName_className_month: {
          studentName: payload.studentName,
          className: payload.className,
          month: payload.month,
        },
      },
      update: { paid: payload.paid, paidAt: payload.paid ? new Date() : null },
      create: {
        studentName: payload.studentName,
        className: payload.className,
        month: payload.month,
        paid: payload.paid,
        paidAt: payload.paid ? new Date() : null,
      },
    })

    return res.json({
      studentName: payment.studentName,
      className: payment.className,
      month: payment.month,
      paid: payment.paid,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    })
  } catch (error) {
    next(error)
  }
})
