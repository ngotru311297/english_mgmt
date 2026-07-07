import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import './App.css'
import bannerImage from './Banner.png'
import logoImage from './LOGO.png'
import { hasScheduleConflict, isValidTimeRange } from './classScheduleUtils'
import { api, type ApiAttendanceReportRecord } from './api'
import { extractScheduleDays, getScheduleBounds, parseScheduleBlocks, serializeScheduleBlocks, toMinutes } from './classScheduleUtils'
import * as XLSX from 'xlsx'
import TuitionSection from './TuitionSection'
import TeachersSection from './TeachersSection'
import StudentsSection from './StudentsSection'
import { useAppData } from './hooks/useAppData'
import type { ClassSummary } from './types'
import { currentClassYear, normalizeClassName, stripClassYearPrefix } from './classNameUtils'

type Section = 'Tổng quan' | 'Lớp học' | 'Học viên' | 'Giáo Viên' | 'Học Phí' | 'Cài đặt'

type ScheduleBlock = {
  day: string
  startTime: string
  endTime: string
}

type AttendanceReportRow = {
  id: number
  studentName: string
  className: string
  status: boolean
  date: string
}

const classAccentColors = ['#4f46e5', '#0f766e', '#dc2626', '#7c3aed', '#db2777']
const escapeXmlValue = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

