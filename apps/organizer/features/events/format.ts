/** Días de calendario entre hoy y la fecha (negativo si ya pasó). */
function daysUntil(date: string): number {
  const start = new Date(date);
  const today = new Date();
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((startDay - todayDay) / 86_400_000);
}

/** «Hoy», «Mañana», «En 5 días», «Finalizado»: cuánto falta, de un vistazo. */
export function countdownLabel(startsAt: string): string {
  const days = daysUntil(startsAt);
  if (days < 0) return "Finalizado";
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days} días`;
}

export function isToday(startsAt: string): boolean {
  return daysUntil(startsAt) === 0;
}

// Sin hora de fin, un evento se da por terminado 12 h después de empezar.
const DEFAULT_DURATION_MS = 12 * 60 * 60 * 1000;

/** Sigue vigente: no empezó aún o está en curso. */
export function isUpcomingOrOngoing(event: { starts_at: string; ends_at?: string | null }): boolean {
  const end = event.ends_at
    ? new Date(event.ends_at).getTime()
    : new Date(event.starts_at).getTime() + DEFAULT_DURATION_MS;
  return end > Date.now();
}

export function shortDateLabel(startsAt: string): string {
  return new Date(startsAt).toLocaleString("es-PE", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
