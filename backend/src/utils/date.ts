const VN_OFFSET_MS = 7 * 60 * 60 * 1000

export function getVietnamDateText(date: Date = new Date()): string {
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10)
}
