import { describe, expect, it } from 'vitest'
import { hasScheduleConflict } from './classScheduleUtils'

describe('hasScheduleConflict', () => {
  it('detects overlapping time on the same day', () => {
    const classes = [
      { id: 1, schedule: 'Thứ 2 18:00-20:00, Thứ 4 18:00-20:00', startTime: '18:00', endTime: '20:00' },
    ]

    const candidate = { schedule: 'Thứ 2 19:00-21:00', startTime: '19:00', endTime: '21:00' }

    expect(hasScheduleConflict(candidate, classes)).toBe(true)
  })

  it('allows non-overlapping time on the same day', () => {
    const classes = [
      { id: 1, schedule: 'Thứ 2 18:00-20:00, Thứ 4 18:00-20:00', startTime: '18:00', endTime: '20:00' },
    ]

    const candidate = { schedule: 'Thứ 2 20:00-21:00', startTime: '20:00', endTime: '21:00' }

    expect(hasScheduleConflict(candidate, classes)).toBe(false)
  })

  it('ignores different days', () => {
    const classes = [
      { id: 1, schedule: 'Thứ 2 18:00-20:00', startTime: '18:00', endTime: '20:00' },
    ]

    const candidate = { schedule: 'Thứ 3 19:00-21:00', startTime: '19:00', endTime: '21:00' }

    expect(hasScheduleConflict(candidate, classes)).toBe(false)
  })

  it('rejects end time that is not later than start time', () => {
    expect(hasScheduleConflict({ schedule: 'Thứ 2 20:00-20:00', startTime: '20:00', endTime: '20:00' }, [])).toBe(false)
  })
})
