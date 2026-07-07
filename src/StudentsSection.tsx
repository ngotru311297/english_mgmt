import { useMemo, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { api } from './api'
import { stripClassYearPrefix } from './classNameUtils'
import studentExcelTemplateUrl from './template.xlsx?url'
import type { ClassSummary, StudentSummary } from './types'

type StudentExcelImportResult = {
  imported: number
  skipped: number
  errors: string[]
}

type StudentsSectionProps = {
  students: StudentSummary[]
  classes: ClassSummary[]
  isLoadingData: boolean
  setApiError: (message: string) => void
  onStudentsChanged: () => Promise<void>
  onClassesChanged: () => Promise<void>
}

const normalizeExcelHeader = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const readExcelCellText = (value: unknown) => {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim()
  return ''
}

const readExcelRowValue = (row: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const text = readExcelCellText(row[key])
    if (text) return text
  }

  return ''
}

export default function StudentsSection({
  students,
  classes,
  isLoadingData,
  setApiError,
  onStudentsChanged,
  onClassesChanged,
}: StudentsSectionProps) {
  const [showStudentForm, setShowStudentForm] = useState(false)
  const [studentForm, setStudentForm] = useState({ name: '', classId: '', phone: '', parentName: '' })
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null)
  const [showStudentExcelModal, setShowStudentExcelModal] = useState(false)
  const [studentExcelFile, setStudentExcelFile] = useState<File | null>(null)
  const [studentExcelImporting, setStudentExcelImporting] = useState(false)
  const [studentExcelResult, setStudentExcelResult] = useState<StudentExcelImportResult | null>(null)
  const [studentExcelError, setStudentExcelError] = useState('')
  const [studentSearch, setStudentSearch] = useState('')
  const [studentToDeactivate, setStudentToDeactivate] = useState<StudentSummary | null>(null)

  const availableClassOptions = useMemo(() => classes.slice().sort((a, b) => a.name.localeCompare(b.name)), [classes])

  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase()
    if (!query) {
      return students
    }

    return students.filter((student) => {
      const studentName = student.name.toLowerCase()
      const className = student.className.toLowerCase()
      return studentName.includes(query) || className.includes(query)
    })
  }, [studentSearch, students])

  const resetStudentForm = () => {
    setStudentForm({ name: '', classId: '', phone: '', parentName: '' })
    setEditingStudentId(null)
    setShowStudentForm(false)
  }

  const openStudentEditForm = (student: StudentSummary) => {
    setEditingStudentId(student.id)
    setStudentForm({
      name: student.name,
      classId: String(student.classId),
      phone: student.phone,
      parentName: student.parentName,
    })
    setShowStudentForm(true)
  }

  const openStudentExcelModal = () => {
    setStudentExcelFile(null)
    setStudentExcelResult(null)
    setStudentExcelError('')
    setShowStudentExcelModal(true)
  }

  const downloadStudentExcelTemplate = async () => {
    try {
      const link = document.createElement('a')
      link.href = studentExcelTemplateUrl
      link.download = 'mau-nhap-hoc-vien.xlsx'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      setStudentExcelError(error instanceof Error ? error.message : 'Không thể tải template Excel.')
    }
  }

  const closeStudentExcelModal = () => {
    setShowStudentExcelModal(false)
    setStudentExcelFile(null)
    setStudentExcelResult(null)
    setStudentExcelError('')
    setStudentExcelImporting(false)
  }

  const handleStudentExcelFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    setStudentExcelFile(file)
    setStudentExcelResult(null)
    setStudentExcelError('')
  }

  const importStudentsFromExcel = async () => {
    if (!studentExcelFile) {
      setStudentExcelError('Vui lòng chọn file Excel trước khi nhập.')
      return
    }

    setStudentExcelImporting(true)
    setStudentExcelError('')
    setStudentExcelResult(null)

    try {
      const workbook = XLSX.read(await studentExcelFile.arrayBuffer(), { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      if (!sheetName) {
        throw new Error('File Excel không có sheet dữ liệu.')
      }

      const worksheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '', raw: false })
      if (rows.length === 0) {
        throw new Error('Không tìm thấy dữ liệu học viên trong file Excel.')
      }

      const normalizedClasses = classes.map((item) => ({
        ...item,
        normalizedName: normalizeExcelHeader(item.name),
        strippedName: normalizeExcelHeader(stripClassYearPrefix(item.name)),
      }))

      let imported = 0
      let skipped = 0
      const errors: string[] = []

      for (const [index, row] of rows.entries()) {
        const normalizedRow = Object.fromEntries(
          Object.entries(row).map(([key, value]) => [normalizeExcelHeader(key), value]),
        ) as Record<string, unknown>

        const studentName = readExcelRowValue(normalizedRow, ['ten hoc vien', 'hoc vien', 'ten', 'name', 'ho ten'])
        const classIdText = readExcelRowValue(normalizedRow, ['class id', 'classid', 'lop hoc id', 'lop id'])
        const classNameText = readExcelRowValue(normalizedRow, ['lop hoc', 'lop', 'class', 'class name', 'ten lop'])
        const phone = readExcelRowValue(normalizedRow, ['so dien thoai', 'dien thoai', 'phone', 'sdt'])
        const parentName = readExcelRowValue(normalizedRow, ['ten phu huynh', 'phu huynh', 'parent name', 'parent'])

        if (!studentName || (!classIdText && !classNameText) || !phone || !parentName) {
          skipped += 1
          errors.push(`Dòng ${index + 2}: thiếu tên học viên, lớp, số điện thoại hoặc tên phụ huynh.`)
          continue
        }

        const classIdFromFile = Number(classIdText)
        const matchedClass = Number.isInteger(classIdFromFile) && classIdFromFile > 0
          ? classes.find((item) => item.id === classIdFromFile) ?? null
          : normalizedClasses.find(
              (item) =>
                item.normalizedName === normalizeExcelHeader(classNameText) ||
                item.strippedName === normalizeExcelHeader(classNameText),
            ) ?? null

        if (!matchedClass) {
          skipped += 1
          errors.push(`Dòng ${index + 2}: không tìm thấy lớp phù hợp với "${classIdText || classNameText}".`)
          continue
        }

        try {
          await api.createStudent({
            name: studentName,
            classId: matchedClass.id,
            phone,
            parentName,
          })
          imported += 1
        } catch (error) {
          skipped += 1
          errors.push(`Dòng ${index + 2}: ${error instanceof Error ? error.message : 'không thể thêm học viên.'}`)
        }
      }

      if (imported > 0) {
        await Promise.all([onStudentsChanged(), onClassesChanged()])
      }

      setStudentExcelResult({ imported, skipped, errors })
    } catch (error) {
      setStudentExcelError(error instanceof Error ? error.message : 'Không thể đọc file Excel.')
    } finally {
      setStudentExcelImporting(false)
    }
  }

  const clearStudentSearch = () => {
    setStudentSearch('')
  }

  const openStudentDeactivateModal = (student: StudentSummary) => {
    setStudentToDeactivate(student)
  }

  const closeStudentDeactivateModal = () => {
    setStudentToDeactivate(null)
  }

  const activateStudent = async (student: StudentSummary) => {
    setApiError('')
    try {
      await api.updateStudentStatus(student.id, 'Active')
      await onStudentsChanged()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Không thể chuyển trạng thái học viên.')
    }
  }

  const confirmStudentDeactivate = async () => {
    if (!studentToDeactivate) return

    setApiError('')
    try {
      await api.updateStudentStatus(studentToDeactivate.id, 'Inactive')
      await onStudentsChanged()
      setStudentToDeactivate(null)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Không thể chuyển trạng thái học viên.')
    }
  }

  const addStudent = async () => {
    const trimmedName = studentForm.name.trim()
    const classId = Number(studentForm.classId)
    const trimmedPhone = studentForm.phone.trim()
    const trimmedParentName = studentForm.parentName.trim()

    if (!trimmedName || !Number.isInteger(classId) || classId <= 0 || !trimmedPhone || !trimmedParentName) return

    const payload = {
      name: trimmedName,
      classId,
      phone: trimmedPhone,
      parentName: trimmedParentName,
    }

    setApiError('')
    try {
      if (editingStudentId !== null) {
        await api.updateStudent(editingStudentId, payload)
      } else {
        await api.createStudent(payload)
      }
      await onStudentsChanged()
      await onClassesChanged()
      resetStudentForm()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : editingStudentId !== null ? 'Không thể cập nhật học viên.' : 'Không thể thêm học viên.')
    }
  }

  return (
    <>
      <section className="card student-form-card">
        <div className="student-form-header">
          <div className="student-form-actions">
            <button
              type="button"
              className="student-add-toggle-button"
              onClick={() => {
                resetStudentForm()
                setShowStudentForm(true)
              }}
            >
              + Thêm học viên
            </button>
            <button type="button" className="button-secondary student-excel-toggle-button" onClick={openStudentExcelModal}>
              Thêm học viên - Excel
            </button>
          </div>
        </div>

        {showStudentForm ? (
          <div className="student-inline-form">
            <div className="student-form-header-row">
              <h4>{editingStudentId !== null ? 'Sửa thông tin học viên' : 'Thêm học viên mới'}</h4>
              <button type="button" className="button-secondary form-close-button" onClick={resetStudentForm}>
                Đóng
              </button>
            </div>
            <div className="student-field-row">
              <label>
                Tên học viên
                <input
                  value={studentForm.name}
                  onChange={(e) => setStudentForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Nhập tên học viên"
                  aria-label="Tên học viên"
                />
              </label>
              <label>
                Lớp học
                <select
                  value={studentForm.classId}
                  onChange={(e) => setStudentForm((prev) => ({ ...prev, classId: e.target.value }))}
                  aria-label="Lớp học"
                >
                  <option value="">Chọn lớp học</option>
                  {availableClassOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="student-field-row">
              <label>
                Số điện thoại
                <input
                  value={studentForm.phone}
                  onChange={(e) => setStudentForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="Nhập số điện thoại"
                  aria-label="Số điện thoại học viên"
                />
              </label>
              <label>
                Tên phụ huynh
                <input
                  value={studentForm.parentName}
                  onChange={(e) => setStudentForm((prev) => ({ ...prev, parentName: e.target.value }))}
                  placeholder="Nhập tên phụ huynh"
                  aria-label="Tên phụ huynh"
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="student-save-button" onClick={addStudent}>
                Lưu học viên
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card student-list-card">
        <div className="card-header">
          <h3>Danh sách học viên ({filteredStudents.length})</h3>
        </div>
        <div className="student-list-topline">
          <div className="student-search-field">
            <input
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              placeholder="Tìm theo tên học viên hoặc lớp học"
              aria-label="Tìm học viên theo tên hoặc lớp học"
            />
            {studentSearch.trim() ? (
              <button type="button" className="button-secondary student-search-clear" onClick={clearStudentSearch}>
                Xóa lọc
              </button>
            ) : null}
          </div>
          <p className="student-search-hint">
            {studentSearch.trim()
              ? `Đang lọc theo "${studentSearch.trim()}"`
              : 'Bạn có thể tìm theo tên học viên hoặc tên lớp học.'}
          </p>
        </div>
        {isLoadingData ? <p>Đang tải danh sách học viên...</p> : null}
        {filteredStudents.length > 0 ? (
          <ul className="student-list">
            {filteredStudents.map((student) => (
              <li
                key={student.id}
                className={student.status === 'Inactive' ? 'student-list-item--inactive' : 'student-list-item--active'}
              >
                <div className="student-list-headline">
                  <strong>{student.name}</strong>
                  <div className="student-list-actions">
                    {student.status !== 'Inactive' ? <span className="student-status-badge">Active</span> : null}
                    {student.status !== 'Inactive' ? (
                      <>
                        <button type="button" className="button-secondary student-edit-button" onClick={() => openStudentEditForm(student)}>
                          Edit
                        </button>
                        <button type="button" className="student-inactive-button" onClick={() => openStudentDeactivateModal(student)}>
                          Inactive
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="student-inactive-chip">Inactive</span>
                        <button type="button" className="student-active-button" onClick={() => void activateStudent(student)}>
                          Active
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <span>{student.className}</span>
                <span>{student.phone}</span>
                <span>{student.parentName}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="student-empty-state">Không tìm thấy học viên phù hợp.</p>
        )}
      </section>

      {showStudentExcelModal ? (
        <div className="modal-overlay">
          <div className="modal-card student-excel-modal-card">
            <h4>Nhập học viên từ Excel</h4>
            <p>Tải file mẫu, điền thông tin học viên rồi chọn file Excel để nhập vào hệ thống.</p>

            <div className="student-excel-template-row">
              <button
                type="button"
                className="button-secondary student-excel-template-button"
                onClick={() => void downloadStudentExcelTemplate()}
              >
                Tải file mẫu
              </button>
            </div>

            <div className="student-excel-file-field">
              <input type="file" accept=".xlsx,.xls" onChange={handleStudentExcelFileChange} aria-label="Chọn file Excel học viên" />
              {studentExcelFile ? <p className="student-excel-file-name">{studentExcelFile.name}</p> : null}
            </div>

            {studentExcelError ? <p className="student-excel-error">{studentExcelError}</p> : null}

            {studentExcelResult ? (
              <div className="student-excel-summary">
                <strong>
                  Đã nhập {studentExcelResult.imported} học viên, bỏ qua {studentExcelResult.skipped} dòng.
                </strong>
                {studentExcelResult.errors.length > 0 ? (
                  <ul>
                    {studentExcelResult.errors.map((message, index) => (
                      <li key={index}>{message}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}

            <div className="modal-actions">
              <button type="button" className="modal-close-button" onClick={closeStudentExcelModal}>
                Đóng
              </button>
              <button
                type="button"
                className="student-excel-import-button"
                disabled={!studentExcelFile || studentExcelImporting}
                onClick={() => void importStudentsFromExcel()}
              >
                {studentExcelImporting ? 'Đang nhập...' : 'Nhập học viên'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {studentToDeactivate ? (
        <div className="modal-overlay">
          <div className="modal-card student-deactivate-modal-card">
            <h4>Chuyển học viên sang Inactive?</h4>
            <p>
              Học viên "{studentToDeactivate.name}" sẽ không còn tính vào sĩ số lớp {studentToDeactivate.className}.
            </p>
            <div className="modal-actions">
              <button type="button" className="student-deactivate-cancel-button" onClick={closeStudentDeactivateModal}>
                Hủy
              </button>
              <button type="button" className="student-deactivate-confirm-button" onClick={() => void confirmStudentDeactivate()}>
                Inactive
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
