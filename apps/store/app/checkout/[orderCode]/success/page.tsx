"use client";

import { Badge, Button, Skeleton, TicketCard } from "@repo/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { useMyOrder } from "@/features/account/hooks";

export default function CheckoutSuccessPage() {
  const { orderCode } = useParams<{ orderCode: string }>();
  const { data: order, isLoading } = useMyOrder(orderCode);
  const [qrByTicket, setQrByTicket] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!order?.tickets) return;
    order.tickets.forEach((ticket) => {
      if (qrByTicket[ticket.id]) return;
      QRCode.toDataURL(ticket.qr_payload, { margin: 1, width: 260 }).then((url) =>
        setQrByTicket((prev) => ({ ...prev, [ticket.id]: url }))
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.tickets]);

  if (isLoading) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-4 p-[var(--space-6)]">
        <Skeleton className="h-64 w-full" />
      </main>
    );
  }

  if (!order) return null;

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 p-[var(--space-6)]">
      <div className="flex flex-col items-center gap-2 text-center">
        {order.is_guest && <Badge variant="accent">Invitado</Badge>}
        <h1 className="font-display text-2xl font-bold text-[var(--color-mint-text)]">
          {order.is_guest ? "¡Estás en la lista!" : "¡Ya estás dentro!"}
        </h1>
        <p className="text-[var(--color-text-muted)]">
          {order.is_guest
            ? `Tu entrada de invitado llegó a ${order.buyer_email}. También está aquí.`
            : `Te enviamos tus entradas a ${order.buyer_email}. También están aquí.`}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {order.tickets?.map((ticket) =>
          qrByTicket[ticket.id] ? (
            <TicketCard
              key={ticket.id}
              qrDataUrl={qrByTicket[ticket.id]}
              code={ticket.code}
              eventTitle={ticket.event_title ?? ""}
              dateLabel={ticket.order_code ?? ""}
              ticketTypeName={ticket.ticket_type_name ?? ""}
              holderName={ticket.holder_name ?? ""}
              isGuest={ticket.is_guest}
              status="active"
            />
          ) : (
            <Skeleton key={ticket.id} className="h-80 w-full" />
          )
        )}
      </div>

      <Link href="/account/tickets">
        <Button size="lg" className="w-full">
          Ver mis entradas
        </Button>
      </Link>
    </main>
  );
}
