"use client";

import {
  Button,
  ConfirmDialog,
  IconButton,
  Input,
  ScanResult,
  type ConfirmDialogValues,
  type ScanOutcome,
} from "@repo/ui";
import { Clock, Keyboard, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { scannerClosedMessage, useDoorEvent } from "@/features/checkin/door";
import { useCheckIn } from "@/features/checkin/hooks";
import { useScanner } from "@/features/checkin/useScanner";
import { apiErrorMessage, useUndoCheckIn, type UndoCheckInReasonCode } from "@/features/events/hooks";
import { useSession } from "@/lib/session";

interface ResultState {
  outcome: ScanOutcome;
  title: string;
  subtitle?: string;
  details?: { label: string; value: string }[];
}

const ERROR_MESSAGES: Record<string, string> = {
  TICKET_ALREADY_USED: "Ya ingresó",
  TICKET_WRONG_EVENT: "Entrada de otro evento",
  TICKET_INVALID: "No válida",
  SCANNER_CLOSED: "Escáner cerrado",
};

const UNDO_REASONS: { value: UndoCheckInReasonCode; label: string }[] = [
  { value: "MISTAKE", label: "Escaneo por error" },
  { value: "DOUBLE_SCAN", label: "Doble escaneo" },
  { value: "OTHER", label: "Otro" },
];

export default function ScannerPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  // Endpoint del escáner (no /org/events/): también lo puede leer seguridad.
  const { data: event, refetch: refetchEvent } = useDoorEvent(eventId);
  const { role } = useSession();
  const isSecurity = role === "security";
  // Seguridad fuera de horario: pantalla de "escáner cerrado", sin cámara.
  const scannerClosed = isSecurity && !!event && !event.scanner_is_open;
  const checkIn = useCheckIn();
  const undoCheckIn = useUndoCheckIn();
  const [result, setResult] = useState<ResultState | null>(null);
  const [undoCode, setUndoCode] = useState<string | null>(null);
  const [undoOpen, setUndoOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [sessionCount, setSessionCount] = useState(0);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vibrate = (pattern: number | number[]) => {
    if ("vibrate" in navigator) navigator.vibrate(pattern);
  };

  const runCheckIn = useCallback(
    async (payload: { qrPayload?: string; manualCode?: string }) => {
      try {
        const data = await checkIn.mutateAsync({ ...payload, eventId });
        vibrate(120);
        setSessionCount((n) => n + 1);
        setUndoCode(null);
        setResult({
          outcome: "valid",
          title: "Adelante",
          subtitle: data?.ticket.ticket_type_name,
          details: [{ label: "Titular", value: data?.ticket.holder_name || "—" }],
        });
        autoCloseRef.current = setTimeout(() => setResult(null), 2000);
      } catch (err) {
        const shape = err as { error?: { code?: string; details?: Record<string, string> } };
        const code = shape.error?.code ?? "TICKET_INVALID";
        if (code === "SCANNER_CLOSED") refetchEvent();
        vibrate([100, 50, 100]);
        setUndoCode(code === "TICKET_ALREADY_USED" ? shape.error?.details?.ticket_code ?? null : null);
        setResult({
          outcome: code === "TICKET_ALREADY_USED" ? "already_used" : "invalid",
          title: ERROR_MESSAGES[code] ?? "No válida",
          subtitle:
            code === "TICKET_ALREADY_USED" && shape.error?.details?.checked_in_at
              ? `A las ${new Date(shape.error.details.checked_in_at).toLocaleTimeString("es-PE")}`
              : code === "SCANNER_CLOSED"
                ? (shape as { error?: { message?: string } }).error?.message
                : shape.error?.details?.event_title,
        });
      }
    },
    [checkIn, eventId, refetchEvent]
  );

  const handleUndo = async (values: ConfirmDialogValues) => {
    if (!undoCode) return;
    await undoCheckIn.mutateAsync(
      {
        code: undoCode,
        body: { reason_code: values.reasonCode as UndoCheckInReasonCode, reason: values.reason },
      },
      {
        onSuccess: () => {
          setUndoOpen(false);
          setUndoCode(null);
          setResult({
            outcome: "valid",
            title: "Ingreso deshecho",
            subtitle: "La entrada vuelve a ser válida.",
          });
        },
      }
    );
  };

  const { videoRef, supported, error: cameraError } = useScanner({
    enabled: !result && !manualOpen && !scannerClosed,
    onDetect: (payload) => runCheckIn({ qrPayload: payload }),
  });

  useEffect(
    () => () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    },
    []
  );

  if (scannerClosed && !result) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[var(--color-warning-soft)] p-[var(--space-6)] text-center">
        <Clock className="h-20 w-20 text-[var(--color-warning)]" aria-hidden />
        <div className="flex flex-col gap-2">
          <h2 className="font-display text-3xl font-bold text-[var(--color-warning)]">Escáner cerrado</h2>
          <p className="text-lg">{event.title}</p>
          <p className="text-[var(--color-text-muted)]">{scannerClosedMessage(event)}</p>
        </div>
        <Button size="lg" variant="secondary" onClick={() => router.push("/scan")}>
          Volver a mis eventos
        </Button>
      </div>
    );
  }

  if (result) {
    return (
      <>
        <ScanResult
          outcome={result.outcome}
          title={result.title}
          subtitle={result.subtitle}
          details={result.details}
          onDismiss={() => {
            setResult(null);
            setUndoCode(null);
          }}
          onUndo={undoCode && !isSecurity ? () => setUndoOpen(true) : undefined}
        />
        <ConfirmDialog
          open={undoOpen}
          onOpenChange={setUndoOpen}
          title="Deshacer el ingreso"
          description="La entrada volverá a ser válida y podrá escanearse de nuevo. El ingreso anterior queda en la bitácora."
          reasons={UNDO_REASONS}
          confirmLabel="Deshacer ingreso"
          loading={undoCheckIn.isPending}
          error={undoCheckIn.error ? apiErrorMessage(undoCheckIn.error) : undefined}
          onConfirm={handleUndo}
        />
      </>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-black text-white">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-4">
        <IconButton label="Cerrar" variant="ghost" onClick={() => router.push("/scan")}>
          <X className="h-6 w-6" />
        </IconButton>
        <div className="rounded-[var(--radius-full)] bg-black/50 px-3 py-1 text-sm">
          {event?.title} · {sessionCount} ingresados
        </div>
        <IconButton label="Ingreso manual" variant="ghost" onClick={() => setManualOpen(true)}>
          <Keyboard className="h-6 w-6" />
        </IconButton>
      </div>

      {!manualOpen && (
        <>
          {supported ? (
            <video ref={videoRef} className="h-full w-full flex-1 object-cover" muted playsInline />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <p>Tu navegador no puede leer el QR automáticamente.</p>
              <Button onClick={() => setManualOpen(true)}>Ingresar código manualmente</Button>
            </div>
          )}
          {cameraError && <p className="absolute bottom-24 w-full text-center text-sm text-red-400">{cameraError}</p>}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-64 w-64 animate-pulse rounded-[var(--radius-lg)] border-4 border-white/70" />
          </div>
        </>
      )}

      {manualOpen && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
          <p className="text-lg font-medium">Ingresa el código de la entrada</p>
          <Input
            autoFocus
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="K7M3QPXR2ND4JHVB9TZAWY"
            className="text-center font-mono uppercase"
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setManualOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={checkIn.isPending}
              disabled={!manualCode.trim()}
              onClick={() => {
                runCheckIn({ manualCode: manualCode.trim() });
                setManualCode("");
                setManualOpen(false);
              }}
            >
              Validar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
