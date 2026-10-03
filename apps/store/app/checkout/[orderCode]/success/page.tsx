"use client";

import { Badge, Button, cn, Skeleton, TicketCard } from "@repo/ui";
import { Check } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { useMyOrder } from "@/features/account/hooks";
import { CheckoutShell } from "@/features/checkout/CheckoutShell";
import { CheckoutSteps } from "@/features/checkout/CheckoutSteps";
import { usePaymentMethods } from "@/features/checkout/pay-hooks";

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

  // Mismo criterio que la pantalla de pago: sin elección de medio no hay pasos.
  const { data: methods } = usePaymentMethods();
  const steps = (methods?.length ?? 0) > 1 ? <CheckoutSteps current={3} complete /> : undefined;

  if (isLoading) {
    return (
      <CheckoutShell header={steps} className="max-w-3xl">
        <Skeleton className="h-64 w-full" />
      </CheckoutShell>
    );
  }

  if (!order) return null;

  const tickets = order.tickets ?? [];

  return (
    <CheckoutShell header={steps} className="max-w-3xl">
      <div className="flex flex-col items-center gap-3 pb-2 text-center">
        <span
          aria-hidden
          className="success-pop flex h-16 w-16 items-center justify-center rounded-full bg-[var(--color-mint)] text-[var(--color-bg,#09090b)] shadow-[var(--glow-mint)]"
        >
          <Check className="h-8 w-8" strokeWidth={3} />
        </span>
        {order.is_guest && <Badge variant="accent">Invitado</Badge>}
        <h1 className="font-display text-2xl font-bold text-[var(--color-mint-text)] sm:text-3xl">
          {order.is_guest ? "¡Estás en la lista!" : "¡Ya estás dentro!"}
        </h1>
        <p className="max-w-md text-[var(--color-text-muted)]">
          {order.is_guest
            ? `Tu entrada de invitado llegó a ${order.buyer_email}. También está aquí.`
            : `Te enviamos tus entradas a ${order.buyer_email}. También están aquí.`}
        </p>
      </div>

      <div className={cn(tickets.length === 1 ? "mx-auto w-full max-w-md" : "grid gap-4 md:grid-cols-2")}>
        {tickets.map((ticket) =>
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

      <Link href="/account/tickets" className="mx-auto w-full max-w-md">
        <Button size="lg" className="w-full">
          Ver mis entradas
        </Button>
      </Link>
    </CheckoutShell>
  );
}
