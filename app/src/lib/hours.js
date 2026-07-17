// Small formatting helper shared by the Settings program editor.
export function hourLabel(hour) {
  if (hour === null || hour === undefined) return ''
  const period = hour < 12 ? 'AM' : 'PM'
  const displayHour = hour % 12 === 0 ? 12 : hour % 12
  return `${displayHour}:00 ${period}`
}

export const HOURS = Array.from({ length: 24 }, (_, h) => h)
