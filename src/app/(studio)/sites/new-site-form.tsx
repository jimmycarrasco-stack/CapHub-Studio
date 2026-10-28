"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, Button, Card, Textarea, toast } from "@/components/ui";

export const PENDING_PROMPT_KEY = (id: string) => `caphub_pending_prompt_${id}`;

const STARTERS = [
  {
    label: "Dental practice",
    prompt:
      "A modern, trustworthy website for Maple Smile Dental, a family dentist in Winnipeg. Hero with 'Book an appointment' CTA, services (cleanings, whitening, implants, emergency), meet the dentist, insurance & payment info, patient testimonials, FAQ, and a booking request form.",
  },
  {
    label: "Lead magnet funnel",
    prompt:
      "A high-converting opt-in landing page for a free '7-Day Meal Prep Guide' from a nutrition coach. Bold headline, 3 benefit bullets, mockup placeholder of the guide, short bio, and a first-name + email opt-in form. Energetic, fresh green palette.",
  },
  {
    label: "Roofing contractor",
    prompt:
      "A local roofing contractor site for Summit Roofing. Emphasize free inspections, storm damage repair, financing, 10-year warranty, before/after gallery placeholders, reviews, service area, and a quote request form with roof type and urgency fields.",
  },
  {
    label: "Restaurant",
    prompt:
      "A warm, elegant one-page site for Olive & Ember, a wood-fired Mediterranean restaurant. Menu highlights with prices, hours & location, private events section, and a reservation request form (party size, date, time).",
  },
  {
    label: "Coaching booking page",
    prompt:
      "A booking page for a business coach offering a free 30-minute strategy call. Who it's for, what you'll get from the call, credibility logos as text placeholders, testimonials, and a booking form with preferred date/time and biggest challenge.",
  },
];

export function NewSiteForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);

  async function create() {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const site = await api<{ id: string }>("/api/sites", { method: "POST", json: { prompt } });
      try {
        sessionStorage.setItem(PENDING_PROMPT_KEY(site.id), prompt);
      } catch {
        /* ignore */
      }
      router.push(`/sites/${site.id}`);
    } catch (err) {
      toast((err as Error).message, "error");
      setLoading(false);
    }
  }

  return (
    <Card className="p-4">
      <Textarea
        aria-label="Describe your site"
        rows={4}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) create();
        }}
        placeholder="e.g. A landing page for a Winnipeg HVAC company with a free-estimate form, financing section and 24/7 emergency service banner…"
        className="resize-none text-[15px] ring-0 focus:ring-0"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
        <div className="flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => setPrompt(s.prompt)}
              className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
            >
              {s.label}
            </button>
          ))}
        </div>
        <Button variant="primary" loading={loading} disabled={!prompt.trim()} onClick={create}>
          Generate site
          <kbd className="ml-1 hidden rounded bg-white/20 px-1 text-[10px] sm:inline">⌘↵</kbd>
        </Button>
      </div>
    </Card>
  );
}
