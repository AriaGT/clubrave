import QRCode from "qrcode";

/**
 * Afiche imprimible con el QR del evento (para pegar en la puerta).
 *
 * Se dibuja en un canvas: fondo grafito con resplandor violeta (paleta NOCTA),
 * el QR sobre una placa clara con módulos redondeados en violeta y marcas de
 * esquina al estilo del logo. La placa clara y el contraste alto (violeta
 * #5b21b6 sobre blanco) más corrección de errores "H" mantienen el código
 * escaneable aun impreso en una hoja común.
 */

const W = 1240; // A5 vertical a 150 dpi; escala bien a A4 / A3
const H = 1754;

const BG = "#09090b";
const ACCENT = "#7c3aed";
const ACCENT_TEXT = "#c4b5fd";
const QR_INK = "#5b21b6";
const TEXT = "#f4f4f5";
const MUTED = "#a1a1ab";

export interface DoorPosterInput {
  url: string;
  title: string;
  startsAt: string;
  venue?: string;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: (px: number) => string, start: number, min: number) {
  let size = start;
  ctx.font = font(size);
  while (ctx.measureText(text).width > maxWidth && size > min) {
    size -= 2;
    ctx.font = font(size);
  }
  return size;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/\s*\S*$/, "") + "…";
    return kept;
  }
  return lines;
}

/** Dibuja el QR con módulos redondeados y ojos (finder patterns) estilizados. */
function drawQr(ctx: CanvasRenderingContext2D, url: string, x: number, y: number, size: number) {
  const qr = QRCode.create(url, { errorCorrectionLevel: "H" });
  const n = qr.modules.size;
  const data = qr.modules.data;
  const cell = size / n;
  const dark = (r: number, c: number) => r >= 0 && c >= 0 && r < n && c < n && !!data[r * n + c];
  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  ctx.fillStyle = QR_INK;
  // Módulos de datos: puntos redondeados que se "funden" con vecinos.
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c) || inFinder(r, c)) continue;
      const px = x + c * cell;
      const py = y + r * cell;
      const rad = cell * 0.42;
      const tl = dark(r - 1, c) || dark(r, c - 1) ? 0 : rad;
      const tr = dark(r - 1, c) || dark(r, c + 1) ? 0 : rad;
      const br = dark(r + 1, c) || dark(r, c + 1) ? 0 : rad;
      const bl = dark(r + 1, c) || dark(r, c - 1) ? 0 : rad;
      ctx.beginPath();
      ctx.roundRect(px - 0.4, py - 0.4, cell + 0.8, cell + 0.8, [tl, tr, br, bl]);
      ctx.fill();
    }
  }
  // Ojos: marco redondeado + centro sólido en el violeta de marca.
  const eye = (r0: number, c0: number) => {
    const ex = x + c0 * cell;
    const ey = y + r0 * cell;
    ctx.fillStyle = QR_INK;
    roundRect(ctx, ex, ey, cell * 7, cell * 7, cell * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    roundRect(ctx, ex + cell, ey + cell, cell * 5, cell * 5, cell * 1.3);
    ctx.fill();
    ctx.fillStyle = ACCENT;
    roundRect(ctx, ex + cell * 2, ey + cell * 2, cell * 3, cell * 3, cell * 0.9);
    ctx.fill();
  };
  eye(0, 0);
  eye(0, n - 7);
  eye(n - 7, 0);
}

function drawCorners(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, len: number) {
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts: [number, number, number, number][] = [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ];
  for (const [px, py, dx, dy] of pts) {
    ctx.beginPath();
    ctx.moveTo(px, py + dy * len);
    ctx.lineTo(px, py);
    ctx.lineTo(px + dx * len, py);
    ctx.stroke();
  }
}