function App() {
  const [activeSection, setActiveSection] = useState<Section>('Tổng quan')
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null)
  const [classForm, setClassForm] = useState<{ name: string; scheduleBlocks: ScheduleBlock[]; description: string }>({
    name: '',
    scheduleBlocks: [],
    description: '',
  })
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [manageView, setManageView] = useState<'menu' | 'classes' | 'students' | 'attendance' | 'reports'>('menu')
  const [attendanceMakeupMode, setAttendanceMakeupMode] = useState(false)
  const [selectedAttendanceClassId, setSelectedAttendanceClassId] = useState<number | null>(null)
  const [selectedAttendanceStudentIds, setSelectedAttendanceStudentIds] = useState<number[]>([])
  const [attendanceStatusByClass, setAttendanceStatusByClass] = useState<Record<number, Record<number, 'present' | 'absent'>>>({})
  const [attendanceConfirming, setAttendanceConfirming] = useState(false)
  const [attendanceConfirmMessage, setAttendanceConfirmMessage] = useState('')
  const [attendanceConfirmError, setAttendanceConfirmError] = useState('')
  const [showAttendanceConfirmModal, setShowAttendanceConfirmModal] = useState(false)
  const [attendanceLockChecking, setAttendanceLockChecking] = useState(false)
  const [attendanceLockedByConfirmed, setAttendanceLockedByConfirmed] = useState(false)
  const [reportClassId, setReportClassId] = useState<number | null>(null)
  const [reportDate, setReportDate] = useState('')
  const [reportDates, setReportDates] = useState<string[]>([])
  const [reportRows, setReportRows] = useState<AttendanceReportRow[]>([])
  const [reportLoadingDates, setReportLoadingDates] = useState(false)
  const [reportLoadingRows, setReportLoadingRows] = useState(false)
  const [reportSaving, setReportSaving] = useState(false)
  const [reportExporting, setReportExporting] = useState(false)
  const [reportExportStart, setReportExportStart] = useState('')
  const [reportExportEnd, setReportExportEnd] = useState('')
  const [reportMessage, setReportMessage] = useState('')
  const [reportError, setReportError] = useState('')
  const [reportEditMode, setReportEditMode] = useState(false)
  const [showReportConfirmModal, setShowReportConfirmModal] = useState(false)
  const [showClassForm, setShowClassForm] = useState(false)
  const [showUpdateConflictModal, setShowUpdateConflictModal] = useState(false)
  const [showClassNameRequiredModal, setShowClassNameRequiredModal] = useState(false)
  const [classToDelete, setClassToDelete] = useState<ClassSummary | null>(null)
  const [deleteClassNameInput, setDeleteClassNameInput] = useState('')
  const [scheduleDayToRemove, setScheduleDayToRemove] = useState<string | null>(null)
  const [lastSelectedScheduleDay, setLastSelectedScheduleDay] = useState<string | null>(null)
  const { classes, students, teachers, apiError, isLoadingData, setApiError, loadClasses, loadStudents, loadTeachers } = useAppData()
  const classItemRefs = useRef<Record<number, HTMLLIElement | null>>({})

  const selectedClassInfo = selectedClassId ? classes.find((cls) => cls.id === selectedClassId) ?? null : null
  const availableClassOptions = useMemo(() => classes.slice().sort((a, b) => a.name.localeCompare(b.name)), [classes])

  const reportClassName = useMemo(
    () => (reportClassId ? availableClassOptions.find((item) => item.id === reportClassId)?.name ?? '' : ''),
    [availableClassOptions, reportClassId],
  )
  const reportPresentCount = useMemo(() => reportRows.filter((row) => row.status).length, [reportRows])

  const todayWeekDay = useMemo(() => {
    const dayNumber = new Date().getDay()
    return dayNumber === 0 ? 'CN' : `Thứ ${dayNumber + 1}`
  }, [])
  const todayDateText = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const attendanceClassesToday = useMemo(
    () => availableClassOptions.filter((cls) => extractScheduleDays(cls.schedule).includes(todayWeekDay)),
    [availableClassOptions, todayWeekDay],
  )

  const attendanceClassOptions = attendanceMakeupMode ? availableClassOptions : attendanceClassesToday

  const attendanceStudents = useMemo(() => {
    if (!selectedAttendanceClassId) return []

    return students
      .filter((student) => student.classId === selectedAttendanceClassId && student.status !== 'Inactive')
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [selectedAttendanceClassId, students])

  const attendanceStatusForSelectedClass = selectedAttendanceClassId ? attendanceStatusByClass[selectedAttendanceClassId] ?? {} : {}
  const allAttendanceStudentsSelected = attendanceStudents.length > 0 && selectedAttendanceStudentIds.length === attendanceStudents.length
  const selectedAttendanceClassName = useMemo(
    () => (selectedAttendanceClassId ? classes.find((item) => item.id === selectedAttendanceClassId)?.name ?? '' : ''),
    [classes, selectedAttendanceClassId],
  )

  const createDefaultScheduleBlock = (day: string): ScheduleBlock => ({
    day,
    startTime: '17:00',
    endTime: '18:00',
  })

  const openClassManagement = () => {
    resetClassForm()
    closeDeleteClassModal()
    setShowUpdateConflictModal(false)
    setShowClassNameRequiredModal(false)
    setScheduleDayToRemove(null)
    setManageView('classes')
  }

  useEffect(() => {
    if (selectedClassId === null) return

    const classExists = classes.some((item) => item.id === selectedClassId)
    if (!classExists) {
      setSelectedClassId(null)
    }
  }, [classes, selectedClassId])

  useEffect(() => {
    if (selectedAttendanceClassId === null) return

    const classExists = attendanceClassOptions.some((item) => item.id === selectedAttendanceClassId)
    if (!classExists) {
      setSelectedAttendanceClassId(null)
      setSelectedAttendanceStudentIds([])
    }
  }, [attendanceClassOptions, selectedAttendanceClassId])

  useEffect(() => {
    setSelectedAttendanceStudentIds((previousIds) => previousIds.filter((id) => attendanceStudents.some((student) => student.id === id)))
  }, [attendanceStudents])

  useEffect(() => {
    if (!selectedAttendanceClassName) {
      setAttendanceLockedByConfirmed(false)
      setAttendanceLockChecking(false)
      return
    }

    const checkAttendanceLock = async () => {
      setAttendanceLockChecking(true)
      try {
        const result = await api.getAttendanceRecords(selectedAttendanceClassName, todayDateText)
        setAttendanceLockedByConfirmed(result.records.length > 0)
      } catch {
        setAttendanceLockedByConfirmed(false)
      } finally {
        setAttendanceLockChecking(false)
      }
    }

    void checkAttendanceLock()
  }, [selectedAttendanceClassName, todayDateText])

  useEffect(() => {
    if (!reportClassName) {
      setReportDates([])
      setReportDate('')
      setReportRows([])
      return
    }

    void loadReportDates(reportClassName)
  }, [reportClassName])

  useEffect(() => {
    if (!reportClassName || !reportDate) {
      setReportRows([])
      return
    }

    void loadReportRows(reportClassName, reportDate)
  }, [reportClassName, reportDate])

  const normalizeTimeValue = (value: string) => {
    const trimmed = value.trim().toLowerCase()
    if (!trimmed) return ''

    const compact = trimmed.replace(/\s+/g, ' ')
    const match24 = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(compact)
    if (match24) {
      const hour = Number(match24[1])
      const minute = match24[2] ? Number(match24[2]) : 0
      if (hour > 23 || minute > 59) return ''
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    }

    const match12 = /^(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)$/.exec(compact)
    if (match12) {
      let hour = Number(match12[1])
      const minute = match12[2] ? Number(match12[2]) : 0
      const meridiem = match12[3]
      if (hour > 12 || minute > 59) return ''
      if (meridiem === 'pm' && hour < 12) hour += 12
      if (meridiem === 'am' && hour === 12) hour = 0
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    }

    return ''
  }

  const formatTimeRange = (start: string, end: string) => {
    const normalizedStart = normalizeTimeValue(start)
    const normalizedEnd = normalizeTimeValue(end)
    if (!normalizedStart || !normalizedEnd) return `${start} – ${end}`
    return `${normalizedStart} – ${normalizedEnd}`
  }

  const resetClassForm = () => {
    setClassForm({ name: '', scheduleBlocks: [], description: '' })
    setEditingIndex(null)
    setShowClassForm(false)
    setShowClassNameRequiredModal(false)
    setLastSelectedScheduleDay(null)
    setScheduleDayToRemove(null)
  }

  const submitClass = async () => {
    const trimmedName = classForm.name.trim()
    const normalizedScheduleBlocks = classForm.scheduleBlocks
      .map((block) => ({
        day: block.day.trim(),
        startTime: normalizeTimeValue(block.startTime),
        endTime: normalizeTimeValue(block.endTime),
      }))
      .filter((block) => Boolean(block.day) && Boolean(block.startTime) && Boolean(block.endTime))
    const hasInvalidBlock = normalizedScheduleBlocks.some((block) => !isValidTimeRange(block.startTime, block.endTime))
    const scheduleText = serializeScheduleBlocks(normalizedScheduleBlocks)
    const scheduleBounds = getScheduleBounds(normalizedScheduleBlocks)

    if (!trimmedName) {
      setShowClassNameRequiredModal(true)
      return
    }

    if (normalizedScheduleBlocks.length === 0 || !classForm.description.trim()) {
      return
    }

    if (hasInvalidBlock || !scheduleBounds.startTime || !scheduleBounds.endTime) {
      return
    }

    const normalizedName = normalizeClassName(trimmedName)
    const editingClass = editingIndex !== null ? classes[editingIndex] ?? null : null

    if (classes.some((item) => item.name.toLowerCase() === normalizedName.toLowerCase() && item.id !== editingClass?.id)) {
      setApiError('Tên lớp đã tồn tại. Hãy chọn tên khác.')
      return
    }

    const candidateClass = {
      name: normalizedName,
      schedule: scheduleText,
      startTime: scheduleBounds.startTime,
      endTime: scheduleBounds.endTime,
      description: classForm.description.trim(),
    }

    if (hasScheduleConflict(candidateClass, classes, editingIndex ?? null)) {
      if (editingIndex !== null) {
        setShowUpdateConflictModal(true)
      }
      return
    }

    setApiError('')
    try {
      if (editingIndex !== null) {
        if (!editingClass) return
        await api.updateClass(editingClass.id, candidateClass)
      } else {
        await api.createClass(candidateClass)
      }

      await loadClasses()
      resetClassForm()
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể lưu lớp học.'
      setApiError(message)
      if (message.toLowerCase().includes('trung') && editingIndex !== null) {
        setShowUpdateConflictModal(true)
      }
    }
  }

  const editClass = (index: number) => {
    const item = classes[index]
    const parsedBlocks = parseScheduleBlocks(item.schedule, item.startTime, item.endTime)
    setClassForm({
      name: stripClassYearPrefix(item.name),
      scheduleBlocks: parsedBlocks.length > 0 ? parsedBlocks : extractScheduleDays(item.schedule).map((day) => createDefaultScheduleBlock(day)),
      description: item.description,
    })
    setLastSelectedScheduleDay(null)
    setEditingIndex(index)
    setShowClassForm(false)

    requestAnimationFrame(() => {
      classItemRefs.current[index]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'start',
      })
    })
  }

  const openDeleteClassModal = (index: number) => {
    const targetClass = classes[index]
    if (!targetClass) return

    setDeleteClassNameInput('')
    setClassToDelete(targetClass)
  }

  const closeDeleteClassModal = () => {
    setClassToDelete(null)
    setDeleteClassNameInput('')
  }

  const confirmDeleteClass = async () => {
    if (!classToDelete) return

    const typedName = deleteClassNameInput.trim().toLowerCase()
    const expectedName = classToDelete.name.trim().toLowerCase()

    if (typedName !== expectedName) {
      setApiError('Tên lớp nhập lại chưa khớp.')
      return
    }

    setApiError('')
    try {
      await api.deleteClass(classToDelete.id)
      await loadClasses()
      if (editingIndex !== null && classes[editingIndex]?.id === classToDelete.id) {
        resetClassForm()
      }
      closeDeleteClassModal()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Không thể xóa lớp học.')
    }
  }

  const maxClassCount = Math.max(...classes.map((item) => item.count), 1)
  const chartLevels = [
    maxClassCount,
    Math.ceil(maxClassCount * 0.75),
    Math.ceil(maxClassCount * 0.5),
    Math.ceil(maxClassCount * 0.25),
    0,
  ]

  const weekDays = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN']
  const hourOptions = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'))
  const minuteOptions = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))

  const getClassesForDay = (day: string) => {
    return classes
      .filter((cls) => extractScheduleDays(cls.schedule).includes(day))
      .sort((a, b) => {
        const aBlocks = getScheduleBlocksForDay(a.schedule, a.startTime, a.endTime, day)
        const bBlocks = getScheduleBlocksForDay(b.schedule, b.startTime, b.endTime, day)

        const aStart = aBlocks.length > 0 ? toMinutes(aBlocks[0].startTime) : toMinutes(a.startTime)
        const bStart = bBlocks.length > 0 ? toMinutes(bBlocks[0].startTime) : toMinutes(b.startTime)

        return aStart - bStart
      })
  }

  const getScheduleBlocksForDay = (schedule: string, startTime: string, endTime: string, day: string) => {
    return parseScheduleBlocks(schedule, startTime, endTime).filter((block) => block.day === day)
  }

  const formatScheduleBlocksForDay = (cls: ClassSummary, day: string) => {
    const scheduleBlocks = getScheduleBlocksForDay(cls.schedule, cls.startTime, cls.endTime, day)

    if (scheduleBlocks.length === 0) {
      return [formatTimeRange(cls.startTime, cls.endTime)]
    }

    return scheduleBlocks.map((block) => formatTimeRange(block.startTime, block.endTime))
  }

  const getTeacherNicknamesForClass = (classId: number) => {
    const teacherNicknames = teachers
      .filter((teacher) => teacher.classIds.includes(classId) && teacher.status !== 'Inactive')
      .map((teacher) => teacher.nickname)

    return teacherNicknames.length > 0 ? teacherNicknames.join(', ') : 'Chưa gán'
  }

  const toggleAttendanceStudentSelection = (studentId: number) => {
    setSelectedAttendanceStudentIds((previousIds) =>
      previousIds.includes(studentId) ? previousIds.filter((id) => id !== studentId) : [...previousIds, studentId],
    )
  }

  const toggleSelectAllAttendanceStudents = (checked: boolean) => {
    setSelectedAttendanceStudentIds(checked ? attendanceStudents.map((student) => student.id) : [])
  }

  const setAttendanceStatusForSelectedStudents = (status: 'present' | 'absent') => {
    if (!selectedAttendanceClassId || selectedAttendanceStudentIds.length === 0) return

    setAttendanceStatusByClass((previousValue) => {
      const classStatuses = { ...(previousValue[selectedAttendanceClassId] ?? {}) }

      selectedAttendanceStudentIds.forEach((studentId) => {
        classStatuses[studentId] = status
      })

      return {
        ...previousValue,
        [selectedAttendanceClassId]: classStatuses,
      }
    })
  }

  const setAttendanceStatusForStudent = (studentId: number, status: 'present' | 'absent') => {
    if (!selectedAttendanceClassId) return

    setAttendanceStatusByClass((previousValue) => ({
      ...previousValue,
      [selectedAttendanceClassId]: {
        ...(previousValue[selectedAttendanceClassId] ?? {}),
        [studentId]: status,
      },
    }))
  }

  const mapApiAttendanceReportRow = (row: ApiAttendanceReportRecord): AttendanceReportRow => ({
    id: row.id,
    studentName: row.studentName,
    className: row.className,
    status: row.status,
    date: row.date,
  })

  const loadReportDates = async (className: string) => {
    setReportLoadingDates(true)
    setReportError('')
    setReportMessage('')
    setReportEditMode(false)
    try {
      const result = await api.getAttendanceDates(className)
      setReportDates(result.dates)
      setReportDate(result.dates[0] ?? '')
      setReportRows([])
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Không thể tải ngày điểm danh.')
      setReportDates([])
      setReportDate('')
      setReportRows([])
    } finally {
      setReportLoadingDates(false)
    }
  }

  const loadReportRows = async (className: string, date: string) => {
    setReportLoadingRows(true)
    setReportError('')
    setReportMessage('')
    setReportEditMode(false)
    try {
      const result = await api.getAttendanceRecords(className, date)
      setReportRows(result.records.map(mapApiAttendanceReportRow))
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Không thể tải dữ liệu điểm danh.')
      setReportRows([])
    } finally {
      setReportLoadingRows(false)
    }
  }

  const updateReportRowStatus = (rowId: number, status: boolean) => {
    if (!reportEditMode) return
    setReportRows((previousRows) => previousRows.map((row) => (row.id === rowId ? { ...row, status } : row)))
  }

  const confirmUpdateReportRows = async () => {
    if (reportRows.length === 0) return

    setReportSaving(true)
    setReportError('')
    setReportMessage('')

    try {
      const payload = {
        records: reportRows.map((row) => ({ id: row.id, status: row.status })),
      }
      const result = await api.updateAttendanceRecords(payload)
      setReportMessage(`Đã cập nhật ${result.updated} dòng điểm danh.`)
      setReportEditMode(false)
      setShowReportConfirmModal(false)
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Không thể cập nhật điểm danh.')
      setShowReportConfirmModal(false)
    } finally {
      setReportSaving(false)
    }
  }

  const exportAttendanceRecords = async (range?: { start: string; end: string }) => {
    setReportExporting(true)
    setReportError('')
    setReportMessage('')

    try {
      const result = await api.getAttendanceExport(range)

      if (result.records.length === 0) {
        setReportError('Chưa có dữ liệu điểm danh để export.')
        return
      }

      const rows = [
        ['Tên', 'Lớp học', 'Trạng thái', 'Ngày'],
        ...result.records.map((record) => [record.studentName, record.className, record.status, record.date.slice(0, 10)]),
      ]

      const worksheet = XLSX.utils.aoa_to_sheet(rows)
      worksheet['!cols'] = [{ wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 14 }]
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'AttendanceRecord')
      const fileName = range
        ? `attendance-record-${range.start}_${range.end}.xlsx`
        : `attendance-record-${new Date().toISOString().slice(0, 10)}.xlsx`
      XLSX.writeFile(workbook, fileName)
      setReportMessage(`Đã export ${result.records.length} dòng điểm danh.`)
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Không thể export dữ liệu điểm danh.')
    } finally {
      setReportExporting(false)
    }
  }

  const exportAttendanceRecordsByRange = async () => {
    if (!reportExportStart || !reportExportEnd) {
      setReportError('Vui lòng chọn cả ngày bắt đầu và ngày kết thúc.')
      return
    }
    if (reportExportStart > reportExportEnd) {
      setReportError('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc.')
      return
    }

    await exportAttendanceRecords({ start: reportExportStart, end: reportExportEnd })
  }

  const confirmAttendance = async () => {
    if (!selectedAttendanceClassId || attendanceStudents.length === 0) return
    if (attendanceLockedByConfirmed) {
      setAttendanceConfirmError('Lớp này đã confirm điểm danh hôm nay. Vui lòng sang Báo cáo nhanh để chỉnh sửa.')
      return
    }

    setAttendanceConfirmMessage('')
    setAttendanceConfirmError('')
    setAttendanceConfirming(true)

    try {
      const records = attendanceStudents.map((student) => ({
        studentId: student.id,
        status: attendanceStatusForSelectedClass[student.id] === 'present',
      }))

      const result = await api.confirmAttendance({
        classId: selectedAttendanceClassId,
        records,
      })

      setAttendanceConfirmMessage(`Đã lưu điểm danh ${result.saved} học viên cho lớp ${result.className}.`)
      setAttendanceLockedByConfirmed(true)
      setSelectedAttendanceStudentIds([])
      setAttendanceStatusByClass((previousValue) => ({
        ...previousValue,
        [selectedAttendanceClassId]: {},
      }))
    } catch (error) {
      setAttendanceConfirmError(error instanceof Error ? error.message : 'Không thể lưu điểm danh.')
    } finally {
      setAttendanceConfirming(false)
    }
  }

  const toggleScheduleDay = (day: string) => {
    const selectedDays = classForm.scheduleBlocks.map((block) => block.day)

    if (selectedDays.includes(day)) {
      setScheduleDayToRemove(day)
      return
    }

    setClassForm((prev) => ({
      ...prev,
      scheduleBlocks: [...prev.scheduleBlocks, createDefaultScheduleBlock(day)],
    }))

    setLastSelectedScheduleDay(day)
  }

  const closeUpdateConflictModal = () => {
    setShowUpdateConflictModal(false)

    if (!lastSelectedScheduleDay) return

    const selectedDays = classForm.scheduleBlocks.map((block) => block.day)
    if (!selectedDays.includes(lastSelectedScheduleDay)) return

    setClassForm((prev) => ({
      ...prev,
      scheduleBlocks: prev.scheduleBlocks.filter((block) => block.day !== lastSelectedScheduleDay),
    }))
    setLastSelectedScheduleDay(null)
  }

  const closeScheduleDayRemoveModal = () => {
    setScheduleDayToRemove(null)
  }

  const confirmScheduleDayRemove = () => {
    if (!scheduleDayToRemove) return

    setClassForm((prev) => ({
      ...prev,
      scheduleBlocks: prev.scheduleBlocks.filter((block) => block.day !== scheduleDayToRemove),
    }))
    setLastSelectedScheduleDay(scheduleDayToRemove)
    setScheduleDayToRemove(null)
  }

  const getScheduleBlockTimePart = (block: ScheduleBlock, field: 'startTime' | 'endTime', part: 'hour' | 'minute') => {
    const normalizedValue = normalizeTimeValue(block[field])
    if (!normalizedValue) {
      return part === 'hour' ? '00' : '00'
    }

    const [hour, minute] = normalizedValue.split(':')
    return part === 'hour' ? hour : minute
  }

  const updateScheduleBlockTime = (day: string, field: 'startTime' | 'endTime', part: 'hour' | 'minute', partValue: string) => {
    setClassForm((prev) => ({
      ...prev,
      scheduleBlocks: prev.scheduleBlocks.map((block) => {
        if (block.day !== day) return block

        const normalizedValue = normalizeTimeValue(block[field])
        const [currentHour = '00', currentMinute = '00'] = normalizedValue ? normalizedValue.split(':') : ['00', '00']
        const nextHour = part === 'hour' ? partValue : currentHour
        const nextMinute = part === 'minute' ? partValue : currentMinute

        return {
          ...block,
          [field]: `${nextHour}:${nextMinute}`,
        }
      }),
    }))
  }

  const removeScheduleBlock = (day: string) => {
    setScheduleDayToRemove(day)
  }

  const selectedScheduleDays = classForm.scheduleBlocks.map((block) => block.day)
  const selectedScheduleText = serializeScheduleBlocks(classForm.scheduleBlocks)
  const scheduleBounds = getScheduleBounds(classForm.scheduleBlocks)
  const scheduleConflictError = selectedScheduleText
    ? hasScheduleConflict(
        {
          schedule: selectedScheduleText,
          startTime: scheduleBounds.startTime,
          endTime: scheduleBounds.endTime,
        },
        classes,
        editingIndex ?? null,
      )
      ? 'Lịch học này trùng khung giờ với lớp khác trong cùng ngày.'
      : ''
    : ''

  return (
    <div className="app">
      <aside className="sidebar">
        <button
          className="brand"
          type="button"
          onClick={() => {
            setActiveSection('Tổng quan')
            setManageView('menu')
            setSelectedClassId(null)
            setShowClassForm(false)
          }}
        >
          <img className="brand-mark" src={logoImage} alt="Logo English H&H" />
          <div>
            <h1>English H&H</h1>
          </div>
        </button>

        <nav className="sidebar-nav">
          {(['Tổng quan', 'Lớp học', 'Học viên', 'Giáo Viên', 'Học Phí', 'Cài đặt'] as Section[]).map((item) => (
            <button
              key={item}
              className={`nav-item ${activeSection === item ? 'active' : ''}`}
              type="button"
              onClick={() => {
                setActiveSection(item)
                if (item === 'Lớp học') {
                  setManageView('menu')
                }
              }}
            >
              <span className="nav-icon">
                {item === 'Tổng quan' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 13h8V3H3v10z" />
                    <path d="M13 21h8V11h-8v10z" />
                    <path d="M3 21h8v-6H3v6z" />
                  </svg>
                ) : item === 'Lớp học' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16" />
                    <path d="M4 12h10" />
                    <path d="M4 17h7" />
                    <path d="M20 5v14" />
                  </svg>
                ) : item === 'Học viên' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ) : item === 'Giáo Viên' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="9" cy="7" r="4" />
                    <path d="M3 21v-1a6 6 0 0 1 12 0v1" />
                    <path d="M16 11h5" />
                    <path d="M18.5 8.5v5" />
                  </svg>
                ) : item === 'Học Phí' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v10" />
                    <path d="M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5 1.3 2 3 2.5 3 1.1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l0 0a2 2 0 1 1-2.83 2.83l0 0A1.65 1.65 0 0 0 15 19.4a1.65 1.65 0 0 0-1.82.33l0 0a2 2 0 1 1-2.83-2.83l0 0A1.65 1.65 0 0 0 8.6 15a1.65 1.65 0 0 0-.33-1.82l0 0a2 2 0 1 1 2.83-2.83l0 0A1.65 1.65 0 0 0 9 8.6a1.65 1.65 0 0 0 1.82-.33l0 0a2 2 0 1 1 2.83 2.83l0 0A1.65 1.65 0 0 0 15 8.6" />
                  </svg>
                )}
              </span>
              {item}
            </button>
          ))}
        </nav>

      </aside>

      <main className="content">
        <section className="content-header overview-banner-card">
          <div className="content-header-text">
            <h2>{activeSection === 'Tổng quan' ? 'Tổng quan' : activeSection}</h2>
            <p>
              {activeSection === 'Tổng quan'
                ? 'Xem tổng quan các lớp học và số lượng học viên theo từng lớp.'
                : activeSection === 'Lớp học'
                ? 'Quản lý lớp học, học viên, điểm danh và báo cáo.'
                : activeSection === 'Học viên'
                ? 'Quản lý danh sách học viên hiện tại.'
                : activeSection === 'Giáo Viên'
                ? 'Quản lý danh sách giáo viên và thông tin giảng dạy.'
                : activeSection === 'Học Phí'
                ? 'Tính học phí theo tháng dựa trên số buổi điểm danh có mặt.'
                : 'Cấu hình cài đặt và thông tin ứng dụng.'}
            </p>
          </div>
        </section>

        {apiError ? <p className="api-error-banner">{apiError}</p> : null}

        {activeSection === 'Tổng quan' ? (
          <>
            <div className="overview-grid">
              <section className="card class-summary-card">
              <div className="card-header">
                <h3>Danh sách lớp</h3>
              </div>
              <ul className="class-list">
                {classes.map((cls, index) => {
                  const accentColor = classAccentColors[index % classAccentColors.length]
                  return (
                    <li
                      key={cls.id}
                      className={`class-item ${selectedClassId === cls.id ? 'selected' : ''}`}
                      onClick={() => setSelectedClassId(cls.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          setSelectedClassId(cls.id)
                        }
                      }}
                      style={{ '--class-accent': accentColor } as CSSProperties}
                    >
                      <div className="class-card-main">
                        <div className="class-overview-content">
                          <span className="class-name">{cls.name}</span>
                          <span className="class-meta">Số học viên</span>
                          <span className="class-days-overview">
                            <span className="pill-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" />
                                <path d="M16 2v4" />
                                <path d="M8 2v4" />
                                <path d="M3 10h18" />
                              </svg>
                            </span>
                            {cls.schedule}
                          </span>
                          <span className="class-time-range-overview">
                            <span className="pill-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 7v5l3 2" />
                              </svg>
                            </span>
                            {formatTimeRange(cls.startTime, cls.endTime)}
                          </span>
                        </div>
                        <span className="class-count-badge">{cls.count}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>

              <div className="overview-right-stack">
                <section className="card weekly-schedule-card">
                  <div className="card-header">
                    <h3>Lịch học trong tuần</h3>
                  </div>
                  <div className="weekly-schedule-grid">
                    {weekDays.map((day) => {
                      const dayClasses = getClassesForDay(day)
                      return (
                        <div key={day} className="weekly-day-card">
                          <h4>{day}</h4>
                          {dayClasses.length > 0 ? (
                            <ul className="weekly-class-list">
                              {dayClasses.map((cls) => {
                                const classIndex = classes.findIndex((item) => item.id === cls.id)
                                const accentColor = classAccentColors[(classIndex >= 0 ? classIndex : 0) % classAccentColors.length]
                                const scheduleRanges = formatScheduleBlocksForDay(cls, day)

                                return (
                                  <li key={cls.id} className="weekly-class-item" style={{ '--class-accent': accentColor } as CSSProperties}>
                                    <div className="weekly-class-item-header">
                                      <span className="weekly-class-name">{cls.name}</span>
                                    </div>
                                    <span className="weekly-class-teacher">GV: {getTeacherNicknamesForClass(cls.id)}</span>
                                    <div className="weekly-class-time-list">
                                      {scheduleRanges.map((range) => (
                                        <span key={range} className="weekly-class-time-pill">
                                          {range}
                                        </span>
                                      ))}
                                    </div>
                                  </li>
                                )
                              })}
                            </ul>
                          ) : (
                            <p className="empty-day">Không có lớp trong ngày này</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>

                <section className="card chart-card">
                  <div className="card-header">
                    <h3>{selectedClassInfo ? `Chi tiết ${selectedClassInfo.name}` : 'Biểu đồ số lượng học viên'}</h3>
                  </div>
                  {selectedClassInfo ? (
                    <div className="class-detail-panel">
                      <h4>{selectedClassInfo.name}</h4>
                      <p>
                        Lớp đang có <strong>{selectedClassInfo.count}</strong> học viên.
                      </p>
                      <p>Một số thông tin chi tiết về lớp sẽ hiển thị ở đây khi bạn chọn lớp.</p>
                      <button className="clear-selection" type="button" onClick={() => setSelectedClassId(null)}>
                        Quay lại biểu đồ
                      </button>
                    </div>
                  ) : (
                    <div className="chart-visual">
                      <div className="chart-bars">
                        {classes.map((cls, index) => {
                          const barHeight = maxClassCount > 0 ? (cls.count / maxClassCount) * 100 : 0
                          const accentColor = classAccentColors[index % classAccentColors.length]
                          return (
                            <div key={cls.id} className="chart-column">
                              <div
                                className="chart-bar"
                                style={{
                                  height: `${barHeight}%`,
                                  minHeight: cls.count > 0 ? '48px' : '0px',
                                  background: `linear-gradient(180deg, ${accentColor} 0%, #818cf8 100%)`,
                                }}
                              >
                                <span className="chart-value">{cls.count}</span>
                              </div>
                              <div className="chart-name">{cls.name}</div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </>
        ) : activeSection === 'Lớp học' ? (
          <section className="card manage-card">
            {manageView === 'menu' ? (
              <div className="manage-grid">
                <div className="manage-item manage-action-card" onClick={openClassManagement}>
                  <h4>Quản lý lớp</h4>
                  <p>Thêm, sửa, xóa và cấu hình lớp học.</p>
                  <span className="manage-action-link">Xem giao diện quản lý lớp</span>
                </div>
                <div className="manage-item manage-action-card" onClick={() => setManageView('students')}>
                  <h4>Quản lý học viên</h4>
                    <p>Quản lý danh sách học viên và thông tin.</p>
                  <span className="manage-action-link">Xem giao diện quản lý học viên</span>
                </div>
                  <div className="manage-item manage-action-card" onClick={() => setManageView('attendance')}>
                    <h4>Điểm danh</h4>
                    <p>Theo dõi tình trạng có mặt của học viên theo lớp và buổi học.</p>
                    <span className="manage-action-link">Mở giao diện điểm danh</span>
                  </div>
                <div className="manage-item manage-action-card" onClick={() => setManageView('reports')}>
                  <h4>Báo cáo nhanh</h4>
                  <p>Xem thống kê tổng quan lớp và học viên.</p>
                  <span className="manage-action-link">Xem giao diện báo cáo</span>
                </div>
              </div>
            ) : manageView === 'classes' ? (
              <div className="manage-detail">
                <button type="button" className="back-button" onClick={() => setManageView('menu')}>
                  <span aria-hidden="true">←</span>
                  Quay lại
                </button>
                <h3>Quản lý lớp</h3>
                <p>Thêm, sửa, xóa lớp học với tên lớp, lịch học và mô tả chi tiết.</p>

                <div className="class-section">
                  <div className="manage-section-header">
                    <h4 className="section-subtitle">Danh sách lớp hiện có</h4>
                    <button
                      type="button"
                      className="add-class-button"
                      onClick={() => {
                        setClassForm({ name: '', scheduleBlocks: [], description: '' })
                        setEditingIndex(null)
                        setShowClassForm(true)
                      }}
                    >
                      + Thêm lớp
                    </button>
                  </div>

                  {showClassForm && (
                    <div className="class-form-card">
                      <div className="manage-section-header">
                        <h4>Thêm lớp mới</h4>
                        <button type="button" className="button-secondary" onClick={resetClassForm}>
                          Đóng
                        </button>
                      </div>
                      <div className="class-form">
                        <label>
                          Tên lớp ({currentClassYear}_...)
                          <input
                            value={classForm.name}
                            onChange={(e) => setClassForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="Ví dụ: 3A hoặc 3B"
                          />
                          <span className="field-help">Hệ thống sẽ tự thêm tiền tố {currentClassYear}_ vào tên lớp.</span>
                        </label>
                        <label>
                          Lịch học
                          <div className="schedule-picker" role="group" aria-label="Chọn lịch học">
                            {weekDays.map((day) => (
                              <button
                                key={day}
                                type="button"
                                className={`schedule-day-btn ${selectedScheduleDays.includes(day) ? 'active' : ''}`}
                                onClick={() => toggleScheduleDay(day)}
                              >
                                {day}
                              </button>
                            ))}
                          </div>
                          <span className={`field-help selected-days-summary ${selectedScheduleDays.length > 0 ? 'active' : ''}`}>
                            Đã chọn: {selectedScheduleDays.length > 0 ? selectedScheduleDays.join(', ') : 'Chưa chọn ngày nào'}
                          </span>
                          <span className="field-help">Mỗi ngày được chọn sẽ có khung giờ riêng.</span>
                          {scheduleConflictError ? <span className="field-help field-help--error">{scheduleConflictError}</span> : null}
                        </label>
                        <div className="schedule-block-list">
                          {classForm.scheduleBlocks.map((block) => (
                            <div key={block.day} className="schedule-block-row">
                              <div className="schedule-block-day">
                                <strong>{block.day}</strong>
                                <button type="button" className="button-secondary" onClick={() => removeScheduleBlock(block.day)}>
                                  Bỏ ngày
                                </button>
                              </div>
                              <div className="time-range-row">
                                <label>
                                  Giờ bắt đầu
                                  <div className="time-select-row">
                                    <select
                                      value={getScheduleBlockTimePart(block, 'startTime', 'hour')}
                                      onChange={(e) => updateScheduleBlockTime(block.day, 'startTime', 'hour', e.target.value)}
                                    >
                                      {hourOptions.map((hour) => (
                                        <option key={hour} value={hour}>
                                          {hour}
                                        </option>
                                      ))}
                                    </select>
                                    <span>:</span>
                                    <select
                                      value={getScheduleBlockTimePart(block, 'startTime', 'minute')}
                                      onChange={(e) => updateScheduleBlockTime(block.day, 'startTime', 'minute', e.target.value)}
                                    >
                                      {minuteOptions.map((minute) => (
                                        <option key={minute} value={minute}>
                                          {minute}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </label>
                                <label>
                                  Giờ kết thúc
                                  <div className="time-select-row">
                                    <select
                                      value={getScheduleBlockTimePart(block, 'endTime', 'hour')}
                                      onChange={(e) => updateScheduleBlockTime(block.day, 'endTime', 'hour', e.target.value)}
                                    >
                                      {hourOptions.map((hour) => (
                                        <option key={hour} value={hour}>
                                          {hour}
                                        </option>
                                      ))}
                                    </select>
                                    <span>:</span>
                                    <select
                                      value={getScheduleBlockTimePart(block, 'endTime', 'minute')}
                                      onChange={(e) => updateScheduleBlockTime(block.day, 'endTime', 'minute', e.target.value)}
                                    >
                                      {minuteOptions.map((minute) => (
                                        <option key={minute} value={minute}>
                                          {minute}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </label>
                              </div>
                            </div>
                          ))}
                          {classForm.scheduleBlocks.length === 0 ? <p className="field-help">Chọn ít nhất 1 ngày để nhập giờ học.</p> : null}
                        </div>
                        <label>
                          Mô tả lớp
                          <textarea
                            value={classForm.description}
                            onChange={(e) => setClassForm((prev) => ({ ...prev, description: e.target.value }))}
                            placeholder="Nhập mô tả lớp"
                          />
                        </label>
                        <div className="form-actions">
                          <button type="button" onClick={submitClass}>
                            Thêm lớp
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {isLoadingData ? <p>Đang tải danh sách lớp...</p> : null}
                  <ul className="class-management-list">
                    {classes.map((cls, index) => (
                      <li
                        key={cls.id}
                        ref={(element) => {
                          classItemRefs.current[index] = element
                        }}
                        className={`class-management-item ${editingIndex === index ? 'is-editing' : ''}`}
                      >
                        {editingIndex === index ? (
                          <div className="class-inline-editor">
                            <div className="manage-section-header">
                              <h4>Chỉnh sửa lớp</h4>
                              <button type="button" className="button-secondary" onClick={resetClassForm}>
                                Đóng
                              </button>
                            </div>
                            <div className="class-form">
                              <label>
                                Tên lớp ({currentClassYear}_...)
                                <input
                                  value={classForm.name}
                                  onChange={(e) => setClassForm((prev) => ({ ...prev, name: e.target.value }))}
                                  placeholder="Ví dụ: Toán cơ bản"
                                />
                                <span className="field-help">Hệ thống sẽ tự thêm tiền tố {currentClassYear}_ vào tên lớp.</span>
                              </label>
                              <label>
                                Lịch học
                                <div className="schedule-picker" role="group" aria-label="Chọn lịch học">
                                  {weekDays.map((day) => (
                                    <button
                                      key={day}
                                      type="button"
                                      className={`schedule-day-btn ${selectedScheduleDays.includes(day) ? 'active' : ''}`}
                                      onClick={() => toggleScheduleDay(day)}
                                    >
                                      {day}
                                    </button>
                                  ))}
                                </div>
                                <span className={`field-help selected-days-summary ${selectedScheduleDays.length > 0 ? 'active' : ''}`}>
                                  Đã chọn: {selectedScheduleDays.length > 0 ? selectedScheduleDays.join(', ') : 'Chưa chọn ngày nào'}
                                </span>
                                <span className="field-help">Mỗi ngày được chọn sẽ có khung giờ riêng.</span>
                                {scheduleConflictError ? <span className="field-help field-help--error">{scheduleConflictError}</span> : null}
                              </label>
                              <div className="schedule-block-list">
                                {classForm.scheduleBlocks.map((block) => (
                                  <div key={block.day} className="schedule-block-row">
                                    <div className="schedule-block-day">
                                      <strong>{block.day}</strong>
                                      <button type="button" className="button-secondary" onClick={() => removeScheduleBlock(block.day)}>
                                        Bỏ ngày
                                      </button>
                                    </div>
                                    <div className="time-range-row">
                                      <label>
                                        Giờ bắt đầu
                                        <div className="time-select-row">
                                          <select
                                            value={getScheduleBlockTimePart(block, 'startTime', 'hour')}
                                            onChange={(e) => updateScheduleBlockTime(block.day, 'startTime', 'hour', e.target.value)}
                                          >
                                            {hourOptions.map((hour) => (
                                              <option key={hour} value={hour}>
                                                {hour}
                                              </option>
                                            ))}
                                          </select>
                                          <span>:</span>
                                          <select
                                            value={getScheduleBlockTimePart(block, 'startTime', 'minute')}
                                            onChange={(e) => updateScheduleBlockTime(block.day, 'startTime', 'minute', e.target.value)}
                                          >
                                            {minuteOptions.map((minute) => (
                                              <option key={minute} value={minute}>
                                                {minute}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </label>
                                      <label>
                                        Giờ kết thúc
                                        <div className="time-select-row">
                                          <select
                                            value={getScheduleBlockTimePart(block, 'endTime', 'hour')}
                                            onChange={(e) => updateScheduleBlockTime(block.day, 'endTime', 'hour', e.target.value)}
                                          >
                                            {hourOptions.map((hour) => (
                                              <option key={hour} value={hour}>
                                                {hour}
                                              </option>
                                            ))}
                                          </select>
                                          <span>:</span>
                                          <select
                                            value={getScheduleBlockTimePart(block, 'endTime', 'minute')}
                                            onChange={(e) => updateScheduleBlockTime(block.day, 'endTime', 'minute', e.target.value)}
                                          >
                                            {minuteOptions.map((minute) => (
                                              <option key={minute} value={minute}>
                                                {minute}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      </label>
                                    </div>
                                  </div>
                                ))}
                                {classForm.scheduleBlocks.length === 0 ? <p className="field-help">Chọn ít nhất 1 ngày để nhập giờ học.</p> : null}
                              </div>
                              <label>
                                Mô tả lớp
                                <textarea
                                  value={classForm.description}
                                  onChange={(e) => setClassForm((prev) => ({ ...prev, description: e.target.value }))}
                                  placeholder="Nhập mô tả lớp"
                                />
                              </label>
                              <div className="form-actions">
                                <button type="button" onClick={submitClass}>
                                  Cập nhật lớp
                                </button>
                                <button type="button" className="button-secondary" onClick={resetClassForm}>
                                  Hủy
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="class-summary-content">
                              <strong>{cls.name}</strong>
                              <p className="class-schedule">{cls.schedule}</p>
                              <p className="class-time-range">{formatTimeRange(cls.startTime, cls.endTime)}</p>
                              <p className="class-description">{cls.description}</p>
                            </div>
                            <div className="class-management-actions">
                              <button type="button" className="edit-class-button" onClick={() => editClass(index)}>
                                Sửa
                              </button>
                              <button type="button" className="button-secondary" onClick={() => openDeleteClassModal(index)}>
                                Xóa
                              </button>
                            </div>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : manageView === 'students' ? (
              <div className="manage-detail">
                <button type="button" className="back-button" onClick={() => setManageView('menu')}>
                  <span aria-hidden="true">←</span>
                  Quay lại
                </button>
                <h3>Quản lý học viên</h3>
                <p>Giao diện quản lý học viên sẽ được hiển thị ở đây.</p>
              </div>
            ) : manageView === 'attendance' ? (
              <div className="manage-detail">
                <button type="button" className="back-button" onClick={() => setManageView('menu')}>
                  <span aria-hidden="true">←</span>
                  Quay lại
                </button>
                <h3>Điểm danh</h3>
                <p>
                  Hôm nay là <strong>{todayWeekDay}</strong>.{' '}
                  {attendanceMakeupMode
                    ? 'Chế độ học bù đang bật: bạn có thể chọn tất cả lớp để điểm danh.'
                    : 'Chọn lớp học trong lịch hôm nay để thực hiện điểm danh theo danh sách học viên.'}
                </p>

                {attendanceClassOptions.length > 0 ? (
                  <div className="attendance-panel">
                    <div className="attendance-toolbar">
                      <label className="attendance-class-select">
                        {attendanceMakeupMode ? 'Tất cả lớp học' : 'Lớp học hôm nay'}
                        <select
                          value={selectedAttendanceClassId ?? ''}
                          onChange={(event) => {
                            const classId = Number(event.target.value)
                            setSelectedAttendanceClassId(Number.isInteger(classId) && classId > 0 ? classId : null)
                            setSelectedAttendanceStudentIds([])
                          }}
                          aria-label="Chọn lớp học để điểm danh"
                        >
                          <option value="">Chọn lớp học</option>
                          {attendanceClassOptions.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              {cls.name} ({formatTimeRange(cls.startTime, cls.endTime)})
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className="attendance-bulk-actions">
                        <label className="attendance-makeup-toggle">
                          <input
                            type="checkbox"
                            checked={attendanceMakeupMode}
                            onChange={(event) => {
                              setAttendanceMakeupMode(event.target.checked)
                              setSelectedAttendanceClassId(null)
                              setSelectedAttendanceStudentIds([])
                            }}
                          />
                          <span>Học bù</span>
                        </label>
                        <span>Đã chọn: {selectedAttendanceStudentIds.length}</span>
                        <button
                          type="button"
                          className="attendance-action-button attendance-action-button--present"
                          onClick={() => setAttendanceStatusForSelectedStudents('present')}
                          disabled={selectedAttendanceStudentIds.length === 0 || attendanceLockedByConfirmed || attendanceLockChecking}
                        >
                          Tích Có mặt
                        </button>
                        <button
                          type="button"
                          className="attendance-action-button attendance-action-button--absent"
                          onClick={() => setAttendanceStatusForSelectedStudents('absent')}
                          disabled={selectedAttendanceStudentIds.length === 0 || attendanceLockedByConfirmed || attendanceLockChecking}
                        >
                          Tích Nghỉ
                        </button>
                        <button
                          type="button"
                          className="attendance-action-button attendance-action-button--confirm"
                          onClick={() => setShowAttendanceConfirmModal(true)}
                          disabled={!selectedAttendanceClassId || attendanceStudents.length === 0 || attendanceConfirming || attendanceLockedByConfirmed || attendanceLockChecking}
                        >
                          {attendanceConfirming ? 'Đang lưu...' : 'Confirm điểm danh'}
                        </button>
                      </div>
                    </div>

                    {attendanceLockChecking ? <p className="attendance-lock-message">Đang kiểm tra trạng thái confirm...</p> : null}
                    {!attendanceLockChecking && attendanceLockedByConfirmed ? (
                      <div className="attendance-lock-message attendance-lock-message--warning">
                        <p>Lớp này đã confirm điểm danh hôm nay. Bạn cần sang Báo cáo nhanh để chỉnh sửa.</p>
                        <button
                          type="button"
                          className="attendance-action-button attendance-action-button--edit"
                          onClick={() => {
                            setReportClassId(selectedAttendanceClassId)
                            setManageView('reports')
                          }}
                        >
                          Sang Báo cáo nhanh
                        </button>
                      </div>
                    ) : null}

                    {attendanceConfirmError ? <p className="attendance-feedback attendance-feedback--error">{attendanceConfirmError}</p> : null}
                    {attendanceConfirmMessage ? <p className="attendance-feedback attendance-feedback--success">{attendanceConfirmMessage}</p> : null}

                    {selectedAttendanceClassId ? (
                      attendanceStudents.length > 0 ? (
                        <div className="attendance-table-wrapper">
                          <table className="attendance-table">
                            <thead>
                              <tr>
                                <th>
                                  <label className="attendance-name-select-all">
                                    <input
                                      type="checkbox"
                                      checked={allAttendanceStudentsSelected}
                                      onChange={(event) => toggleSelectAllAttendanceStudents(event.target.checked)}
                                      disabled={attendanceLockedByConfirmed || attendanceLockChecking}
                                    />
                                    <span>Tên học sinh</span>
                                  </label>
                                </th>
                                <th>Có mặt</th>
                                <th>Nghỉ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {attendanceStudents.map((student) => {
                                const studentStatus = attendanceStatusForSelectedClass[student.id]

                                return (
                                  <tr key={student.id}>
                                    <td>
                                      <label className="attendance-student-name">
                                        <input
                                          type="checkbox"
                                          checked={selectedAttendanceStudentIds.includes(student.id)}
                                          onChange={() => toggleAttendanceStudentSelection(student.id)}
                                          disabled={attendanceLockedByConfirmed || attendanceLockChecking}
                                        />
                                        <span>{student.name}</span>
                                      </label>
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className={`attendance-mark-button attendance-mark-button--present ${studentStatus === 'present' ? 'active' : ''}`}
                                        onClick={() => setAttendanceStatusForStudent(student.id, 'present')}
                                        disabled={attendanceLockedByConfirmed || attendanceLockChecking}
                                      >
                                        {studentStatus === 'present' ? '✓ Có mặt' : 'Có mặt'}
                                      </button>
                                    </td>
                                    <td>
                                      <button
                                        type="button"
                                        className={`attendance-mark-button attendance-mark-button--absent ${studentStatus === 'absent' ? 'active' : ''}`}
                                        onClick={() => setAttendanceStatusForStudent(student.id, 'absent')}
                                        disabled={attendanceLockedByConfirmed || attendanceLockChecking}
                                      >
                                        {studentStatus === 'absent' ? '✓ Nghỉ' : 'Nghỉ'}
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="attendance-empty-state">Lớp này chưa có học viên Active để điểm danh.</p>
                      )
                    ) : (
                      <p className="attendance-empty-state">Vui lòng chọn lớp học để hiển thị bảng điểm danh.</p>
                    )}
                  </div>
                ) : (
                  <p className="attendance-empty-state">
                    {attendanceMakeupMode ? 'Hiện chưa có lớp học nào để điểm danh.' : 'Hôm nay không có lớp học nào trong lịch.'}
                  </p>
                )}
              </div>
            ) : (
              <div className="manage-detail">
                <button type="button" className="back-button" onClick={() => setManageView('menu')}>
                  <span aria-hidden="true">←</span>
                  Quay lại
                </button>
                <h3>Báo cáo nhanh</h3>
                <p>Chọn lớp và ngày để xem hoặc chỉnh sửa điểm danh đã lưu.</p>
                <div className="report-export-group">
                  <div className="report-export-block">
                    <div className="report-export-block-header">
                      <h4>Export toàn bộ</h4>
                      <p>Xuất toàn bộ lịch sử điểm danh đã lưu ra file Excel.</p>
                    </div>
                    <button
                      type="button"
                      className="attendance-action-button attendance-action-button--export"
                      onClick={() => void exportAttendanceRecords()}
                      disabled={reportExporting}
                    >
                      {reportExporting ? 'Đang export...' : 'Export toàn bộ'}
                    </button>
                  </div>

                  <div className="report-export-block">
                    <div className="report-export-block-header">
                      <h4>Export theo khoảng thời gian</h4>
                      <p>Chọn ngày bắt đầu và ngày kết thúc để chỉ xuất điểm danh trong khoảng đó.</p>
                    </div>
                    <div className="report-export-range-fields">
                      <label className="attendance-class-select">
                        Từ ngày
                        <input
                          type="date"
                          value={reportExportStart}
                          onChange={(event) => setReportExportStart(event.target.value)}
                          aria-label="Từ ngày export điểm danh"
                        />
                      </label>
                      <label className="attendance-class-select">
                        Đến ngày
                        <input
                          type="date"
                          value={reportExportEnd}
                          onChange={(event) => setReportExportEnd(event.target.value)}
                          aria-label="Đến ngày export điểm danh"
                        />
                      </label>
                      <button
                        type="button"
                        className="attendance-action-button attendance-action-button--export"
                        onClick={() => void exportAttendanceRecordsByRange()}
                        disabled={reportExporting}
                      >
                        {reportExporting ? 'Đang export...' : 'Export theo khoảng'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="attendance-panel report-panel">
                  <div className="attendance-toolbar report-toolbar">
                    <label className="attendance-class-select">
                      Chọn lớp học
                      <select
                        value={reportClassId ?? ''}
                        onChange={(event) => {
                          const classId = Number(event.target.value)
                          setReportClassId(Number.isInteger(classId) && classId > 0 ? classId : null)
                          setReportError('')
                          setReportMessage('')
                        }}
                        aria-label="Chọn lớp học cho báo cáo điểm danh"
                      >
                        <option value="">Chọn lớp học</option>
                        {availableClassOptions.map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="attendance-class-select">
                      Chọn ngày đã học
                      <select
                        value={reportDate}
                        onChange={(event) => {
                          setReportDate(event.target.value)
                          setReportError('')
                          setReportMessage('')
                        }}
                        aria-label="Chọn ngày để xem báo cáo điểm danh"
                        disabled={!reportClassId || reportLoadingDates || reportDates.length === 0}
                      >
                        <option value="">{reportLoadingDates ? 'Đang tải ngày...' : 'Chọn ngày'}</option>
                        {reportDates.map((dateText) => (
                          <option key={dateText} value={dateText}>
                            {dateText}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {reportError ? <p className="attendance-feedback attendance-feedback--error">{reportError}</p> : null}
                  {reportMessage ? <p className="attendance-feedback attendance-feedback--success">{reportMessage}</p> : null}

                  {reportLoadingRows ? <p className="attendance-empty-state">Đang tải danh sách điểm danh...</p> : null}

                  {!reportLoadingRows && reportClassId && reportDate && reportRows.length > 0 ? (
                    <p className="report-count">Có mặt: {reportPresentCount}/{reportRows.length}</p>
                  ) : null}

                  {!reportLoadingRows && reportClassId && reportDate && reportRows.length > 0 ? (
                    <>
                      <div className="attendance-table-wrapper">
                        <table className="attendance-table">
                          <thead>
                            <tr>
                              <th>Tên học sinh</th>
                              <th>Có mặt</th>
                              <th>Nghỉ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportRows.map((row) => (
                              <tr key={row.id}>
                                <td>{row.studentName}</td>
                                <td>
                                  {reportEditMode ? (
                                    <button
                                      type="button"
                                      className={`attendance-mark-button attendance-mark-button--present ${row.status ? 'active' : ''}`}
                                      onClick={() => updateReportRowStatus(row.id, true)}
                                    >
                                      {row.status ? '✓ Có mặt' : 'Có mặt'}
                                    </button>
                                  ) : row.status ? (
                                    <span className="attendance-status-readonly attendance-status-readonly--present">Có mặt</span>
                                  ) : null}
                                </td>
                                <td>
                                  {reportEditMode ? (
                                    <button
                                      type="button"
                                      className={`attendance-mark-button attendance-mark-button--absent ${!row.status ? 'active' : ''}`}
                                      onClick={() => updateReportRowStatus(row.id, false)}
                                    >
                                      {!row.status ? '✓ Nghỉ' : 'Nghỉ'}
                                    </button>
                                  ) : !row.status ? (
                                    <span className="attendance-status-readonly attendance-status-readonly--absent">Nghỉ</span>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="report-actions">
                        <button
                          type="button"
                          className="attendance-action-button attendance-action-button--edit"
                          onClick={() => {
                            setReportEditMode((previousValue) => !previousValue)
                            setReportError('')
                            setReportMessage('')
                          }}
                        >
                          {reportEditMode ? 'Đóng Edit' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="attendance-action-button attendance-action-button--confirm"
                          onClick={() => setShowReportConfirmModal(true)}
                          disabled={reportSaving || !reportEditMode}
                        >
                          {reportSaving ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {!reportLoadingRows && reportClassId && reportDate && reportRows.length === 0 ? (
                    <p className="attendance-empty-state">Không có dữ liệu điểm danh cho lớp và ngày đã chọn.</p>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        ) : activeSection === 'Học viên' ? (
          <StudentsSection
            students={students}
            classes={classes}
            isLoadingData={isLoadingData}
            setApiError={setApiError}
            onStudentsChanged={loadStudents}
            onClassesChanged={loadClasses}
          />
        ) : activeSection === 'Giáo Viên' ? (
          <TeachersSection
            teachers={teachers}
            classes={classes}
            isLoadingData={isLoadingData}
            setApiError={setApiError}
            onTeachersChanged={loadTeachers}
          />
        ) : activeSection === 'Học Phí' ? (
          <TuitionSection />
        ) : (
          <section className="card">
            <p>Chức năng đang phát triển.</p>
          </section>
        )}
      </main>

      {showClassNameRequiredModal ? (
        <div className="modal-overlay">
          <div className="modal-card class-name-required-modal">
            <h4>Thiếu tên lớp</h4>
            <p>Vui lòng nhập tên lớp học trước khi lưu.</p>
            <div className="modal-actions">
              <button type="button" className="class-name-required-button" onClick={() => setShowClassNameRequiredModal(false)}>
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {classToDelete ? (
        <div className="modal-overlay">
          <div className="modal-card delete-modal-card">
            <h4>Xóa lớp học</h4>
            <p>Nhập lại tên lớp “{classToDelete.name}” để xác nhận xóa. Hành động này không thể hoàn tác.</p>
            <input
              value={deleteClassNameInput}
              onChange={(e) => setDeleteClassNameInput(e.target.value)}
              placeholder="Nhập tên lớp để xác nhận"
              aria-label="Nhập tên lớp để xác nhận xóa"
            />
            <div className="modal-actions">
              <button type="button" className="modal-close-button" onClick={closeDeleteClassModal}>
                Hủy
              </button>
              <button type="button" onClick={() => void confirmDeleteClass()}>
                Xóa lớp
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showUpdateConflictModal ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h4>Lịch học bị trùng</h4>
            <p>Khung giờ bạn vừa chọn bị trùng với lớp khác. Vui lòng kiểm tra lại lịch học.</p>
            <div className="modal-actions">
              <button type="button" onClick={closeUpdateConflictModal}>
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {scheduleDayToRemove ? (
        <div className="modal-overlay">
          <div className="modal-card schedule-remove-modal-card">
            <h4>Bỏ chọn {scheduleDayToRemove}?</h4>
            <p>Bạn có chắc muốn bỏ lịch học vào {scheduleDayToRemove} không?</p>
            <div className="modal-actions">
              <button type="button" className="modal-close-button" onClick={closeScheduleDayRemoveModal}>
                Hủy
              </button>
              <button type="button" onClick={confirmScheduleDayRemove}>
                Bỏ chọn
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showReportConfirmModal ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h4>Xác nhận lưu điểm danh</h4>
            <p>
              Bạn có chắc muốn lưu các thay đổi điểm danh cho lớp {reportClassName} ngày {reportDate}?
            </p>
            <div className="modal-actions">
              <button type="button" className="modal-close-button" onClick={() => setShowReportConfirmModal(false)}>
                Hủy
              </button>
              <button type="button" disabled={reportSaving} onClick={() => void confirmUpdateReportRows()}>
                {reportSaving ? 'Đang lưu...' : 'Xác nhận lưu'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAttendanceConfirmModal ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h4>Xác nhận điểm danh</h4>
            <p>
              Xác nhận điểm danh xong cho lớp {selectedAttendanceClassName}? Sau khi xác nhận sẽ không thể điểm danh lại cho lớp này hôm
              nay.
            </p>
            <div className="modal-actions">
              <button type="button" className="modal-close-button" onClick={() => setShowAttendanceConfirmModal(false)}>
                Hủy
              </button>
              <button
                type="button"
                disabled={attendanceConfirming}
                onClick={async () => {
                  await confirmAttendance()
                  setShowAttendanceConfirmModal(false)
                }}
              >
                {attendanceConfirming ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
     
