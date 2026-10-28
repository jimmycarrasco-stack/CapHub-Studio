"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Button, Card, Input, Textarea, toast } from "@/components/ui";

const IDEAS = [
  {
    label: "Client portal",
    name: "Client Portal",
    prompt:
      "A client portal for a marketing agency. Clients sign up and see their projects, each with a status (planning, in progress, review, done), due date and a message thread with the agency. Admins can create projects, assign them to clients, update status and reply to messages. Clean, professional dashboard UI.",
  },
  {
    label: "Booking system",
    name: "Booking System",
    prompt:
      "An appointment booking app for a home-services company. Customers sign up and request a booking: service type (inspection, repair, installation), preferred date and time slot, address and notes. Customers see their bookings and status. Admins see all bookings in a table with filters, can confirm, reschedule or cancel them, and see a simple calendar-style view of the week.",
  },
  {
    label: "Job estimator CRM",
    name: "Estimates CRM",
    prompt:
      "A lightweight CRM for a roofing contractor. Track leads (name, phone, email, address, source, stage: new, contacted, estimate sent, won, lost), log activities per lead, and create estimates with line items (description, quantity, unit price) that total automatically. Dashboard with counts per stage and total won value. Only admins and staff (users) can access it.",
  },
  {
    label: "Member directory",
    name: "Member Directory",
    prompt:
      "A members-only directory for a business association. Members create a profile (business name, category, description, phone, website, logo URL). Everyone signed in can browse and search the directory by name and category. Admins can approve new profiles before they appear and feature some members at the top.",
  },
];

export function NewAppForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const app = await api<{ id: string }>("/api/apps", { method: "POST", json: { name: name.trim() || undefined, prompt } });
      await api(`/api/apps/${app.id}/chat`, { method: "POST", json: { prompt } });
      router.push(`/apps/${app.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
      setLoading(false);
    }
  }

  return (
    <Card className="p-4">
      <Input aria-label="App name (optional)" placeholder="App name (optional)" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="mb-2 max-w-sm" />
      <Textarea
        aria-label="Describe your app"
        rows={5}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void create();
        }}
        placeholder="Who uses it, what they can do, what admins can do, what data it stores… The more specific, the better."
        className="resize-none text-[15px]"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
        <div className="flex flex-wrap gap-1.5">
          {IDEAS.map((i) => (
            <button
              key={i.label}
              type="button"
              onClick={() => {
                setName(i.name);
                setPrompt(i.prompt);
              }}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
            >
              {i.label}
            </button>
          ))}
        </div>
        <Button variant="primary" loading={loading} disabled={!prompt.trim()} onClick={create}>
          Build app
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Every app starts with sign-up/login, user &amp; admin roles, an admin panel and its own Postgres database. A first build usually takes 5–15 minutes.
      </p>
    </Card>
  );
}