export async function renderDoorPoster(input: DoorPosterInput): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");

  const display = (px: number) => `800 ${px}px "Plus Jakarta Sans", "Inter", system-ui, sans-serif`;
  const sans = (px: number, weight = 500) => `${weight} ${px}px "Inter", system-ui, -apple-system, sans-serif`;
  try {
    await Promise.all([document.fonts.load(display(40)), document.fonts.load(sans(40)), document.fonts.load(sans(40, 700))]);
  } catch {
    /* si las fuentes no cargan, se usan las de respaldo */
  }

  // Fondo + resplandores violetas.
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  const glow = (cx: number, cy: number, r: number, alpha: number) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(124,58,237,${alpha})`);
    g.addColorStop(1, "rgba(124,58,237,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
  glow(W * 0.5, 120, 900, 0.45);
  glow(W * 0.5, H * 0.62, 760, 0.28);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // Marca superior.
  ctx.fillStyle = ACCENT_TEXT;
  ctx.font = sans(34, 700);
  ctx.letterSpacing = "10px";
  ctx.fillText("CLUB RAVE", W / 2, 120);
  ctx.letterSpacing = "0px";

  // Título del evento: hasta 3 líneas, reduciendo la letra hasta que entre completo.
  ctx.fillStyle = TEXT;
  const maxTitle = W - 200;
  let titleSize = 104;
  let lines: string[] = [];
  for (; titleSize >= 52; titleSize -= 4) {
    ctx.font = display(titleSize);
    lines = wrapLines(ctx, input.title, maxTitle, 4);
    const fitsWidth = lines.every((l) => ctx.measureText(l).width <= maxTitle);
    if (fitsWidth && (lines.length <= 2 || (lines.length === 3 && titleSize <= 76))) break;
  }
  lines = lines.slice(0, 3);
  ctx.font = display(titleSize);
  let y = 250;
  for (const line of lines) {
    ctx.fillText(line, W / 2, y);
    y += titleSize * 1.12;
  }

  // Fecha y lugar.
  const when = new Date(input.startsAt).toLocaleString("es-PE", { dateStyle: "full", timeStyle: "short" });
  ctx.fillStyle = MUTED;
  ctx.font = sans(38, 500);
  y += 10;
  ctx.fillText(when.charAt(0).toUpperCase() + when.slice(1), W / 2, y);
  if (input.venue) {
    y += 54;
    fitText(ctx, input.venue, W - 200, (px) => sans(px, 500), 38, 26);
    ctx.fillText(input.venue, W / 2, y);
  }

  // Placa del QR.
  const plate = 700;
  const px = (W - plate) / 2;
  const py = Math.max(y + 80, 600);
  ctx.save();
  ctx.shadowColor = "rgba(124,58,237,0.55)";
  ctx.shadowBlur = 90;
  ctx.fillStyle = "#ffffff";
  roundRect(ctx, px, py, plate, plate, 56);
  ctx.fill();
  ctx.restore();
  const pad = 64;
  drawQr(ctx, input.url, px + pad, py + pad, plate - pad * 2);
  drawCorners(ctx, px - 36, py - 36, plate + 72, plate + 72, 90);

  // Llamado a la acción.
  let cy = py + plate + 150;
  ctx.fillStyle = TEXT;
  fitText(ctx, "Escanea y compra tu entrada", W - 160, display, 76, 48);
  ctx.fillText("Escanea y compra tu entrada", W / 2, cy);
  cy += 62;
  ctx.fillStyle = MUTED;
  ctx.font = sans(32, 500);
  ctx.fillText("Apunta la cámara de tu celular al código", W / 2, cy);

  // Pie: enlace legible por si no se puede escanear.
  const shown = input.url.replace(/^https?:\/\//, "");
  ctx.fillStyle = ACCENT_TEXT;
  fitText(ctx, shown, W - 160, (p) => `600 ${p}px "JetBrains Mono", ui-monospace, monospace`, 34, 22);
  ctx.fillText(shown, W / 2, H - 56);

  return canvas;
}

export async function downloadDoorPoster(input: DoorPosterInput & { slug: string }) {
  const canvas = await renderDoorPoster(input);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No se pudo generar la imagen");
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = `qr-puerta-${input.slug}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
