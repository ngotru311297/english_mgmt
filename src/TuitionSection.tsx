import { useEffect, useState } from 'react'
import { tuitionApi, type ApiTuitionRow } from './tuitionApi'

const formatCurrency = (value: number) => `${value.toLocaleString('vi-VN')} đ`

const getCurrentMonthText = () => new Date().toISOString().slice(0, 7)

function TuitionSection() {
  const [feePerSession, setFeePerSession] = useState<number | null>(null)
  const [feeInput, setFeeInput] = useState('')
  const [editingFee, setEditingFee] = useState(false)
  const [feeSaving, setFeeSaving] = useState(false)
  const [feeError, setFeeError] = useState('')
  const [showFeeConfirmModal, setShowFeeConfirmModal] = useState(false)

  const [month, setMonth] = useState(getCurrentMonthText())
  const [rows, setRows] = useState<ApiTuitionRow[]>([])
  const [totalAmount, setTotalAmount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [updatingPaymentKey, setUpdatingPaymentKey] = useState<string | null>(null)

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const result = await tuitionApi.getSettings()
        setFeePerSession(result.feePerSession)
      } catch (error) {
        setFeeError(error instanceof Error ? error.message : 'Không thể tải học phí mỗi buổi.')
      }
    }

    void loadSettings()
  }, [])

  useEffect(() => {
    if (!month) return

    const loadSummary = async () => {
      setLoading(true)
      setSummaryError('')
      try {
        const result = await tuitionApi.getSummary(month)
        setRows(result.rows)
        setTotalAmount(result.totalAmount)
      } catch (error) {
        setSummaryError(error instanceof Error ? error.message : 'Không thể tải học phí theo tháng.')
        setRows([])
        setTotalAmount(0)
      } finally {
        setLoading(false)
      }
    }

    void loadSummary()
  }, [month])

  const togglePaymentStatus = async (row: ApiTuitionRow) => {
    const key = `${row.className}|${row.studentName}`
    setUpdatingPaymentKey(key)
    setSummaryError('')
    try {
      const result = await tuitionApi.updatePaymentStatus({
        studentName: row.studentName,
        className: row.className,
        month,
        paid: !row.paid,
      })
      setRows((previousRows) =>
        previousRows.map((item) =>
          item.studentName === row.studentName && item.className === row.className ? { ...item, paid: result.paid } : item,
        ),
      )
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái đóng học phí.')
    } finally {
      setUpdatingPaymentKey(null)
    }
  }

  const openFeeEditor = () => {
    setFeeInput(feePerSession !== null ? String(feePerSession) : '')
    setFeeError('')
    setEditingFee(true)
  }

  const closeFeeEditor = () => {
    setEditingFee(false)
    setFeeError('')
  }

  const requestFeeConfirm = () => {
    const parsed = Number(feeInput)
    if (!Number.isInteger(parsed) || parsed < 0) {
      setFeeError('Học phí mỗi buổi phải là số nguyên không âm.')
      return
    }
    setFeeError('')
    setShowFeeConfirmModal(true)
  }

  const confirmFeeUpdate = async () => {
    const parsed = Number(feeInput)
    setFeeSaving(true)
    setFeeError('')
    try {
      const result = await tuitionApi.updateSettings(parsed)
      setFeePerSession(result.feePerSession)
      setEditingFee(false)
      setShowFeeConfirmModal(false)

      if (month) {
        const summary = await tuitionApi.getSummary(month)
        setRows(summary.rows)
        setTotalAmount(summary.totalAmount)
      }
    } catch (error) {
      setFeeError(error instanceof Error ? error.message : 'Không thể cập nhật học phí mỗi buổi.')
      setShowFeeConfirmModal(false)
    } finally {
      setFeeSaving(false)
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-header">
          <h3>Cấu hình học phí mỗi buổi</h3>
        </div>

        {!editingFee ? (
          <div className="inline-actions-row">
            <p>
              Học phí hiện tại: <strong>{feePerSession !== null ? formatCurrency(feePerSession) : 'Đang tải...'} / buổi</strong>
            </p>
            <button type="button" className="attendance-action-button attendance-action-button--edit" onClick={openFeeEditor}>
              Sửa
            </button>
          </div>
        ) : (
          <div className="inline-actions-row">
            <label className="attendance-class-select">
              Học phí mỗi buổi (đ)
              <input
                type="number"
                min={0}
                step={1000}
                value={feeInput}
                onChange={(event) => setFeeInput(event.target.value)}
                aria-label="Học phí mỗi buổi"
              />
            </label>
            <button type="button" className="button-secondary" onClick={closeFeeEditor} disabled={feeSaving}>
              Hủy
            </button>
            <button
              type="button"
              className="attendance-action-button attendance-action-button--confirm"
              onClick={requestFeeConfirm}
              disabled={feeSaving}
            >
              Lưu
            </button>
          </div>
        )}

        {feeError ? <p className="attendance-feedback attendance-feedback--error">{feeError}</p> : null}
      </section>

      <section className="card">
        <div className="card-header">
          <h3>Học phí theo tháng</h3>
        </div>

        <label className="attendance-class-select">
          Chọn tháng
          <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Chọn tháng tính học phí" />
        </label>

        {summaryError ? <p className="attendance-feedback attendance-feedback--error">{summaryError}</p> : null}
        {loading ? <p className="attendance-empty-state">Đang tải học phí...</p> : null}

        {!loading && rows.length > 0 ? (
          <>
            <p className="report-count">
              Đã đóng: {rows.filter((row) => row.paid).length}/{rows.length} học viên
            </p>
            <div className="attendance-table-wrapper">
              <table className="attendance-table">
                <thead>
                  <tr>
                    <th>Học viên</th>
                    <th>Lớp</th>
                    <th>Số buổi</th>
                    <th>Học phí</th>
                    <th>Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const key = `${row.className}|${row.studentName}`
                    const isUpdating = updatingPaymentKey === key

                    return (
                      <tr key={key}>
                        <td>{row.studentName}</td>
                        <td>{row.className}</td>
                        <td>{row.sessions}</td>
                        <td>{formatCurrency(row.amount)}</td>
                        <td>
                          {row.paid ? (
                            <div className="student-list-actions">
                              <span className="student-status-badge">Đã đóng</span>
                              <button
                                type="button"
                                className="student-inactive-button"
                                onClick={() => void togglePaymentStatus(row)}
                                disabled={isUpdating}
                              >
                                {isUpdating ? 'Đang lưu...' : 'Đánh dấu chưa đóng'}
                              </button>
                            </div>
                          ) : (
                            <div className="student-list-actions">
                              <span className="student-inactive-chip">Chưa đóng</span>
                              <button
                                type="button"
                                className="student-active-button"
                                onClick={() => void togglePaymentStatus(row)}
                                disabled={isUpdating}
                              >
                                {isUpdating ? 'Đang lưu...' : 'Đánh dấu đã đóng'}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="report-count">Tổng cộng: {formatCurrency(totalAmount)}</p>
          </>
        ) : null}

        {!loading && rows.length === 0 && !summaryError ? (
          <p className="attendance-empty-state">Không có dữ liệu điểm danh có mặt trong tháng đã chọn.</p>
        ) : null}
      </section>

      {showFeeConfirmModal ? (
        <div className="modal-overlay">
          <div className="modal-card">
            <h4>Xác nhận thay đổi học phí</h4>
            <p>
              Học phí mỗi buổi sẽ đổi từ {feePerSession !== null ? formatCurrency(feePerSession) : formatCurrency(0)} sang{' '}
              {formatCurrency(Number(feeInput))}.
            </p>
            <div className="modal-actions">
              <button type="button" className="modal-close-button" onClick={() => setShowFeeConfirmModal(false)} disabled={feeSaving}>
                Hủy
              </button>
              <button type="button" onClick={() => void confirmFeeUpdate()} disabled={feeSaving}>
                {feeSaving ? 'Đang lưu...' : 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

export default TuitionSection
