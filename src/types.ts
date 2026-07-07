import type { ApiClass, ApiStudent, ApiTeacher } from './api'

export type ClassSummary = {
  id: number
  name: string
  count: number
  schedule: string
  startTime: string
  endTime: string
  description: string
}

export type StudentSummary = {
  id: number
  name: string
  classId: number
  className: string
  phone: string
  parentName: string
  status?: 'Active' | 'Inactive'
}

export type TeacherSummary = {
  id: number
  name: string
  nickname: string
  classIds: number[]
  classNames: string[]
  phone: string
  status?: 'Active' | 'Inactive'
}

export const mapApiClassToSummary = (item: ApiClass): ClassSummary => ({
  id: item.id,
  name: item.name,
  count: item.count,
  schedule: item.schedule,
  startTime: item.startTime,
  endTime: item.endTime,
  description: item.description,
})

export const mapApiStudentToSummary = (item: ApiStudent): StudentSummary => ({
  id: item.id,
  name: item.name,
  classId: item.classId,
  className: item.className,
  phone: item.phone,
  parentName: item.parentName,
  status: item.status,
})

export const mapApiTeacherToSummary = (item: ApiTeacher): TeacherSummary => ({
  id: item.id,
  name: item.name,
  nickname: item.nickname,
  classIds: item.classIds,
  classNames: item.classNames,
  phone: item.phone,
  status: item.status,
})
