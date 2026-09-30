"use client";

import { Button, FieldError, Input, Label } from "@repo/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useDeleteAccount, useMe, useUpdateMe } from "@/features/account/hooks";
import { useSession } from "@/lib/session";

export default function AccountProfilePage() {
  const router = useRouter();
  const { data: me } = useMe();
  const updateMe = useUpdateMe();
  const deleteAccount = useDeleteAccount();
  const { logout } = useSession();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [saved, setSaved] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    if (me) {
      setFullName(me.full_name ?? "");
      setPhone(me.phone ?? "");
      setDocumentId(me.document_id ?? "");
    }
  }, [me]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await updateMe.mutateAsync({ full_name: fullName, phone, document_id: documentId });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    await deleteAccount.mutateAsync();
    // Navega ANTES de cerrar sesión: si `logout()` va primero, el guard de
    // `AccountLayout` (que redirige a /login en cuanto el status pasa a
    // "anonymous") gana la carrera y termina mandando a /login en vez de al
    // inicio — mismo patrón que la carrera del carrito en checkout/page.tsx.
    router.replace("/");
    await logout();
  }

  if (!me) return null;

  return (
    <div className="flex max-w-sm flex-col gap-8">
      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <h1 className="font-display text-xl font-semibold">Perfil</h1>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={me.email} disabled />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-name">Nombre completo</Label>
          <Input id="profile-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-doc">DNI</Label>
          <Input id="profile-doc" value={documentId} onChange={(e) => setDocumentId(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-phone">Teléfono</Label>
          <Input id="profile-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <FieldError>{updateMe.isError ? "No se pudo guardar." : null}</FieldError>
        <Button type="submit" loading={updateMe.isPending}>
          {saved ? "Guardado" : "Guardar"}
        </Button>
      </form>

      <div className="flex flex-col gap-2 border-t border-[var(--color-border-subtle)] pt-6">
        <h2 className="font-display text-base font-semibold text-[var(--color-danger)]">
          Eliminar cuenta
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          Borra tu nombre, teléfono y documento, y desactiva el acceso con este email. Tus compras ya
          pagadas se conservan por obligación contable, pero dejan de estar asociadas a tu perfil.
        </p>
        {!confirmingDelete ? (
          <Button variant="danger" onClick={() => setConfirmingDelete(true)} className="w-fit">
            Eliminar mi cuenta
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="danger" loading={deleteAccount.isPending} onClick={handleDelete}>
              Sí, eliminar definitivamente
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
              Cancelar
            </Button>
          </div>
        )}
        <FieldError>{deleteAccount.isError ? "No se pudo eliminar la cuenta." : null}</FieldError>
      </div>
    </div>
  );
}
