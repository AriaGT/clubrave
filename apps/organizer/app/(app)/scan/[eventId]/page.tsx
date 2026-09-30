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
import { Keyboard, X } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useCheckIn } from "@/features/checkin/hooks";
import { useScanner } from "@/features/checkin/useScanner";
import { apiErrorMessage, useEvent, useUndoCheckIn, type UndoCheckInReasonCode } from "@/features/events/hooks";

interface ResultState {
  outcome: ScanOutcome;
  title: string;
  subtitle?: string;
  details?: { label: string; value: string }[];
  tag?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  TICKET_ALREADY_USED: "Ya ingresó",
  TICKET_WRONG_EVENT: "Entrada de otro evento",
  TICKET_INVALID: "No válida",
};

const UNDO_REASONS: { value: UndoCheckInReasonCode; label: string }[] = [
  { value: "MISTAKE", label: "Escaneo por error" },
  { value: "DOUBLE_SCAN", label: "Doble escaneo" },
  { value: "OTHER", label: "Otro" },
];

export default function ScannerPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const { data: event } = useEvent(eventId);
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
        const isGuest = data?.ticket.is_guest === true;
        setResult({
          outcome: "valid",
          title: "Adelante",
          subtitle: data?.ticket.ticket_type_name,
          tag: isGuest ? "Invitado" : undefined,
          details: [
            ...(isGuest ? [{ label: "Zona", value: data?.ticket.ticket_type_name ?? "—" }] : []),
            { label: "Titular", value: data?.ticket.holder_name || "—" },
          ],
        });
        autoCloseRef.current = setTimeout(() => setResult(null), 2000);
      } catch (err) {
        const shape = err as {
          error?: { code?: string; details?: Record<string, string | boolean | null> };
        };
        const code = shape.error?.code ?? "TICKET_INVALID";
        vibrate([100, 50, 100]);
        const details = shape.error?.details ?? {};
        const text = (key: string) => (typeof details[key] === "string" ? (details[key] as string) : undefined);
        const alreadyUsed = code === "TICKET_ALREADY_USED";
        setUndoCode(alreadyUsed ? text("ticket_code") ?? null : null);
        setResult({
          outcome: alreadyUsed ? "already_used" : "invalid",
          title: ERROR_MESSAGES[code] ?? "No válida",
          subtitle:
            alreadyUsed && text("checked_in_at")
              ? `A las ${new Date(text("checked_in_at")!).toLocaleTimeString("es-PE")}`
              : text("event_title"),
          tag: alreadyUsed && details.is_guest === true ? "Invitado" : undefined,
          details:
            alreadyUsed && text("ticket_type_name")
              ? [{ label: "Entrada / zona", value: text("ticket_type_name")! }]
              : undefined,
        });
      }
    },
    [checkIn, eventId]
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
    enabled: !result && !manualOpen,
    onDetect: (payload) => runCheckIn({ qrPayload: payload }),
  });

  useEffect(
    () => () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    },
    []
  );

  if (result) {
    return (
      <>
        <ScanResult
          outcome={result.outcome}
          title={result.title}
          subtitle={result.subtitle}
          details={result.details}
          tag={result.tag}
          onDismiss={() => {
            setResult(null);
            setUndoCode(null);
          }}
          onUndo={undoCode ? () => setUndoOpen(true) : undefined}
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
