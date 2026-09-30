"use client";

import { isApiError } from "@repo/api-client";
import { Button, Card, CardContent, EmptyState, FieldError, Input, Label, Skeleton, TopBar } from "@repo/ui";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImagePlus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { apiErrorMessage } from "@/features/events/hooks";
import { type SiteSettings, useSetSiteLogo, useSiteSettings, useUpdateSiteSettings } from "@/features/site/hooks";

/** URL vacía o de alguno de los dominios esperados (evita pegar el enlace de
 * Instagram en el campo de TikTok). */
function socialUrl(label: string, hosts: string[]) {
  return z
    .string()
    .trim()
    .refine((value) => {
      if (!value) return true;
      try {
        const host = new URL(value).hostname.replace(/^www\./, "");
        return hosts.some((h) => host === h || host.endsWith(`.${h}`));
      } catch {
        return false;
      }
    }, `Pega el enlace completo de tu perfil de ${label} (https://${hosts[0]}/…).`);
}

const schema = z.object({
  tagline: z.string().trim().max(160, "Máximo 160 caracteres."),
  contact_phone: z.string().trim().max(30),
  whatsapp: z
    .string()
    .trim()
    .refine((v) => !v || /^\+?[\d\s-]{8,20}$/.test(v), "Número con código de país, p. ej. +51 987 654 321."),
  contact_email: z.string().trim().email("Correo inválido.").or(z.literal("")),
  address: z.string().trim().max(200),
  instagram_url: socialUrl("Instagram", ["instagram.com"]),
  tiktok_url: socialUrl("TikTok", ["tiktok.com"]),
  facebook_url: socialUrl("Facebook", ["facebook.com", "fb.com"]),
  youtube_url: socialUrl("YouTube", ["youtube.com", "youtu.be"]),
  complaints_book_url: z.string().trim().url("Enlace inválido.").or(z.literal("")),
});

type Values = z.infer<typeof schema>;

