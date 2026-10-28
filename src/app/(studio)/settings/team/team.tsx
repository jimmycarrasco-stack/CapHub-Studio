"use client";

import { useState } from "react";
import { api, Badge, Button, Card, Field, Input, Modal, Select, toast } from "@/components/ui";

type Member = { id: string; email: string; name: string; agency_role: string | null; role: "admin" | "user" };

export function Team({ initial, me, locationName }: { initial: Member[]; me: string; locationName: string }) {
  const [team, setTeam] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  async function setRole(m: Member, role: "admin" | "user") {
    try {
      setTeam(await api<Member[]>(`/api/account/team/${m.id}`, { method: "PATCH", json: { role } }));
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function remove(m: Member) {
    try {
      setTeam(await api<Member[]>(`/api/account/team/${m.id}`, { method: "DELETE" }));
      setRemoving(null);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          People who can sign in to <strong className="text-zinc-800">{locationName}</strong>. Admins can change settings and manage the team; users can work with contacts, deals, sites and automations.
          Agency admins can always access every sub-account.
        </p>
        <Button variant="primary" onClick={() => setAdding(true)}>
          Add person
        </Button>
      </div>
      <Card>
        {team.length === 0 ? (
          <p className="px-4 py-6 text-sm text-zinc-500">No one has been added to this sub-account yet (agency admins have access automatically).</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {team.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {m.name} {m.id === me && <span className="text-xs text-zinc-400">(you)</span>} {m.agency_role && <Badge tone="brand">Agency {m.agency_role}</Badge>}
                  </div>
                  <div className="truncate text-xs text-zinc-500">{m.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Select aria-label={`Role for ${m.name}`} value={m.role} onChange={(e) => setRole(m, e.target.value as "admin" | "user")} className="w-28">
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                  </Select>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {adding && <AddMember onClose={() => setAdding(false)} onAdded={(t) => (setTeam(t), setAdding(false))} />}
      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove from sub-account?">
        <p className="text-sm text-zinc-600">
          {removing?.name} will lose access to {locationName}. Their account isn&apos;t deleted, and anything they created stays.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => removing && remove(removing)}>
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function AddMember({ onClose, onAdded }: { onClose: () => void; onAdded: (t: Member[]) => void }) {
  const [f, setF] = useState({ email: "", name: "", password: "", role: "user" as "admin" | "user" });
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      onAdded(await api<Member[]>("/api/account/team", { method: "POST", json: { ...f, password: f.password || undefined, name: f.name || undefined } }));
      toast("Added", "success");
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Add a person">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Field label="Email" htmlFor="tm-email">
          <Input id="tm-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} autoFocus />
        </Field>
        <Field label="Name" htmlFor="tm-name">
          <Input id="tm-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Starting password" hint="Only needed if they don't have a CapHub login yet (10+ characters). Share it with them privately; they sign in with their email." htmlFor="tm-pw">
          <Input id="tm-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <Field label="Role" htmlFor="tm-role">
          <Select id="tm-role" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as "admin" | "user" })}>
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!f.email.trim()}>
            Add
          </Button>
        </div>
      </form>
    </Modal>
  );
}
