/** Las fechas se muestran en hora de Lima aunque el servidor corra en UTC. */
const TZ = "America/Lima";

export function dayNumber(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", timeZone: TZ });
}

export function monthShort(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { month: "short", timeZone: TZ }).replace(".", "");
}

export function weekdayShort(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { weekday: "short", timeZone: TZ }).replace(".", "");
}

export function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

export function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  });
}

export function priceLabel(price: string | null | undefined, currency = "PEN") {
  if (!price) return null;
  const symbol = currency === "PEN" ? "S/" : currency;
  return `Desde ${symbol} ${Number(price).toFixed(2)}`;
}
