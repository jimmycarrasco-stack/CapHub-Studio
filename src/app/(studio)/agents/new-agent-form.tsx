"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Button, Card, Field, Input, Textarea, toast } from "@/components/ui";

const TEMPLATES = [
  {
    label: "Lead qualifier",
    name: "Lead Qualifier",
    description: "Qualifies inbound leads and books consultations",
    instructions:
      "Greet visitors warmly. Find out what they need, their timeline and budget, one question at a time. When they seem like a good fit, collect their name, email and phone and tell them the team will reach out within one business day. Keep it conversational, never pushy.",
  },
  {
    label: "Customer support",
    name: "Support Assistant",
    description: "Answers questions about services, pricing and policies",
    instructions:
      "Answer customer questions using the knowledge base. Be concise and specific. If a question needs a human (billing disputes, complaints, anything you aren't sure about), apologize briefly and ask for their email so the team can follow up.",
  },
  {
    label: "Appointment setter",
    name: "Appointment Setter",
    description: "Helps visitors request an appointment",
    instructions:
      "Help visitors request an appointment. Ask what service they need, their preferred days and times, and their name, phone and email. Confirm the details back to them and explain that the office will confirm the exact time by phone or email. Do not promise specific slots.",
  },
];

export function NewAgentForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const a = await api<{ id: string }>("/api/agents", { method: "POST", json: { name, description, instructions } });
      router.push(`/agents/${a.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">New agent</h2>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              onClick={() => {
                setName(t.name);
                setDescription(t.description);
                setInstructions(t.instructions);
              }}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <form onSubmit={create} className="grid gap-4 md:grid-cols-2">
        <Field label="Name" htmlFor="agent-name">
          <Input id="agent-name" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maple Smile Receptionist" />
        </Field>
        <Field label="Short description" htmlFor="agent-desc">
          <Input id="agent-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this agent does" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Instructions" htmlFor="agent-instr" hint="You can refine these, add knowledge and test the agent on the next screen.">
            <Textarea id="agent-instr" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="How should the agent behave? What's its goal?" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Button variant="primary" loading={loading} disabled={!name.trim()}>
            Create agent
          </Button>
        </div>
      </form>
    </Card>
  );
}
