const currentClassYear = new Date().getFullYear().toString()

export const normalizeClassName = (value: string) => {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''

  const prefix = `${currentClassYear}_`
  return trimmed.startsWith(prefix) ? trimmed : `${prefix}${trimmed}`
}

export const stripClassYearPrefix = (value: string) => {
  const prefix = `${currentClassYear}_`
  return value.startsWith(prefix) ? value.slice(prefix.length) : value
}

export { currentClassYear }
