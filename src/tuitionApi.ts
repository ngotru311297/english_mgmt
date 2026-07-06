import { request } from './api'

export type ApiTuitionSettings = {
  feePerSession: number
}

export type ApiTuitionRow = {
  studentName: string
  className: string
  sessions: number
  amount: number
  paid: boolean
}

export type ApiTuitionSummary = {
  feePerSession: number
  rows: ApiTuitionRow[]
  totalAmount: number
}

export type ApiTuitionPayment = {
  studentName: string
  className: string
  month: string
  paid: boolean
  paidAt: string | null
}

export const tuitionApi = {
  getSettings: () => request<ApiTuitionSettings>('/api/tuition/settings'),
  updateSettings: (feePerSession: number) =>
    request<ApiTuitionSettings>('/api/tuition/settings', { method: 'PUT', body: { feePerSession } }),
  getSummary: (month: string) => request<ApiTuitionSummary>(`/api/tuition/summary?month=${encodeURIComponent(month)}`),
  updatePaymentStatus: (payload: { studentName: string; className: string; month: string; paid: boolean }) =>
    request<ApiTuitionPayment>('/api/tuition/payments', { method: 'PATCH', body: payload }),
}
