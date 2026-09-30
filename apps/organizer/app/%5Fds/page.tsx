"use client";

import {
  ActivityItem,
  AlertDialog,
  AlertDialogContent,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Checkbox,
  ConfirmDialog,
  DangerZone,
  Divider,
  FieldError,
  IconButton,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@repo/ui";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}

export default function DesignSystemPage() {
  const [switchOn, setSwitchOn] = useState(true);
  const [checked, setChecked] = useState(true);
  const [radio, setRadio] = useState("general");
  const [level2, setLevel2] = useState(false);
  const [level3, setLevel3] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);

  return (
    <main className="mx-auto flex max-w-[var(--container-max)] flex-col gap-10 p-[var(--space-6)]">
      <header>
        <h1 className="font-display text-3xl font-bold tracking-tight">NOCTA — Design System</h1>
        <p className="text-[var(--color-text-muted)]">
          Tokens y los 12 componentes base, con sus estados. Ver §9 del plan.
        </p>
      </header>

      <Section title="Color">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {[
            ["bg", "var(--color-bg)"],
            ["surface", "var(--color-surface)"],
            ["border", "var(--color-border)"],
            ["accent", "var(--color-accent)"],
            ["mint", "var(--color-mint)"],
            ["warning", "var(--color-warning)"],
            ["danger", "var(--color-danger)"],
            ["info", "var(--color-info)"],
          ].map(([name, value]) => (
            <div key={name} className="flex flex-col gap-1">
              <div
                className="h-14 w-24 rounded-[var(--radius-md)] border border-[var(--color-border)]"
                style={{ background: value }}
              />
              <span className="text-xs text-[var(--color-text-muted)]">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Divider />

      <Section title="Button">
        <Button variant="primary">Publicar</Button>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="danger">Eliminar</Button>
        <Button variant="primary" size="sm">
          Pequeño
        </Button>
        <Button variant="primary" size="lg">
          Grande
        </Button>
        <Button variant="primary" loading>
          Cargando
        </Button>
        <Button variant="primary" disabled>
          Deshabilitado
        </Button>
      </Section>

      <Section title="IconButton">
        <IconButton label="Agregar">
          <Plus className="h-5 w-5" />
        </IconButton>
        <IconButton label="Eliminar" variant="secondary">
          <Trash2 className="h-5 w-5" />
        </IconButton>
        <IconButton label="Deshabilitado" disabled>
          <Plus className="h-5 w-5" />
        </IconButton>
      </Section>

      <Section title="Input">
        <div className="flex w-64 flex-col gap-1.5">
          <Label htmlFor="ds-input">Nombre del evento</Label>
          <Input id="ds-input" placeholder="Noche Eléctrica" />
        </div>
        <div className="flex w-64 flex-col gap-1.5">
          <Label htmlFor="ds-input-invalid">Con error</Label>
          <Input id="ds-input-invalid" invalid defaultValue="" placeholder="Requerido" />
          <FieldError>Este campo es obligatorio.</FieldError>
        </div>
        <div className="flex w-64 flex-col gap-1.5">
          <Label htmlFor="ds-input-disabled">Deshabilitado</Label>
          <Input id="ds-input-disabled" disabled placeholder="No editable" />
        </div>
      </Section>

      <Section title="Textarea">
        <div className="flex w-80 flex-col gap-1.5">
          <Label htmlFor="ds-textarea">Descripción</Label>
          <Textarea id="ds-textarea" placeholder="Una noche de música electrónica…" />
        </div>
      </Section>

      <Section title="Select">
        <div className="flex w-64 flex-col gap-1.5">
          <Label htmlFor="ds-select">Ciudad</Label>
          <Select defaultValue="lima">
            <SelectTrigger id="ds-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lima">Lima</SelectItem>
              <SelectItem value="arequipa">Arequipa</SelectItem>
              <SelectItem value="cusco">Cusco</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title="Checkbox">
        <div className="flex items-center gap-2">
          <Checkbox id="ds-checkbox" checked={checked} onCheckedChange={(v) => setChecked(!!v)} />
          <Label htmlFor="ds-checkbox">Acepto los términos y condiciones</Label>
        </div>
      </Section>

      <Section title="Switch">
        <div className="flex items-center gap-2">
          <Switch id="ds-switch" checked={switchOn} onCheckedChange={setSwitchOn} />
          <Label htmlFor="ds-switch">Evento publicado</Label>
        </div>
      </Section>

      <Section title="RadioGroup">
        <RadioGroup value={radio} onValueChange={setRadio} className="flex gap-4">
          {["preventa", "general", "vip"].map((value) => (
            <div key={value} className="flex items-center gap-2">
              <RadioGroupItem value={value} id={`ds-radio-${value}`} />
              <Label htmlFor={`ds-radio-${value}`} className="capitalize">
                {value}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </Section>

      <Section title="Badge">
        <Badge variant="neutral">Borrador</Badge>
        <Badge variant="accent">Preventa</Badge>
        <Badge variant="mint">Publicado</Badge>
        <Badge variant="warning">Ya ingresó</Badge>
        <Badge variant="danger">Inválida</Badge>
      </Section>

      <Section title="Card">
        <Card className="w-72">
          <CardHeader>
            <h3 className="font-display text-lg font-semibold">Noche Eléctrica</h3>
            <p className="text-sm text-[var(--color-text-muted)]">17 oct · Warehouse 09</p>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <Badge variant="mint">Publicado</Badge>
            <span className="text-sm text-[var(--color-text-muted)]">145 / 300 vendidas</span>
          </CardContent>
        </Card>
      </Section>

      <Section title="Divider">
        <div className="w-full">
          <Divider />
        </div>
      </Section>

      <Section title="H15 · Confirmar con motivo">
        <Button variant="secondary" onClick={() => setAlertOpen(true)}>
          AlertDialog base
        </Button>
        <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
          <AlertDialogContent
            title="Diálogo modal"
            description="No se cierra al tocar fuera ni con Esc. ConfirmDialog lo construye encima."
          >
            <div className="flex justify-end">
              <Button variant="secondary" onClick={() => setAlertOpen(false)}>
                Cerrar
              </Button>
            </div>
          </AlertDialogContent>
        </AlertDialog>
        <Button variant="danger" onClick={() => setLevel2(true)}>
          Anular orden (nivel 2)
        </Button>
        <Button variant="danger" onClick={() => setLevel3(true)}>
          Cancelar evento (nivel 3)
        </Button>
        <ConfirmDialog
          open={level2}
          onOpenChange={setLevel2}
          destructive
          title="¿Anular la orden ORD-1042?"
          impact="Se anularán 3 entradas y el cupo volverá a la venta."
          reasons={[
            { value: "FRAUD", label: "Fraude / contracargo" },
            { value: "BUYER_REQUEST", label: "Pedido del comprador" },
            { value: "OTHER", label: "Otro" },
          ]}
          confirmLabel="Anular orden"
          onConfirm={() => setLevel2(false)}
        >
          <label className="flex items-center gap-2 text-sm">
            <Switch defaultChecked />
            Devolver el cupo a la venta
          </label>
        </ConfirmDialog>
        <ConfirmDialog
          open={level3}
          onOpenChange={setLevel3}
          destructive
          title="Cancelar el evento"
          impact="Se avisará a 145 compradores y no se puede deshacer."
          reasons={[
            { value: "FORCE_MAJEURE", label: "Fuerza mayor" },
            { value: "ORGANIZER_ERROR", label: "Error del organizador" },
            { value: "OTHER", label: "Otro" },
          ]}
          confirmPhrase="Noche Eléctrica"
          confirmLabel="Cancelar evento"
          onConfirm={() => setLevel3(false)}
        />
      </Section>

      <Section title="H15 · Zona de riesgo">
        <DangerZone description="Estas acciones no se pueden deshacer.">
          <Button variant="danger" className="justify-start">
            Cancelar evento
          </Button>
          <Button variant="danger" className="justify-start">
            Eliminar evento
          </Button>
        </DangerZone>
      </Section>

      <Section title="H14 · Actividad">
        <ol className="flex w-full flex-col gap-2">
          <ActivityItem
            action="ORDER_VOIDED"
            createdAt={new Date().toISOString()}
            actorEmail="maria@promotora.pe"
            targetLabel="ORD-1042"
            reason="Pedido del comprador"
          />
          <ActivityItem
            action="EVENT_PUBLISHED"
            createdAt={new Date().toISOString()}
            actorEmail="maria@promotora.pe"
            targetLabel="Noche Eléctrica"
          />
        </ol>
      </Section>
    </main>
  );
}
