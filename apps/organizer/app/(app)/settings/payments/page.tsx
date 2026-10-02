"use client";

import { isApiError } from "@repo/api-client";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  FieldError,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Skeleton,
  Switch,
  TopBar,
  cn,
} from "@repo/ui";
import { AlertTriangle, Check, Copy, Eye, EyeOff, KeyRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { apiErrorMessage } from "@/features/events/hooks";
import {
  type PaymentEnvironment,
  type PaymentMode,
  type PaymentProviderState,
  type PaymentSettings,
  type PaymentSettingsPatch,
  usePaymentSettings,
  useUpdatePaymentSettings,
} from "@/features/payments/hooks";

interface ProviderDraft {
  enabled: boolean;
  environment: PaymentEnvironment;
  /** Mostrando los inputs (pasarela nueva, o "Reemplazar credenciales"). */
  editing: boolean;
  credentials: Record<string, string>;
}

interface Draft {
  mode: PaymentMode;
  providers: Record<string, ProviderDraft>;
}

function toDraft(s: PaymentSettings): Draft {
  return {
    mode: s.mode,
    providers: Object.fromEntries(
      s.providers.map((p) => [
        p.id,
        { enabled: p.enabled, environment: p.environment, editing: !p.configured, credentials: {} },
      ])
    ),
  };
}

const MODES: { id: PaymentMode; title: string; description: string }[] = [
  {
    id: "live",
    title: "Pasarelas reales",
    description: "Se cobra de verdad. Puedes activar varias: si hay más de una, el comprador elige con cuál pagar.",
  },
  {
    id: "fake",
    title: "Simulador",
    description: "Para pruebas: aprueba o rechaza sin cobrar. Desactiva las pasarelas reales.",
  },
  {
    id: "disabled",
    title: "Deshabilitado",
    description: "La tienda no vende y avisa de un problema técnico. Desactiva todo lo demás.",
  },
];

/** DRF devuelve los mensajes como lista; el resto de la API, como texto. */
function firstMessage(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstMessage(value[0]);
  return undefined;
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          {description && <p className="text-sm text-[var(--color-text-muted)]">{description}</p>}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] px-3 py-2 font-mono text-xs">
        {value}
      </code>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label="Copiar URL"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function SecretInput({ id, ...props }: React.ComponentProps<typeof Input> & { id: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input id={id} type={visible ? "text" : "password"} autoComplete="off" spellCheck={false} className="pr-10" {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar" : "Mostrar"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[var(--color-text-subtle)] hover:text-[var(--color-text)]"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ProviderCard({
  provider,
  draft,
  live,
  error,
  onChange,
}: {
  provider: PaymentProviderState;
  draft: ProviderDraft;
  live: boolean;
  error?: string;
  onChange: (next: ProviderDraft) => void;
}) {
  const environmentChanged = provider.configured && draft.environment !== provider.environment;
  // Al cambiar de entorno hay que volver a ingresar todas las llaves.
  const showInputs = draft.editing || environmentChanged;

  const status = !provider.configured ? (
    <Badge variant="neutral">Sin configurar</Badge>
  ) : provider.verified_at ? (
    <Badge variant="mint">Validada</Badge>
  ) : (
    <Badge variant="warning">Sin validar</Badge>
  );

  return (
    <Card className={cn(!live && "opacity-60")}>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-display text-lg font-semibold">{provider.label}</h3>
              {status}
              {provider.configured && (
                <Badge variant={provider.environment === "production" ? "accent" : "neutral"}>
                  {provider.environment === "production" ? "Producción" : "Pruebas"}
                </Badge>
              )}
            </div>
            <span className="text-sm text-[var(--color-text-muted)]">
              {!live
                ? "Solo cobra en modo «Pasarelas reales»."
                : draft.enabled
                  ? "Activa: aparece como opción de pago en la tienda."
                  : "Inactiva: no se ofrece a los compradores."}
            </span>
          </div>
          <Switch
            checked={draft.enabled}
            disabled={!live}
            aria-label={`Activar ${provider.label}`}
            onCheckedChange={(enabled) => onChange({ ...draft, enabled })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Entorno</Label>
          <div className="grid grid-cols-2 gap-2">
            {(["test", "production"] as const).map((env) => (
              <Button
                key={env}
                type="button"
                size="sm"
                variant={draft.environment === env ? "primary" : "secondary"}
                onClick={() => onChange({ ...draft, environment: env })}
              >
                {env === "test" ? "Pruebas" : "Producción"}
              </Button>
            ))}
          </div>
          {environmentChanged && (
            <span className="text-sm text-[var(--color-warning)]">
              Al cambiar de entorno ingresa de nuevo todas las credenciales de {provider.label}.
            </span>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="flex items-center gap-1.5">
              <KeyRound className="h-4 w-4" /> Credenciales
            </Label>
            {provider.configured && !environmentChanged && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onChange({ ...draft, editing: !draft.editing, credentials: {} })}
              >
                {draft.editing ? "Cancelar" : "Reemplazar"}
              </Button>
            )}
          </div>

          {!showInputs && (
            <dl className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-sunken)] p-3 text-sm">
              {provider.fields.map((f) => (
                <div key={f.name} className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <dt className="text-[var(--color-text-muted)]">{f.label}</dt>
                  <dd className="min-w-0 break-all font-mono text-xs">{provider.hints[f.name] ?? "—"}</dd>
                </div>
              ))}
            </dl>
          )}

          {showInputs && (
            <>
              {provider.configured && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {environmentChanged
                    ? "Completa todos los campos."
                    : "Deja en blanco lo que no quieras cambiar."}{" "}
                  Por seguridad, después de guardar las credenciales ya no se vuelven a mostrar.
                </p>
              )}
              {provider.fields.map((f) => {
                const id = `${provider.id}-${f.name}`;
                const props = {
                  id,
                  value: draft.credentials[f.name] ?? "",
                  placeholder: provider.configured && !environmentChanged ? provider.hints[f.name] : "",
                  onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                    onChange({ ...draft, credentials: { ...draft.credentials, [f.name]: e.target.value } }),
                };
                return (
                  <div key={f.name} className="flex flex-col gap-1.5">
                    <Label htmlFor={id}>{f.label}</Label>
                    {f.secret ? <SecretInput {...props} /> : <Input autoComplete="off" spellCheck={false} {...props} />}
                    {f.help && <span className="text-xs text-[var(--color-text-subtle)]">{f.help}</span>}
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>URL de notificaciones</Label>
          <CopyField value={provider.webhook_url} />
          <span className="text-xs text-[var(--color-text-subtle)]">
            Regístrala en el panel de {provider.label} para que te avise de cada pago aunque el comprador cierre la página.
          </span>
        </div>

        <FieldError>{error}</FieldError>
      </CardContent>
    </Card>
  );
}

export default function PaymentSettingsPage() {
  const router = useRouter();
  const { data, error, isLoading } = usePaymentSettings();
  const update = useUpdatePaymentSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (data) setDraft(toDraft(data));
  }, [data]);

  const body = useMemo<PaymentSettingsPatch | null>(() => {
    if (!data || !draft) return null;
    const patch: PaymentSettingsPatch = {};
    if (draft.mode !== data.mode) patch.mode = draft.mode;
    const providers: NonNullable<PaymentSettingsPatch["providers"]> = {};
    for (const p of data.providers) {
      const d = draft.providers[p.id];
      if (!d) continue;
      const credentials = Object.fromEntries(Object.entries(d.credentials).filter(([, v]) => v.trim()));
      const changed =
        d.enabled !== p.enabled || d.environment !== p.environment || Object.keys(credentials).length > 0;
      if (changed) providers[p.id] = { enabled: d.enabled, environment: d.environment, credentials };
    }
    if (Object.keys(providers).length) patch.providers = providers;
    return Object.keys(patch).length ? patch : null;
  }, [data, draft]);

  const details = isApiError(update.error)
    ? (update.error.error.details as Record<string, unknown> | undefined)
    : undefined;
  const providerErrors = (details?.providers ?? {}) as Record<string, unknown>;
  const generalError =
    update.isError && !Object.keys(providerErrors).length
      ? firstMessage(details?.mode) ?? firstMessage(details?.detail) ?? apiErrorMessage(update.error)
      : undefined;

  const forbidden = isApiError(error) && error.error.code === "FORBIDDEN";
  const live = draft?.mode === "live";

  const save = () => {
    if (!body) return;
    setSaved(false);
    update.mutate(body, {
      onSuccess: () => setSaved(true),
    });
  };

  return (
    <>
      <TopBar title="Medios de pago" onBack={() => router.push("/settings")} />
      <div className="flex flex-col gap-4 p-[var(--space-4)] pb-28">
        {isLoading && <Skeleton className="h-64" />}

        {error && (
          <EmptyState
            title={forbidden ? "Solo el dueño puede configurar los pagos" : "No pudimos cargar la configuración"}
            description={forbidden ? "Pídele acceso a quien administra la organización." : apiErrorMessage(error)}
          />
        )}

        {data && draft && (
          <>
            {!data.credentials_key_configured && (
              <div className="flex gap-3 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-3 text-sm">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--color-danger)]" />
                <span>
                  El servidor no tiene <code className="font-mono">PAYMENT_CREDENTIALS_KEY</code>: no se pueden guardar
                  credenciales. Pide a quien administra el hosting que la configure.
                </span>
              </div>
            )}

            <Section title="Modo de cobro" description="Qué hace la tienda cuando alguien compra.">
              <RadioGroup
                value={draft.mode}
                onValueChange={(mode) => setDraft({ ...draft, mode: mode as PaymentMode })}
                className="flex flex-col gap-2"
              >
                {MODES.map((m) => (
                  <label
                    key={m.id}
                    htmlFor={`mode-${m.id}`}
                    className={cn(
                      "flex cursor-pointer gap-3 rounded-[var(--radius-md)] border p-3 transition-colors duration-[var(--duration-fast)]",
                      draft.mode === m.id
                        ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                        : "border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                    )}
                  >
                    <RadioGroupItem id={`mode-${m.id}`} value={m.id} className="mt-0.5" />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{m.title}</span>
                      <span className="text-sm text-[var(--color-text-muted)]">{m.description}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            </Section>

            <div className="flex flex-col gap-1 pt-2">
              <h2 className="font-display text-lg font-semibold">Pasarelas</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Al guardar, las credenciales nuevas se validan con el proveedor y se guardan cifradas.
              </p>
            </div>

            {data.providers.map((p) => (
              <ProviderCard
                key={p.id}
                provider={p}
                draft={draft.providers[p.id]!}
                live={live}
                error={firstMessage(providerErrors[p.id])}
                onChange={(next) => setDraft({ ...draft, providers: { ...draft.providers, [p.id]: next } })}
              />
            ))}

            <div
              style={{ bottom: "calc(var(--density-row, 44px) + 20px + env(safe-area-inset-bottom))" }}
              className="fixed inset-x-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-3)]"
            >
              <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-end gap-3">
                <span
                  className={cn(
                    "text-sm",
                    generalError || Object.keys(providerErrors).length
                      ? "text-[var(--color-danger)]"
                      : "text-[var(--color-text-muted)]"
                  )}
                  aria-live="polite"
                >
                  {generalError ??
                    (Object.keys(providerErrors).length
                      ? "Revisa los errores de las pasarelas"
                      : update.isPending
                        ? "Validando con los proveedores…"
                        : saved && !body
                          ? "Cambios guardados"
                          : body
                            ? "Tienes cambios sin guardar"
                            : "")}
                </span>
                {body && (
                  <Button type="button" variant="ghost" disabled={update.isPending} onClick={() => setDraft(toDraft(data))}>
                    Descartar
                  </Button>
                )}
                <Button type="button" loading={update.isPending} disabled={!body} onClick={save}>
                  Guardar
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
