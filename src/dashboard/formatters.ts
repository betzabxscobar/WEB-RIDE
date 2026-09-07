export function money(value: number): string {
  return new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD' }).format(value)
}

export function dateTime(value: string): string {
  return new Intl.DateTimeFormat('es-EC', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(value))
}

export function shortDate(value: string): string {
  if (!value) return 'Sin fecha'
  return new Intl.DateTimeFormat('es-EC', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value))
}

export function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}
