"use client";

import { BrowserQRCodeReader, type IScannerControls } from "@zxing/browser";
import { NotFoundException } from "@zxing/library";
import { useCallback, useEffect, useRef, useState } from "react";

export interface UseScannerOptions {
  onDetect: (payload: string) => void;
  enabled: boolean;
}

/**
 * Usa la API nativa `BarcodeDetector` cuando existe (Android/Chrome/Edge
 * con soporte habilitado) por ser más liviana. Si no existe (p. ej.
 * Safari/iOS, que nunca la implementó, o Edge/Chrome de escritorio sin
 * soporte), cae a `@zxing/browser` — decodifica los frames del mismo
 * `<video>` en JS puro, sin depender de ninguna API del navegador. La
 * entrada manual del código sigue disponible a un toque en ambos casos
 * (ver §10.5).
 */
export function useScanner({ onDetect, enabled }: UseScannerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported] = useState(true); // con el respaldo de ZXing, la cámara siempre puede intentarse
  const [error, setError] = useState<string | null>(null);
  const lastCodeRef = useRef<{ value: string; at: number } | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const handleDetected = useCallback(
    (value: string) => {
      const now = Date.now();
      const last = lastCodeRef.current;
      if (last && last.value === value && now - last.at < 3000) return; // antirrebote 3s
      lastCodeRef.current = { value, at: now };
      onDetect(value);
    },
    [onDetect]
  );

  useEffect(() => {
    if (!enabled) return;

    let stream: MediaStream | null = null;
    let detectorLoop: number | null = null;
    let zxingControls: IScannerControls | null = null;
    let cancelled = false;

    async function startNativeDetector(video: HTMLVideoElement) {
      // @ts-expect-error — BarcodeDetector aún no está en los tipos de lib.dom
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const tick = async () => {
        if (cancelled) return;
        try {
          const codes = await detector.detect(video);
          if (codes.length > 0) handleDetected(codes[0].rawValue);
        } catch {
          // frame no decodificable: se reintenta en el siguiente tick
        }
        detectorLoop = window.setTimeout(tick, 300);
      };
      tick();
    }

    async function startZxingFallback(video: HTMLVideoElement) {
      const reader = new BrowserQRCodeReader();
      zxingControls = await reader.decodeFromVideoElement(video, (result, err) => {
        if (cancelled) return;
        if (result) {
          handleDetected(result.getText());
          return;
        }
        // NotFoundException se dispara en cada frame sin QR: es ruido normal, no un error real.
        if (err && !(err instanceof NotFoundException)) {
          setError(err.message);
        }
      });
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();

        if ("wakeLock" in navigator) {
          try {
            wakeLockRef.current = await navigator.wakeLock.request("screen");
          } catch {
            // el wake lock es una mejora, no un requisito
          }
        }

        if ("BarcodeDetector" in window) {
          await startNativeDetector(videoRef.current);
        } else {
          await startZxingFallback(videoRef.current);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo acceder a la cámara.");
      }
    }

    start();

    return () => {
      cancelled = true;
      if (detectorLoop) clearTimeout(detectorLoop);
      zxingControls?.stop();
      stream?.getTracks().forEach((t) => t.stop());
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [enabled, handleDetected]);

  return { videoRef, supported, error };
}