function toValues(s: SiteSettings): Values {
  return {
    tagline: s.tagline ?? "",
    contact_phone: s.contact_phone ?? "",
    whatsapp: s.whatsapp ?? "",
    contact_email: s.contact_email ?? "",
    address: s.address ?? "",
    instagram_url: s.instagram_url ?? "",
    tiktok_url: s.tiktok_url ?? "",
    facebook_url: s.facebook_url ?? "",
    youtube_url: s.youtube_url ?? "",
    complaints_book_url: s.complaints_book_url ?? "",
  };
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-4">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="text-sm text-[var(--color-text-muted)]">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

export default function SiteSettingsPage() {
  const router = useRouter();
  const { data, error, isLoading } = useSiteSettings();
  const update = useUpdateSiteSettings();
  const setLogo = useSetSiteLogo();
  const fileRef = useRef<HTMLInputElement>(null);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (data) reset(toValues(data));
  }, [data, reset]);

  const field = (name: keyof Values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} invalid={!!errors[name]} {...props} {...register(name)} />
      <FieldError>{errors[name]?.message}</FieldError>
    </div>
  );

  const onSubmit = handleSubmit((values) => {
    setSaved(false);
    update.mutate(values, {
      onSuccess: (fresh) => {
        reset(toValues(fresh));
        setSaved(true);
      },
      onError: (err) => {
        // Errores por campo del backend (p. ej. el WhatsApp) van a su input.
        const fields = isApiError(err) ? (err.error.details as Record<string, string[]> | undefined) : undefined;
        Object.entries(fields ?? {}).forEach(([name, messages]) => {
          if (name in schema.shape) setError(name as keyof Values, { message: messages?.[0] });
        });
      },
    });
  });

  const forbidden = isApiError(error) && error.error.code === "FORBIDDEN";

  return (
    <>
      <TopBar title="Sitio web" onBack={() => router.push("/settings")} />
      <div className="flex flex-col gap-4 p-[var(--space-4)] pb-28">
        {isLoading && <Skeleton className="h-64" />}

        {error && (
          <EmptyState
            title={forbidden ? "Solo el dueño puede editar el sitio" : "No pudimos cargar la configuración"}
            description={forbidden ? "Pídele acceso a quien administra la organización." : apiErrorMessage(error)}
          />
        )}

        {data && (
          <>
            <p className="text-sm text-[var(--color-text-muted)]">
              Esto se muestra en la barra superior y el pie de todas las páginas de la tienda. Lo que dejes en
              blanco no aparece.
            </p>

            <Section title="Logo" description="PNG con fondo transparente se ve mejor. Si no subes uno, se muestra el texto “Club Rave”.">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-20 min-w-40 items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-4">
                  {data.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={data.logo} alt="Logo actual" className="max-h-12 max-w-[180px] object-contain" />
                  ) : (
                    <span className="font-display text-lg font-extrabold uppercase tracking-[0.18em]">Club Rave</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    loading={setLogo.isPending}
                    onClick={() => fileRef.current?.click()}
                  >
                    <ImagePlus className="h-4 w-4" />
                    {data.logo ? "Cambiar" : "Subir logo"}
                  </Button>
                  {data.logo && (
                    <Button type="button" variant="danger" size="sm" onClick={() => setLogo.mutate(null)}>
                      <Trash2 className="h-4 w-4" />
                      Quitar
                    </Button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/webp,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setLogo.mutate(file);
                    e.target.value = "";
                  }}
                />
              </div>
              <FieldError>{setLogo.error ? apiErrorMessage(setLogo.error) : undefined}</FieldError>
            </Section>

            <form id="site-settings" onSubmit={onSubmit} className="flex flex-col gap-4">
              <Section title="Marca" description="Frase corta que acompaña al logo en el pie de página.">
                {field("tagline", "Frase", { placeholder: "Asegura tu entrada. Recíbela al instante con un QR." })}
              </Section>

              <Section title="Contacto" description="Cómo te encuentran los compradores si tienen dudas.">
                <div className="grid gap-4 sm:grid-cols-2">
                  {field("contact_phone", "Teléfono", { type: "tel", placeholder: "+51 987 654 321" })}
                  {field("whatsapp", "WhatsApp", { type: "tel", placeholder: "+51 987 654 321" })}
                </div>
                {field("contact_email", "Correo", { type: "email", placeholder: "hola@clubrave.pe" })}
                {field("address", "Dirección", { placeholder: "Av. Industrial 450, Lima" })}
              </Section>

              <Section title="Redes sociales" description="Pega el enlace completo de cada perfil.">
                {field("instagram_url", "Instagram", { placeholder: "https://instagram.com/clubrave" })}
                {field("tiktok_url", "TikTok", { placeholder: "https://www.tiktok.com/@clubrave" })}
                {field("facebook_url", "Facebook", { placeholder: "https://facebook.com/clubrave" })}
                {field("youtube_url", "YouTube", { placeholder: "https://youtube.com/@clubrave" })}
              </Section>

              <Section title="Legal" description="Enlace a tu Libro de Reclamaciones virtual (obligatorio en Perú para vender en línea).">
                {field("complaints_book_url", "Libro de Reclamaciones", { placeholder: "https://…" })}
              </Section>
            </form>

            <div
              style={{ bottom: "calc(var(--density-row, 44px) + 20px + env(safe-area-inset-bottom))" }}
              className="fixed inset-x-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-[var(--space-3)]">
              <div className="mx-auto flex max-w-[var(--container-max)] items-center justify-end gap-3">
                <span className="text-sm text-[var(--color-text-muted)]" aria-live="polite">
                  {update.isError && !Object.keys(errors).length
                    ? apiErrorMessage(update.error)
                    : saved && !isDirty
                      ? "Cambios guardados"
                      : isDirty
                        ? "Tienes cambios sin guardar"
                        : ""}
                </span>
                <Button type="submit" form="site-settings" loading={update.isPending} disabled={!isDirty}>
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
