"use client";

import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  FieldError,
  FilterChips,
  IconButton,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  Skeleton,
  TopBar,
} from "@repo/ui";
import { Copy, Download, Gift, Plus, Share2, Ticket } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { apiErrorMessage, useEvent } from "@/features/events/hooks";
import {
  useGenerateGuestCodes,
  useGuestCodes,
  useVoidGuestCode,
  type GuestCode,
  type GuestCodeBatch,
  type GuestCodeStatus,
} from "@/features/guests/hooks";
import {
  batchShareText,
  copyText,
  downloadCsv,
  formatGuestCode,
  guestCodeLink,
  shareOrCopy,
  singleShareText,
} from "@/features/guests/share";

const STATUS_META: Record<GuestCodeStatus, { label: string; variant: "mint" | "accent" | "danger" }> = {
  AVAILABLE: { label: "Disponible", variant: "mint" },
  REDEEMED: { label: "Canjeado", variant: "accent" },
  VOIDED: { label: "Anulado", variant: "danger" },
};

const MAX_PER_BATCH = 500;

function formatDate(value: string): string {
  return new Date(value).toLocaleString("es-PE", { dateStyle: "medium", timeStyle: "short" });
}

export default function EventGuestCodesPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: event, isLoading: eventLoading } = useEvent(id);
  const { data: codes, isLoading } = useGuestCodes(id);
  const generate = useGenerateGuestCodes(id);
  const voidCode = useVoidGuestCode(id);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [ticketTypeId, setTicketTypeId] = useState("");
  const [quantity, setQuantity] = useState("10");
  const [label, setLabel] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [lastBatch, setLastBatch] = useState<GuestCodeBatch | null>(null);
  const [tab, setTab] = useState<GuestCodeStatus | undefined>(undefined);
  const [toVoid, setToVoid] = useState<GuestCode | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const ticketTypes = useMemo(() => event?.ticket_types ?? [], [event?.ticket_types]);
  const isCancelled = event?.status === "CANCELLED";
  const canGenerate = !isCancelled && ticketTypes.length > 0;
  const slug = event?.slug ?? "";
  const title = event?.title ?? "";

  useEffect(() => {
    if (!ticketTypeId && ticketTypes.length > 0) setTicketTypeId(ticketTypes[0].id);
  }, [ticketTypeId, ticketTypes]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const counts = useMemo(() => {
    const all = codes ?? [];
    return {
      total: all.length,
      AVAILABLE: all.filter((c) => c.status === "AVAILABLE").length,
      REDEEMED: all.filter((c) => c.status === "REDEEMED").length,
      VOIDED: all.filter((c) => c.status === "VOIDED").length,
    };
  }, [codes]);

  const visible = useMemo(
    () => (codes ?? []).filter((c) => !tab || c.status === tab),
    [codes, tab]
  );
  const available = useMemo(() => (codes ?? []).filter((c) => c.status === "AVAILABLE"), [codes]);
  const selectedType = ticketTypes.find((t) => t.id === ticketTypeId);

  async function handleGenerate() {
    setFormError(null);
    const n = Number(quantity);
    if (!ticketTypeId) {
      setFormError("Elige el tipo de entrada que otorgan los códigos.");
      return;
    }
    if (!Number.isInteger(n) || n < 1 || n > MAX_PER_BATCH) {
      setFormError(`La cantidad debe estar entre 1 y ${MAX_PER_BATCH}.`);
      return;
    }
    try {
      const batch = await generate.mutateAsync({ ticket_type_id: ticketTypeId, quantity: n, label: label.trim() });
      setLastBatch(batch);
      setLabel("");
      setGenerateOpen(false);
    } catch (err) {
      setFormError(apiErrorMessage(err));
    }
  }

  async function copy(text: string, what: string) {
    setNotice((await copyText(text)) ? `${what} copiado al portapapeles.` : "No se pudo copiar.");
  }

  async function share(text: string) {
    const result = await shareOrCopy(`Invitación · ${title}`, text);
    if (result === "copied") setNotice("Copiado al portapapeles.");
    if (result === "failed") setNotice("No se pudo compartir.");
  }

  function exportCsv(list: GuestCode[], filename: string) {
    downloadCsv(filename, [
      ["codigo", "tipo_de_entrada", "etiqueta", "estado", "enlace", "redimido_por", "email", "redimido_en"],
      ...list.map((c) => [
        formatGuestCode(c.code),
        c.ticket_type_name,
        c.label,
        STATUS_META[c.status].label,
        guestCodeLink(slug, c.code),
        c.redeemed_by_name ?? "",
        c.redeemed_by_email ?? "",
        c.redeemed_at ?? "",
      ]),
    ]);
  }

  if (eventLoading || !event) {
    return (
      <>
        <TopBar title="Invitados" onBack={() => router.push(`/events/${id}`)} />
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-[var(--space-4)]">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Invitados"
        subtitle={event.title}
        onBack={() => router.push(`/events/${id}`)}
        action={
          canGenerate && counts.total > 0 ? (
            <Button size="sm" onClick={() => setGenerateOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Generar
            </Button>
          ) : undefined
        }
      />
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-[var(--space-4)]">
        {ticketTypes.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-8 w-8" />}
            title="Primero crea un tipo de entrada"
            description="Cada código de invitado otorga una entrada de un tipo (zona) concreto."
            action={
              <Link href={`/events/${id}/tickets`}>
                <Button variant="secondary">Crear tipos de entrada</Button>
              </Link>
            }
          />
        ) : (
          !isLoading &&
          counts.total === 0 && (
            <EmptyState
              icon={<Gift className="h-8 w-8" />}
              title="Invita sin cobrar"
              description="Genera códigos de cortesía para prensa, DJs o tu lista. Cada código da una entrada gratis del tipo que elijas y reserva su cupo."
              action={
                canGenerate ? (
                  <Button onClick={() => setGenerateOpen(true)}>
                    <Plus className="h-4 w-4" aria-hidden /> Generar códigos
                  </Button>
                ) : undefined
              }
            />
          )
        )}

        {lastBatch && lastBatch.codes.length > 0 && (
          <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-[var(--space-4)]">
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">
                {lastBatch.codes.length} código{lastBatch.codes.length === 1 ? "" : "s"} generado
                {lastBatch.codes.length === 1 ? "" : "s"} · {lastBatch.codes[0].ticket_type_name}
              </span>
              <span className="text-sm text-[var(--color-text-muted)]">
                Compártelos todos de una vez o uno por uno desde la lista.
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => copy(batchShareText(title, slug, lastBatch.codes), "Lote")}
              >
                <Copy className="h-4 w-4" aria-hidden /> Copiar lote
              </Button>
              <Button size="sm" variant="secondary" onClick={() => share(batchShareText(title, slug, lastBatch.codes))}>
                <Share2 className="h-4 w-4" aria-hidden /> Compartir lote
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => exportCsv(lastBatch.codes, `invitados-${slug}-lote.csv`)}
              >
                <Download className="h-4 w-4" aria-hidden /> CSV
              </Button>
            </div>
          </section>
        )}

        {notice && (
          <p role="status" className="text-sm text-[var(--color-mint-text)]">
            {notice}
          </p>
        )}

        {counts.total > 0 && (
          <>
            <FilterChips
              aria-label="Filtrar por estado"
              value={tab}
              onChange={setTab}
              options={[
                { label: "Todos", value: undefined, count: counts.total },
                { label: "Disponibles", value: "AVAILABLE", count: counts.AVAILABLE },
                { label: "Canjeados", value: "REDEEMED", count: counts.REDEEMED },
                { label: "Anulados", value: "VOIDED", count: counts.VOIDED },
              ]}
            />

            {available.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-auto text-sm text-[var(--color-text-muted)]">
                  {available.length} sin usar
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copy(batchShareText(title, slug, available), "Listado")}
                >
                  <Copy className="h-4 w-4" aria-hidden /> Copiar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => share(batchShareText(title, slug, available))}>
                  <Share2 className="h-4 w-4" aria-hidden /> Compartir
                </Button>
                <Button size="sm" variant="ghost" onClick={() => exportCsv(codes ?? [], `invitados-${slug}.csv`)}>
                  <Download className="h-4 w-4" aria-hidden /> Exportar
                </Button>
              </div>
            )}
          </>
        )}

        {isLoading && <Skeleton className="h-24 w-full" />}
        {!isLoading && counts.total > 0 && visible.length === 0 && (
          <EmptyState title="Nada en este filtro" description="Prueba con otro estado." />
        )}

        <ul className="flex flex-col gap-2">
          {visible.map((guest) => {
            const meta = STATUS_META[guest.status];
            return (
              <li
                key={guest.id}
                className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-mono text-base tracking-wider">{formatGuestCode(guest.code)}</span>
                    <span className="text-sm text-[var(--color-text-muted)]">
                      {guest.ticket_type_name}
                      {guest.label ? ` · ${guest.label}` : ""}
                    </span>
                  </div>
                  <Badge variant={meta.variant}>{meta.label}</Badge>
                </div>

                {guest.status === "REDEEMED" && (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {guest.redeemed_by_name || "—"} · {guest.redeemed_by_email}
                    {guest.redeemed_at ? ` · ${formatDate(guest.redeemed_at)}` : ""}
                    {guest.order_code && (
                      <>
                        {" · "}
                        <Link href={`/events/${id}/sales/${guest.order_code}`} className="underline">
                          {guest.order_code}
                        </Link>
                      </>
                    )}
                  </p>
                )}
                {guest.status === "VOIDED" && guest.voided_at && (
                  <p className="text-sm text-[var(--color-text-muted)]">Anulado · {formatDate(guest.voided_at)}</p>
                )}

                {guest.status === "AVAILABLE" && (
                  <div className="flex items-center justify-end gap-1">
                    <IconButton
                      size="sm"
                      label="Copiar invitación"
                      onClick={() => copy(singleShareText(title, slug, guest), "Código")}
                    >
                      <Copy className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      size="sm"
                      label="Compartir invitación"
                      onClick={() => share(singleShareText(title, slug, guest))}
                    >
                      <Share2 className="h-4 w-4" />
                    </IconButton>
                    <Button variant="danger" size="sm" onClick={() => setToVoid(guest)}>
                      Anular
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <Sheet open={generateOpen} onOpenChange={setGenerateOpen}>
        <SheetContent title="Generar códigos de invitado">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--color-text-muted)]">
              Cada código da una entrada gratis del tipo elegido y reserva su cupo desde ya.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-ticket-type">Tipo de entrada / zona</Label>
              <Select value={ticketTypeId} onValueChange={setTicketTypeId}>
                <SelectTrigger id="guest-ticket-type">
                  <SelectValue placeholder="Elige un tipo de entrada" />
                </SelectTrigger>
                <SelectContent>
                  {ticketTypes.map((tt) => (
                    <SelectItem key={tt.id} value={tt.id}>
                      {tt.name} · {tt.available} libres{tt.is_active === false ? " · oculta" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guest-quantity">Cantidad</Label>
                <Input
                  id="guest-quantity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={Math.min(MAX_PER_BATCH, selectedType?.available ?? MAX_PER_BATCH)}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="guest-label">Etiqueta (opcional)</Label>
                <Input
                  id="guest-label"
                  maxLength={80}
                  placeholder="Prensa, lista DJ…"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                />
              </div>
            </div>
            <FieldError>{formError}</FieldError>
            <Button loading={generate.isPending} onClick={handleGenerate}>
              Generar {Number(quantity) > 0 ? quantity : ""} código{Number(quantity) === 1 ? "" : "s"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={toVoid !== null}
        onOpenChange={(open) => !open && setToVoid(null)}
        title="¿Anular este código?"
        destructive
        description="Ya no se podrá canjear y su cupo vuelve a estar disponible para la venta."
        impact={toVoid ? `${formatGuestCode(toVoid.code)} · ${toVoid.ticket_type_name}` : undefined}
        confirmLabel="Anular código"
        loading={voidCode.isPending}
        error={voidCode.error ? apiErrorMessage(voidCode.error) : undefined}
        onConfirm={() => {
          if (!toVoid) return;
          voidCode.mutate({ id: toVoid.id, reason: "" }, { onSuccess: () => setToVoid(null) });
        }}
      />
    </>
  );
}
