import { useMemo, useState } from 'react'
import { api } from './api'
import type { ClassSummary, TeacherSummary } from './types'

type TeachersSectionProps = {
  teachers: TeacherSummary[]
  classes: ClassSummary[]
  isLoadingData: boolean
  setApiError: (message: string) => void
  onTeachersChanged: () => Promise<void>
}

export default function TeachersSection({ teachers, classes, isLoadingData, setApiError, onTeachersChanged }: TeachersSectionProps) {
  const [showTeacherForm, setShowTeacherForm] = useState(false)
  const [teacherForm, setTeacherForm] = useState({ name: '', nickname: '', classIds: [] as number[], phone: '' })
  const [editingTeacherId, setEditingTeacherId] = useState<number | null>(null)
  const [teacherSearch, setTeacherSearch] = useState('')
  const [teacherToDeactivate, setTeacherToDeactivate] = useState<TeacherSummary | null>(null)
  const [showTeacherNameRequiredModal, setShowTeacherNameRequiredModal] = useState(false)

  const availableClassOptions = useMemo(() => classes.slice().sort((a, b) => a.name.localeCompare(b.name)), [classes])

  const filteredTeachers = useMemo(() => {
    const query = teacherSearch.trim().toLowerCase()
    if (!query) {
      return teachers
    }

    return teachers.filter((teacher) => {
      const teacherName = teacher.name.toLowerCase()
      const teacherNickname = teacher.nickname.toLowerCase()
      const classNames = teacher.classNames.join(', ').toLowerCase()
      return teacherName.includes(query) || teacherNickname.includes(query) || classNames.includes(query)
    })
  }, [teacherSearch, teachers])

  const resetTeacherForm = () => {
    setTeacherForm({ name: '', nickname: '', classIds: [], phone: '' })
    setEditingTeacherId(null)
    setShowTeacherForm(false)
    setShowTeacherNameRequiredModal(false)
  }

  const openTeacherEditForm = (teacher: TeacherSummary) => {
    setTeacherForm({
      name: teacher.name,
      nickname: teacher.nickname,
      classIds: teacher.classIds,
      phone: teacher.phone,
    })
    setEditingTeacherId(teacher.id)
    setShowTeacherNameRequiredModal(false)
    setShowTeacherForm(true)
  }

  const clearTeacherSearch = () => {
    setTeacherSearch('')
  }

  const openTeacherDeactivateModal = (teacher: TeacherSummary) => {
    setTeacherToDeactivate(teacher)
  }

  const closeTeacherDeactivateModal = () => {
    setTeacherToDeactivate(null)
  }

  const activateTeacher = async (teacher: TeacherSummary) => {
    setApiError('')
    try {
      await api.updateTeacherStatus(teacher.id, 'Active')
      await onTeachersChanged()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Không thể chuyển trạng thái giáo viên.')
    }
  }

  const confirmTeacherDeactivate = async () => {
    if (!teacherToDeactivate) return

    setApiError('')
    try {
      await api.updateTeacherStatus(teacherToDeactivate.id, 'Inactive')
      await onTeachersChanged()
      setTeacherToDeactivate(null)
    } catch (error) {
      setApiError(error instanceof Error ? error.message : 'Không thể chuyển trạng thái giáo viên.')
    }
  }

  const addTeacher = async () => {
    const trimmedName = teacherForm.name.trim()
    const trimmedNickname = teacherForm.nickname.trim()
    const uniqueClassIds = Array.from(new Set(teacherForm.classIds)).filter((classId) => Number.isInteger(classId) && classId > 0)
    const trimmedPhone = teacherForm.phone.trim()

    if (!trimmedName || !trimmedNickname) {
      setShowTeacherNameRequiredModal(true)
      return
    }

    if (!trimmedPhone) return

    setApiError('')
    try {
      const teacherPayload = {
        name: trimmedName,
        nickname: trimmedNickname,
        classIds: uniqueClassIds,
        phone: trimmedPhone,
      }

      if (editingTeacherId !== null) {
        await api.updateTeacher(editingTeacherId, teacherPayload)
      } else {
        await api.createTeacher(teacherPayload)
      }

      await onTeachersChanged()
      resetTeacherForm()
    } catch (error) {
      setApiError(error instanceof Error ? error.message : editingTeacherId !== null ? 'Không thể cập nhật giáo viên.' : 'Không thể thêm giáo viên.')
    }
  }

  return (
    <>
      <section className="card teacher-form-card">
        <div className="student-form-header">
          <button
            type="button"
            className="student-add-toggle-button teacher-add-toggle-button"
            onClick={() => {
              setEditingTeacherId(null)
              setTeacherForm({ name: '', nickname: '', classIds: [], phone: '' })
              setShowTeacherForm(true)
            }}
          >
            + Thêm giáo viên
          </button>
        </div>

        {showTeacherForm ? (
          <div className="student-inline-form teacher-inline-form">
            <div className="teacher-form-title-row">
              <h4>{editingTeacherId !== null ? 'Sửa thông tin giáo viên' : 'Thêm giáo viên mới'}</h4>
              <button type="button" className="button-secondary form-close-button" onClick={resetTeacherForm}>
                Đóng
              </button>
            </div>
            <div className="student-field-row">
              <label>
                Tên giáo viên
                <input
                  value={teacherForm.name}
                  onChange={(e) => setTeacherForm((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="Nhập tên giáo viên"
                  aria-label="Tên giáo viên"
                />
              </label>
              <label>
                Biệt danh
                <input
                  value={teacherForm.nickname}
                  onChange={(e) => setTeacherForm((prev) => ({ ...prev, nickname: e.target.value }))}
                  placeholder="Nhập biệt danh"
                  aria-label="Biệt danh giáo viên"
                />
              </label>
            </div>
            <div className="student-field-row">
              <label>
                Số điện thoại
                <input
                  value={teacherForm.phone}
                  onChange={(e) => setTeacherForm((prev) => ({ ...prev, phone: e.target.value }))}
                  placeholder="Nhập số điện thoại"
                  aria-label="Số điện thoại giáo viên"
                />
              </label>
            </div>
            <div className="student-field-row teacher-field-row--single">
              <label className="teacher-class-picker">
                <span className="teacher-class-picker-label">Lớp phụ trách</span>
                <select
                  multiple
                  className="teacher-class-multiselect"
                  value={teacherForm.classIds.map(String)}
                  onChange={(e) => {
                    const selectedIds = Array.from(e.target.selectedOptions).map((option) => Number(option.value))
                    setTeacherForm((prev) => ({ ...prev, classIds: selectedIds }))
                  }}
                  aria-label="Chọn lớp phụ trách"
                >
                  {availableClassOptions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button type="button" className="student-save-button teacher-save-button" onClick={() => void addTeacher()}>
                Lưu giáo viên
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="card teacher-list-card">
        <div className="card-header">
          <h3>Danh sách giáo viên ({filteredTeachers.length})</h3>
        </div>
        <div className="student-list-topline">
          <div className="student-search-field">
            <input
              value={teacherSearch}
              onChange={(e) => setTeacherSearch(e.target.value)}
              placeholder="Tìm theo tên giáo viên hoặc lớp phụ trách"
              aria-label="Tìm giáo viên theo tên hoặc lớp phụ trách"
            />
            {teacherSearch.trim() ? (
              <button type="button" className="button-secondary student-search-clear" onClick={clearTeacherSearch}>
                Xóa lọc
              </button>
            ) : null}
          </div>
          <p className="student-search-hint">
            {teacherSearch.trim()
              ? `Đang lọc theo "${teacherSearch.trim()}"`
              : 'Bạn có thể tìm theo tên giáo viên hoặc tên lớp phụ trách.'}
          </p>
        </div>
        {isLoadingData ? <p>Đang tải danh sách giáo viên...</p> : null}
        {filteredTeachers.length > 0 ? (
          <ul className="student-list">
            {filteredTeachers.map((teacher) => (
              <li
                key={teacher.id}
                className={`teacher-list-item ${teacher.status === 'Inactive' ? 'student-list-item--inactive' : 'student-list-item--active'}`}
              >
                <div className="student-list-headline">
                  <strong>{teacher.name}</strong>
                  <div className="student-list-actions">
                    {teacher.status !== 'Inactive' ? <span className="student-status-badge teacher-status-badge">Active</span> : null}
                    {teacher.status !== 'Inactive' ? (
                      <>
                        <button type="button" className="teacher-edit-button" onClick={() => openTeacherEditForm(teacher)}>
                          Edit
                        </button>
                        <button type="button" className="student-inactive-button" onClick={() => openTeacherDeactivateModal(teacher)}>
                          Inactive
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="student-inactive-chip">Inactive</span>
                        <button type="button" className="student-active-button" onClick={() => void activateTeacher(teacher)}>
                          Active
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <span className="teacher-list-nickname">{teacher.nickname}</span>
                <span className="teacher-list-class">{teacher.classNames.join(', ') || 'Chưa gán'}</span>
                <span className="teacher-list-phone">{teacher.phone}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="student-empty-state">Không tìm thấy giáo viên phù hợp.</p>
        )}
      </section>

      {showTeacherNameRequiredModal ? (
        <div className="modal-overlay">
          <div className="modal-card teacher-name-required-modal">
            <h4>Thiếu thông tin giáo viên</h4>
            <p>Vui lòng nhập tên và biệt danh giáo viên trước khi lưu.</p>
            <div className="modal-actions">
              <button type="button" className="teacher-name-required-button" onClick={() => setShowTeacherNameRequiredModal(false)}>
                Đã hiểu
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {teacherToDeactivate ? (
        <div className="modal-overlay">
          <div className="modal-card teacher-deactivate-modal-card">
            <h4>Chuyển giáo viên sang Inactive?</h4>
            <p>Giáo viên "{teacherToDeactivate.name}" sẽ không còn hiển thị là đang giảng dạy.</p>

            <div className="modal-actions">
              <button type="button" className="teacher-deactivate-cancel-button" onClick={closeTeacherDeactivateModal}>
                Hủy
              </button>
              <button type="button" className="teacher-deactivate-confirm-button" onClick={() => void confirmTeacherDeactivate()}>
                Inactive
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
