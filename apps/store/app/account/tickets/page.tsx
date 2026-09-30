"use client";

import { EmptyState, Skeleton, TicketCard, type TicketCardStatus } from "@repo/ui";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

import { useMyTickets } from "@/features/account/hooks";

const TABS: { key: TicketTab; label: string }[] = [
  { key: "active", label: "Activas" },
  { key: "used", label: "Usadas" },
  { key: "expired", label: "Vencidas" },
  { key: "void", label: "Anuladas" },
];

type TicketTab = "active" | "used" | "expired" | "void";

const STATUS_MAP: Record<TicketTab, TicketCardStatus> = {
  active: "active",
  used: "used",
  expired: "expired",
  void: "void",
};

export default function AccountTicketsPage() {
  const [tab, setTab] = useState<TicketTab>("active");
  const { data, isLoading } = useMyTickets(tab);
  const [qrByTicket, setQrByTicket] = useState<Record<string, string>>({});
  const [brightMode, setBrightMode] = useState<{ code: string; qr: string } | null>(null);

  useEffect(() => {
    data?.results?.forEach((ticket) => {
      if (ticket.status === "VOID") return;
      if (qrByTicket[ticket.id]) return;
      QRCode.toDataURL(ticket.qr_payload, { margin: 1, width: 260 }).then((url) =>
        setQrByTicket((prev) => ({ ...prev, [ticket.id]: url }))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.results]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? "rounded-[var(--radius-full)] bg-[var(--color-accent)] px-3 py-1.5 text-sm text-white"
                : "rounded-[var(--radius-full)] border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text-muted)]"
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && <Skeleton className="h-80 w-full" />}

      {!isLoading && data?.results?.length === 0 && (
        <EmptyState title="No hay entradas aquí" description="Las entradas que compres aparecerán en esta lista." />
      )}

      <div className="flex flex-col gap-4">
        {data?.results?.map((ticket) => {
          const isVoid = ticket.status === "VOID";
          if (!isVoid && !qrByTicket[ticket.id]) {
            return <Skeleton key={ticket.id} className="h-80 w-full" />;
          }
          return (
            <TicketCard
              key={ticket.id}
              qrDataUrl={isVoid ? undefined : qrByTicket[ticket.id]}
              code={ticket.code}
              eventTitle={ticket.event_title ?? ""}
              dateLabel={ticket.order_code ?? ""}
              ticketTypeName={ticket.ticket_type_name ?? ""}
              holderName={ticket.holder_name ?? ""}
              status={STATUS_MAP[tab]}
              isGuest={ticket.is_guest}
              checkedInAtLabel={
                ticket.checked_in_at
                  ? new Date(ticket.checked_in_at).toLocaleTimeString("es-PE")
                  : undefined
              }
              voidReasonLabel={ticket.void_reason || undefined}
              organizationName={ticket.organization_name}
              organizationContactEmail={ticket.organization_contact_email}
              onMaxBrightness={
                tab === "active"
                  ? () => setBrightMode({ code: ticket.code, qr: qrByTicket[ticket.id] })
                  : undefined
              }
            />
          );
        })}
      </div>

      {brightMode && (
        <button
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white"
          onClick={() => setBrightMode(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brightMode.qr} alt="Código QR" width={320} height={320} />
          <span className="font-mono text-2xl tracking-wider text-black">
            {brightMode.code.match(/.{1,4}/g)?.join(" ")}
          </span>
          <span className="text-sm text-gray-500">Toca para cerrar</span>
        </button>
      )}
    </div>
  );
}
