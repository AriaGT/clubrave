"use client";

import { Badge, Button, Card, CardContent, Skeleton } from "@repo/ui";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { PageHeader } from "@/features/admin/AdminShell";
import { useAdminSystem } from "@/features/admin/hooks";
import { apiErrorMessage } from "@/features/events/hooks";

const PROVIDER_LABELS: Record<string, string> = { izipay: "Izipay", mercadopago: "Mercado Pago" };
const STATUS_BADGE = { ok: "mint", warning: "accent", error: "danger" } as const;
const STATUS_LABEL = { ok: "OK", warning: "Atención", error: "Falla" } as const;

function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-[var(--radius-md)] bg-[var(--color-surface-sunken)] p-2 font-mono text-xs">
        {url}
      </code>
      <Button
        variant="secondary"
        size="sm"
        aria-label="Copiar URL"
        onClick={async () => {
          await navigator.clipboard?.writeText(url).catch(() => undefined);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export default function AdminSystemPage() {
  const { data, isLoading, error } = useAdminSystem();

  return (
    <>
      <PageHeader title="Sistema" description="Versión desplegada, chequeos de entorno y webhooks de las pasarelas." />
      {isLoading && <Skeleton className="h-40 w-full" />}
      {error && <p className="text-sm text-[var(--color-danger)]">{apiErrorMessage(error)}</p>}
      {data && (
        <div className="flex flex-col gap-5">
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm">
              <span className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">Versión</span>
                <span className="font-mono">{data.version ? data.version.slice(0, 12) : "no informada"}</span>
              </span>
              <span className="flex flex-col">
                <span className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)]">Entorno</span>
                <span className="font-mono">{data.environment || "—"}</span>
              </span>
              {data.debug && <Badge variant="danger">DEBUG activo</Badge>}
            </CardContent>
          </Card>

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold">Chequeos</h2>
            <ul className="flex flex-col gap-2">
              {data.checks.map((c) => (
                <li
                  key={c.code}
                  className="flex items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{c.label}</span>
                    <span className="break-words text-sm text-[var(--color-text-muted)]">{c.detail}</span>
                  </span>
                  <Badge variant={STATUS_BADGE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                </li>
              ))}
            </ul>
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-lg font-semibold">Webhooks</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              Regístralos en el panel de cada pasarela para que confirme los pagos.
            </p>
            {data.webhooks.map((w) => (
              <Card key={w.provider}>
                <CardContent className="flex flex-col gap-2 pt-4">
                  <span className="font-medium">{PROVIDER_LABELS[w.provider] ?? w.provider}</span>
                  <CopyUrl url={w.url} />
                </CardContent>
              </Card>
            ))}
          </section>
        </div>
      )}
    </>
  );
}
