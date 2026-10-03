"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, CardContent, FieldError, Input, Label, TopBar } from "@repo/ui";
import { MailCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useRequestPasswordChange } from "@/features/account/hooks";

const schema = z
  .object({
    current_password: z.string().min(1, "Ingresa tu contraseña actual."),
    new_password: z.string().min(10, "Mínimo 10 caracteres."),
    confirm: z.string(),
  })
  .refine((v) => v.new_password === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden." })
  .refine((v) => v.new_password !== v.current_password, {
    path: ["new_password"],
    message: "Debe ser distinta a la actual.",
  });

type Values = z.infer<typeof schema>;

export default function PasswordPage() {
  const request = useRequestPasswordChange();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(({ current_password, new_password }) =>
    request.mutate({ current_password, new_password })
  );

  return (
    <>
      <TopBar title="Cambiar contraseña" />
      <div className="flex flex-col gap-4 p-[var(--space-4)]">
        {request.isSuccess ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
              <MailCheck className="h-10 w-10 text-[var(--color-accent-text)]" />
              <h2 className="font-display text-lg font-semibold">Revisa tu correo</h2>
              <p className="text-sm text-[var(--color-text-muted)]">
                Te enviamos un enlace para confirmar el cambio. Vence en 30 minutos y tu contraseña actual
                sigue vigente hasta que lo abras.
              </p>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Card>
              <CardContent className="flex flex-col gap-4 pt-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="current_password">Contraseña actual</Label>
                  <Input
                    id="current_password"
                    type="password"
                    autoComplete="current-password"
                    {...register("current_password")}
                  />
                  <FieldError>{errors.current_password?.message}</FieldError>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="new_password">Contraseña nueva</Label>
                  <Input id="new_password" type="password" autoComplete="new-password" {...register("new_password")} />
                  <FieldError>{errors.new_password?.message}</FieldError>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">Repite la contraseña nueva</Label>
                  <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
                  <FieldError>{errors.confirm?.message}</FieldError>
                </div>
              </CardContent>
            </Card>
            <FieldError>{request.error?.message}</FieldError>
            <Button type="submit" loading={request.isPending}>
              Enviar correo de confirmación
            </Button>
          </form>
        )}
      </div>
    </>
  );
}
