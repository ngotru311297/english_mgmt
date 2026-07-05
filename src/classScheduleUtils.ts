type ScheduleBlock = {
  day: string
  startTime: string
  endTime: string
}

const dayAliasMap: Record<string, string> = {
  'thứ 2': 'Thứ 2',
  'thu 2': 'Thứ 2',
  't2': 'Thứ 2',
  '2': 'Thứ 2',
  'thứ 3': 'Thứ 3',
  'thu 3': 'Thứ 3',
  't3': 'Thứ 3',
  '3': 'Thứ 3',
  'thứ 4': 'Thứ 4',
  'thu 4': 'Thứ 4',
  't4': 'Thứ 4',
  '4': 'Thứ 4',
  'thứ 5': 'Thứ 5',
  'thu 5': 'Thứ 5',
  't5': 'Thứ 5',
  '5': 'Thứ 5',
  'thứ 6': 'Thứ 6',
  'thu 6': 'Thứ 6',
  't6': 'Thứ 6',
  '6': 'Thứ 6',
  'thứ 7': 'Thứ 7',
  'thu 7': 'Thứ 7',
  't7': 'Thứ 7',
  '7': 'Thứ 7',
  'cn': 'CN',
  'chủ nhật': 'CN',
  'chu nhat': 'CN',
  'cnhat': 'CN',
  '8': 'CN',
}

const dayMatchPattern = /(thứ\s*[2-7]|thu\s*[2-7]|chủ nhật|chu nhat|cnhat|cn|[2-7])/i
const timeRangePattern = /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/

function normalizeDayToken(token: string): string | null {
  const raw = token.trim().toLowerCase()
  if (!raw) return null

  if (raw.startsWith('thứ ') || raw.startsWith('thu ')) {
    const maybeNum = raw.replace('thứ ', '').replace('thu ', '').trim()
    return dayAliasMap[maybeNum] ?? null
  }

  return dayAliasMap[raw] ?? null
}

export function toMinutes(value: string): number {
  const [hourStr, minuteStr] = value.split(':')
  const hour = Number(hourStr)
  const minute = Number(minuteStr)

  if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
    return Number.NaN
  }

  return hour * 60 + minute
}

export function normalizeTimeValue(value: string): string {
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

export function isValidTimeRange(startTime: string, endTime: string): boolean {
  const start = toMinutes(normalizeTimeValue(startTime))
  const end = toMinutes(normalizeTimeValue(endTime))

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false
  }

  return start < end
}

export function extractScheduleDays(schedule: string): string[] {
  if (!schedule || !schedule.trim()) return []

  const entries = schedule
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const days = new Set<string>()
  for (const entry of entries) {
    const normalized = entry.toLowerCase().replace(/[:|]/g, ' ')
    const match = normalized.match(dayMatchPattern)
    if (!match) continue

    const dayToken = match[1]
    const mapped = normalizeDayToken(dayToken)
    if (mapped) {
      days.add(mapped)
    }
  }

  return Array.from(days)
}

export function parseScheduleBlocks(schedule: string, fallbackStartTime = '', fallbackEndTime = ''): ScheduleBlock[] {
  if (!schedule || !schedule.trim()) return []

  const entries = schedule
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const blocks: ScheduleBlock[] = []

  for (const entry of entries) {
    const normalizedEntry = entry.toLowerCase().replace(/[:|]/g, ' ')
    const dayMatch = normalizedEntry.match(dayMatchPattern)
    if (!dayMatch) continue

    const day = normalizeDayToken(dayMatch[1])
    if (!day) continue

    const timeMatch = entry.match(timeRangePattern)
    const startTime = normalizeTimeValue(timeMatch?.[1] ?? fallbackStartTime)
    const endTime = normalizeTimeValue(timeMatch?.[2] ?? fallbackEndTime)

    if (!startTime || !endTime || !isValidTimeRange(startTime, endTime)) {
      continue
    }

    blocks.push({ day, startTime, endTime })
  }

  return blocks
}

export function serializeScheduleBlocks(blocks: ScheduleBlock[]): string {
  return blocks
    .map((block) => ({
      day: block.day.trim(),
      startTime: normalizeTimeValue(block.startTime),
      endTime: normalizeTimeValue(block.endTime),
    }))
    .filter((block) => block.day && block.startTime && block.endTime && isValidTimeRange(block.startTime, block.endTime))
    .map((block) => `${block.day} ${block.startTime}-${block.endTime}`)
    .join(', ')
}

export function getScheduleBounds(blocks: ScheduleBlock[]): { startTime: string; endTime: string } {
  const validBlocks = blocks
    .map((block) => ({
      startTime: normalizeTimeValue(block.startTime),
      endTime: normalizeTimeValue(block.endTime),
    }))
    .filter((block) => isValidTimeRange(block.startTime, block.endTime))

  if (validBlocks.length === 0) {
    return { startTime: '', endTime: '' }
  }

  let earliestStart = validBlocks[0].startTime
  let latestEnd = validBlocks[0].endTime

  for (const block of validBlocks) {
    if (toMinutes(block.startTime) < toMinutes(earliestStart)) {
      earliestStart = block.startTime
    }
    if (toMinutes(block.endTime) > toMinutes(latestEnd)) {
      latestEnd = block.endTime
    }
  }

  return { startTime: earliestStart, endTime: latestEnd }
}

export function hasScheduleConflict(
  candidate: { schedule: string; startTime: string; endTime: string },
  classes: Array<{ id: number; schedule: string; startTime: string; endTime: string }>,
  currentIndex: number | null = null,
): boolean {
  const candidateBlocks = parseScheduleBlocks(candidate.schedule, candidate.startTime, candidate.endTime)
  if (candidateBlocks.length === 0) {
    return false
  }

  return classes.some((existingClass, index) => {
    if (currentIndex !== null && index === currentIndex) return false

    const existingBlocks = parseScheduleBlocks(existingClass.schedule, existingClass.startTime, existingClass.endTime)
    if (existingBlocks.length === 0) {
      return false
    }

    return candidateBlocks.some((candidateBlock) => {
      return existingBlocks.some((existingBlock) => {
        if (candidateBlock.day !== existingBlock.day) {
          return false
        }

        const candidateStart = toMinutes(candidateBlock.startTime)
        const candidateEnd = toMinutes(candidateBlock.endTime)
        const existingStart = toMinutes(existingBlock.startTime)
        const existingEnd = toMinutes(existingBlock.endTime)

        return candidateStart < existingEnd && existingStart < candidateEnd
      })
    })
  })
}
