export const metadata = { title: "TÃ©rminos y condiciones" };

export default function TermsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-[var(--space-6)]">
      <h1 className="font-display text-2xl font-bold">TÃ©rminos y condiciones</h1>
      <div className="flex flex-col gap-3 text-[var(--color-text-muted)]">
        <p>
          Al comprar una entrada en Club Rave aceptas que el organizador del evento es el
          responsable de su realizaciÃ³n, contenido y condiciones de ingreso.
        </p>
        <p>
          Cada entrada es vÃ¡lida para un solo ingreso. El cÃ³digo QR es personal e
          intransferible una vez validado en la puerta.
        </p>
        <p>
          Debes cumplir con la edad mÃ­nima indicada en la pÃ¡gina del evento para
          poder ingresar.
        </p>
        <p>
          Los reembolsos, cambios de fecha o cancelaciones se gestionan directamente
          con el organizador del evento.
        </p>
      </div>
    </main>
  );
}

