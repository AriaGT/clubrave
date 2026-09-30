/**
 * Preset compartido de Tailwind v4 para ambas apps.
 *
 * Tailwind v4 resuelve la mayoría del theming vía `@theme` en CSS
 * (ver ./src/theme.css), así que este preset solo fija lo que no vive en
 * CSS: fuentes por defecto y el ancho máximo de contenedor. Cada app
 * importa `@repo/tokens/theme.css` en su hoja de estilos global y este
 * preset en su `tailwind.config.ts`.
 */
import type { Config } from "tailwindcss";

const preset: Partial<Config> = {
  theme: {
    extend: {
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      maxWidth: {
        container: "var(--container-max)",
      },
      boxShadow: {
        card: "var(--elevation-card)",
        sheet: "var(--elevation-sheet)",
        modal: "var(--elevation-modal)",
        "glow-accent": "var(--glow-accent)",
        "glow-mint": "var(--glow-mint)",
      },
      transitionDuration: {
        instant: "var(--duration-instant)",
        fast: "var(--duration-fast)",
        base: "var(--duration-base)",
        slow: "var(--duration-slow)",
      },
    },
  },
};

export default preset;
