const STUDIO_TZ = 'Asia/Almaty'

export function formatKzt(amount: number): string {
  // Non-breaking space so «₸» never wraps away from the number.
  return `${amount.toLocaleString('ru-RU')} ₸`
}

/** `2026-11-20` → `пт, 20 ноября` (a studio-local date, so formatted in UTC). */
export function formatStudioDate(isoDate: string, opts: { weekday?: boolean } = {}): string {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    ...(opts.weekday === false ? {} : { weekday: 'short' }),
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/** Parts for a compact date chip: `пт` / `20` / `нояб.` */
export function studioDateParts(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number) as [number, number, number]
  const date = new Date(Date.UTC(y, m - 1, d))
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', ...o }).format(date)
  return { weekday: fmt({ weekday: 'short' }), day: String(d), month: fmt({ month: 'short' }) }
}

export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}

/** Time of a UTC instant in studio time, e.g. `14:35`. */
export function formatStudioTime(iso: string): string {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: STUDIO_TZ, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  )
}

/** Live mask for the phone field: `+7 (777) 609-03-17`. */
export function formatPhoneInput(value: string): string {
  let digits = value.replace(/\D/g, '')
  if (digits.startsWith('8')) digits = `7${digits.slice(1)}`
  if (digits && !digits.startsWith('7')) digits = `7${digits}`
  digits = digits.slice(0, 11)
  const rest = digits.slice(1)
  if (!digits) return ''
  let out = '+7'
  if (rest.length > 0) out += ` (${rest.slice(0, 3)}`
  if (rest.length >= 3) out += ')'
  if (rest.length > 3) out += ` ${rest.slice(3, 6)}`
  if (rest.length > 6) out += `-${rest.slice(6, 8)}`
  if (rest.length > 8) out += `-${rest.slice(8, 10)}`
  return out
}
