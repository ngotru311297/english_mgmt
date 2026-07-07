import { useEffect, useState } from 'react'
import { api } from '../api'
import {
  mapApiClassToSummary,
  mapApiStudentToSummary,
  mapApiTeacherToSummary,
  type ClassSummary,
  type StudentSummary,
  type TeacherSummary,
} from '../types'

export function useAppData() {
  const [classes, setClasses] = useState<ClassSummary[]>([])
  const [students, setStudents] = useState<StudentSummary[]>([])
  const [teachers, setTeachers] = useState<TeacherSummary[]>([])
  const [apiError, setApiError] = useState('')
  const [isLoadingData, setIsLoadingData] = useState(true)

  const loadClasses = async () => {
    const classItems = await api.getClasses()
    setClasses(classItems.map(mapApiClassToSummary))
  }

  const loadStudents = async () => {
    const studentItems = await api.getStudents()
    setStudents(studentItems.map(mapApiStudentToSummary))
  }

  const loadTeachers = async () => {
    const teacherItems = await api.getTeachers()
    setTeachers(teacherItems.map(mapApiTeacherToSummary))
  }

  useEffect(() => {
    const initializeData = async () => {
      setIsLoadingData(true)
      setApiError('')
      try {
        await Promise.all([loadClasses(), loadStudents(), loadTeachers()])
      } catch (error) {
        setApiError(error instanceof Error ? error.message : 'Không thể tải dữ liệu từ backend.')
      } finally {
        setIsLoadingData(false)
      }
    }

    void initializeData()
  }, [])

  return {
    classes,
    students,
    teachers,
    apiError,
    isLoadingData,
    setApiError,
    loadClasses,
    loadStudents,
    loadTeachers,
  }
}
