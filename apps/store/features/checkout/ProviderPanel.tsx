import { cn } from "@repo/ui";
import { FlaskConical, Lock } from "lucide-react";
import type { ReactNode } from "react";

interface ProviderBrand {
  name: string;
  /** Logo oficial, tal como lo publica el proveedor (ver public/payments). */
  logo: string;
  width: number;
  height: number;
}

const BRANDS: Record<string, ProviderBrand> = {
  izipay: { name: "Izipay", logo: "/payments/izipay.svg", width: 140, height: 45 },
  mercadopago: { name: "Mercado Pago", logo: "/payments/mercadopago.png", width: 284, height: 74 },
};

export function ProviderLogo({
  provider,
  className,
  fallback = null,
}: {
  provider: string;
  className?: string;
  /** Para medios sin logo (el simulador). */
  fallback?: ReactNode;
}) {
  const brand = BRANDS[provider];
  if (!brand) return fallback;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logo} alt={brand.name} width={brand.width} height={brand.height} className={cn("w-auto", className)} />
  );
}

export interface ProviderPanelProps {
  provider: string;
  /** Qué pasa con los datos del comprador; va al pie del panel. */
  note: ReactNode;
  children: ReactNode;
}

/**
 * Zona del proveedor dentro de la pantalla de pago. Su formulario va tal
 * cual lo entrega el proveedor, sin estilos de la tienda: así el comprador
 * reconoce la pasarela oficial y no un formulario imitado. El panel siempre
 * es claro (los formularios de las pasarelas están hechos para fondo blanco)
 * y se separa del resto de la página, que sigue con el tema de la tienda.
 */
export function ProviderPanel({ provider, note, children }: ProviderPanelProps) {
  const brand = BRANDS[provider];
  return (
    <section
      aria-label={brand ? `Pago con ${brand.name}` : "Pago"}
      className="overflow-hidden rounded-[var(--radius-lg)] bg-white text-[#1f2937] shadow-[0_12px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/10"
    >
      <header className="flex items-center justify-between gap-3 border-b border-[#ececf1] px-5 py-3.5">
        {brand ? (
          <ProviderLogo provider={provider} className="h-7" />
        ) : (
          <span className="flex items-center gap-2 text-sm font-semibold">
            <FlaskConical className="h-4 w-4" aria-hidden />
            Simulador de pagos
          </span>
        )}
        <span className="flex items-center gap-1.5 text-xs font-medium text-[#4b5563]">
          {brand && <Lock className="h-3.5 w-3.5" aria-hidden />}
          {brand ? "Pago seguro" : "Sin cobro real"}
        </span>
      </header>
      {/* El formulario de Izipay mide 266px fijos: en teléfonos de 320px
          solo cabe con menos relleno lateral. */}
      <div className="px-2 py-5 min-[360px]:px-5">{children}</div>
      <footer className="border-t border-[#ececf1] bg-[#f7f7f9] px-5 py-3 text-xs leading-relaxed text-[#6b7280]">
        {note}
      </footer>
    </section>
  );
}
