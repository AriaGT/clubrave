export const metadata = { title: "Términos y condiciones" };

export default function TermsPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 p-[var(--space-6)]">
      <h1 className="font-display text-2xl font-bold">Términos y condiciones</h1>
      <div className="flex flex-col gap-3 text-[var(--color-text-muted)]">
        <p>
          Al comprar una entrada en Umbral aceptas que el organizador del evento es el
          responsable de su realización, contenido y condiciones de ingreso.
        </p>
        <p>
          Cada entrada es válida para un solo ingreso. El código QR es personal e
          intransferible una vez validado en la puerta.
        </p>
        <p>
          Debes cumplir con la edad mínima indicada en la página del evento para
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
