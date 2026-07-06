const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown
}

export type ApiClass = {
  id: number
  name: string
  schedule: string
  startTime: string
  endTime: string
  description: string
  count: number
}

export type ApiStudent = {
  id: number
  name: string
  classId: number
  className: string
  phone: string
  parentName: string
  status?: 'Active' | 'Inactive'
}

export type ApiTeacher = {
  id: number
  name: string
  nickname: string
  classIds: number[]
  classNames: string[]
  phone: string
  status?: 'Active' | 'Inactive'
}

export type ApiAttendanceConfirmResponse = {
  saved: number
  className: string
  date: string
}

export type ApiAttendanceReportRecord = {
  id: number
  studentName: string
  className: string
  status: boolean
  date: string
}

type ApiErrorBody = {
  message?: string
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      const payload = (await response.json()) as ApiErrorBody
      if (payload?.message) {
        message = payload.message
      }
    } catch {
      // Keep fallback message when server response is not JSON.
    }
    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export const api = {
  getClasses: () => request<ApiClass[]>('/api/classes'),
  createClass: (payload: Omit<ApiClass, 'id' | 'count'>) => request<ApiClass>('/api/classes', { method: 'POST', body: payload }),
  updateClass: (id: number, payload: Omit<ApiClass, 'id' | 'count'>) => request<ApiClass>(`/api/classes/${id}`, { method: 'PUT', body: payload }),
  deleteClass: (id: number) => request<void>(`/api/classes/${id}`, { method: 'DELETE' }),
  getStudents: () => request<ApiStudent[]>('/api/students'),
  createStudent: (payload: Pick<ApiStudent, 'name' | 'classId' | 'phone' | 'parentName'>) => request<ApiStudent>('/api/students', { method: 'POST', body: payload }),
  updateStudent: (id: number, payload: Pick<ApiStudent, 'name' | 'classId' | 'phone' | 'parentName'>) =>
    request<ApiStudent>(`/api/students/${id}`, { method: 'PUT', body: payload }),
  updateStudentStatus: (id: number, status: 'Active' | 'Inactive') =>
    request<ApiStudent>(`/api/students/${id}/status`, { method: 'PATCH', body: { status } }),
  getTeachers: () => request<ApiTeacher[]>('/api/teachers'),
  createTeacher: (payload: Pick<ApiTeacher, 'name' | 'nickname' | 'classIds' | 'phone'>) =>
    request<ApiTeacher>('/api/teachers', { method: 'POST', body: payload }),
  updateTeacher: (id: number, payload: Pick<ApiTeacher, 'name' | 'nickname' | 'classIds' | 'phone'>) =>
    request<ApiTeacher>(`/api/teachers/${id}`, { method: 'PUT', body: payload }),
  updateTeacherStatus: (id: number, status: 'Active' | 'Inactive') =>
    request<ApiTeacher>(`/api/teachers/${id}/status`, { method: 'PATCH', body: { status } }),
  confirmAttendance: (payload: { classId: number; records: Array<{ studentId: number; status: boolean }> }) =>
    request<ApiAttendanceConfirmResponse>('/api/attendance/confirm', { method: 'POST', body: payload }),
  getAttendanceDates: (className: string) =>
    request<{ dates: string[] }>(`/api/attendance/dates?className=${encodeURIComponent(className)}`),
  getAttendanceRecords: (className: string, date: string) =>
    request<{ records: ApiAttendanceReportRecord[] }>(
      `/api/attendance/records?className=${encodeURIComponent(className)}&date=${encodeURIComponent(date)}`,
    ),
  updateAttendanceRecords: (payload: { records: Array<{ id: number; status: boolean }> }) =>
    request<{ updated: number }>('/api/attendance/records', { method: 'PATCH', body: payload }),
  getAttendanceExport: (range?: { start: string; end: string }) =>
    request<{ records: ApiAttendanceReportRecord[] }>(
      range ? `/api/attendance/export?start=${encodeURIComponent(range.start)}&end=${encodeURIComponent(range.end)}` : '/api/attendance/export',
    ),
}
