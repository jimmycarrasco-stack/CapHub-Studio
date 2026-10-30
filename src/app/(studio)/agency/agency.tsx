"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, Badge, Button, Card, Field, Input, Modal, PageHeader, Select, toast } from "@/components/ui";

type Loc = {
  id: string;
  name: string;
  email: string;
  phone: string;
  website: string;
  timezone: string;
  status: "active" | "suspended";
  source_order_id: string | null;
  contacts: number;
  members: number;
};
type U = { id: string; email: string; name: string; agency_role: "owner" | "admin" | null; locations: { id: string; name: string; role: string }[] };

const TIMEZONES = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ["America/Winnipeg"];

export function Agency({ me, initialLocations, initialUsers }: { me: { id: string; role: "owner" | "admin" }; initialLocations: Loc[]; initialUsers: U[] }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [editingLoc, setEditingLoc] = useState<Loc | "new" | null>(null);
  const [deletingLoc, setDeletingLoc] = useState<Loc | null>(null);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [editingUser, setEditingUser] = useState<U | null>(null);

  async function setStatus(l: Loc, status: "active" | "suspended") {
    if (status === "suspended" && !window.confirm(`Suspend ${l.name}? Its users won't be able to sign in until you reactivate it. Nothing is deleted.`)) return;
    try {
      await api(`/api/agency/locations/${l.id}`, { method: "PATCH", json: { status } });
      toast(status === "suspended" ? `${l.name} suspended` : `${l.name} reactivated`, "success");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function open(id: string) {
    try {
      await api("/api/auth/switch", { method: "POST", json: { locationId: id } });
      router.push("/");
      router.refresh();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-10">
      <PageHeader
        title="Agency"
        subtitle="Sub-accounts keep each client's contacts, pipelines, payments, sites and automations separate. Agency admins can open any of them."
        actions={
          <Button variant="primary" onClick={() => setEditingLoc("new")}>
            New sub-account
          </Button>
        }
      />

      <h2 className="mb-3 text-sm font-semibold">Sub-accounts</h2>
      {initialLocations.length === 0 ? (
        <Card className="p-6 text-center text-sm text-zinc-500">Create your first sub-account to start using the CRM.</Card>
      ) : (
        <Card>
          <ul className="divide-y divide-zinc-100">
            {initialLocations.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                    {l.name}
                    {l.status === "suspended" && <Badge tone="red">Suspended</Badge>}
                    {l.source_order_id && <Badge tone="brand">From purchase</Badge>}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {l.contacts.toLocaleString()} contacts · {l.members} team member{l.members === 1 ? "" : "s"} · {l.timezone}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="primary" onClick={() => open(l.id)}>
                    Open
                  </Button>
                  <Button size="sm" onClick={() => setEditingLoc(l)}>
                    Edit
                  </Button>
                  <Button size="sm" onClick={() => setStatus(l, l.status === "suspended" ? "active" : "suspended")}>
                    {l.status === "suspended" ? "Reactivate" : "Suspend"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeletingLoc(l)} disabled={initialLocations.length === 1}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mt-10 mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Users</h2>
        <Button size="sm" onClick={() => setAddingAdmin(true)}>
          Add agency admin
        </Button>
      </div>
      <p className="mb-3 text-xs text-zinc-500">Client users are added from each sub-account&apos;s Settings → Team. Agency admins see every sub-account and manage AI keys.</p>
      <Card>
        <ul className="divide-y divide-zinc-100">
          {users.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {u.name}
                  {u.id === me.id && <span className="text-xs text-zinc-400">(you)</span>}
                  {u.agency_role && <Badge tone="brand">Agency {u.agency_role}</Badge>}
                </div>
                <div className="truncate text-xs text-zinc-500">
                  {u.email}
                  {!u.agency_role && ` · ${u.locations.map((l) => `${l.name} (${l.role})`).join(", ") || "no sub-accounts"}`}
                </div>
              </div>
              <Button size="sm" onClick={() => setEditingUser(u)} disabled={(u.agency_role === "owner" && u.id !== me.id) || (!!u.agency_role && me.role !== "owner" && u.id !== me.id)}>
                Manage
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      {editingLoc && (
        <LocationModal
          loc={editingLoc === "new" ? null : editingLoc}
          onClose={() => setEditingLoc(null)}
          onSaved={() => {
            setEditingLoc(null);
            router.refresh();
          }}
        />
      )}
      {deletingLoc && (
        <DeleteLocation
          loc={deletingLoc}
          onClose={() => setDeletingLoc(null)}
          onDeleted={() => {
            setDeletingLoc(null);
            router.refresh();
          }}
        />
      )}
      {addingAdmin && <AddAdmin onClose={() => setAddingAdmin(false)} onAdded={(u) => (setUsers(u), setAddingAdmin(false))} />}
      {editingUser && <ManageUser user={editingUser} me={me} onClose={() => setEditingUser(null)} onSaved={(u) => (setUsers(u), setEditingUser(null))} />}
    </div>
  );
}

function LocationModal({ loc, onClose, onSaved }: { loc: Loc | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: loc?.name ?? "",
    email: loc?.email ?? "",
    phone: loc?.phone ?? "",
    website: loc?.website ?? "",
    timezone: loc?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "America/Winnipeg",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function save() {
    setBusy(true);
    try {
      await api(loc ? `/api/agency/locations/${loc.id}` : "/api/agency/locations", { method: loc ? "PATCH" : "POST", json: f });
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={loc ? "Edit sub-account" : "New sub-account"}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Business name" htmlFor="lc-name">
          <Input id="lc-name" value={f.name} onChange={set("name")} autoFocus />
        </Field>
        <Field label="Team email" htmlFor="lc-email">
          <Input id="lc-email" type="email" value={f.email} onChange={set("email")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" htmlFor="lc-phone">
            <Input id="lc-phone" value={f.phone} onChange={set("phone")} />
          </Field>
          <Field label="Website" htmlFor="lc-web">
            <Input id="lc-web" value={f.website} onChange={set("website")} />
          </Field>
        </div>
        <Field label="Time zone" htmlFor="lc-tz">
          <Select id="lc-tz" value={f.timezone} onChange={set("timezone")}>
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </Field>
        {!loc && <p className="text-xs text-zinc-500">A starter sales pipeline is created automatically.</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!f.name.trim()}>
            {loc ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteLocation({ loc, onClose, onDeleted }: { loc: Loc; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  async function del() {
    setBusy(true);
    try {
      await api(`/api/agency/locations/${loc.id}`, { method: "DELETE", json: { confirmName: confirm } });
      toast(`${loc.name} deleted`, "success");
      onDeleted();
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Delete sub-account?">
      <div className="space-y-3">
        <p className="text-sm text-zinc-600">
          This permanently deletes <strong>{loc.name}</strong> and everything in it: {loc.contacts.toLocaleString()} contacts, deals, products, orders, automations, sites and funnels. Stripe and
          your mail provider aren&apos;t affected. <strong>This can&apos;t be undone.</strong>
        </p>
        <Field label={`Type “${loc.name}” to confirm`} htmlFor="del-loc">
          <Input id="del-loc" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={confirm.trim() !== loc.name} onClick={del}>
            Delete forever
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function AddAdmin({ onClose, onAdded }: { onClose: () => void; onAdded: (u: U[]) => void }) {
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  async function add() {
    setBusy(true);
    try {
      onAdded(await api<U[]>("/api/agency/users", { method: "POST", json: f }));
      toast("Agency admin added", "success");
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Add agency admin">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Field label="Name" htmlFor="aa-name">
          <Input id="aa-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
        </Field>
        <Field label="Email" htmlFor="aa-email">
          <Input id="aa-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        </Field>
        <Field label="Starting password" hint="10+ characters. Share it with them privately." htmlFor="aa-pw">
          <Input id="aa-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={busy} disabled={!f.name.trim() || !f.email.trim() || f.password.length < 10}>
            Add
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ManageUser({ user, me, onClose, onSaved }: { user: U; me: { id: string; role: "owner" | "admin" }; onClose: () => void; onSaved: (u: U[]) => void }) {
  const [name, setName] = useState(user.name);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function makeLink() {
    setBusy("link");
    try {
      const r = await api<{ url: string }>(`/api/agency/users/${user.id}/login-link`, { method: "POST" });
      setLink(r.url);
      try {
        await navigator.clipboard.writeText(r.url);
        toast("Link copied — send it to them privately", "success");
      } catch {
        /* shown below */
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function patch(json: object, label: string) {
    setBusy(label);
    try {
      onSaved(await api<U[]>(`/api/agency/users/${user.id}`, { method: "PATCH", json }));
      toast("Saved", "success");
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(null);
    }
  }

  async function del() {
    setBusy("delete");
    try {
      onSaved(await api<U[]>(`/api/agency/users/${user.id}`, { method: "DELETE" }));
      toast("User deleted", "success");
    } catch (e) {
      toast((e as Error).message, "error");
      setBusy(null);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Manage ${user.name}`}>
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <Field label="Name" htmlFor="mu-name">
            <Input id="mu-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Button loading={busy === "name"} disabled={!name.trim() || name === user.name} onClick={() => patch({ name }, "name")}>
            Save
          </Button>
        </div>
        <div className="flex items-end gap-2">
          <Field label="Set a new password" hint="10+ characters" htmlFor="mu-pw">
            <Input id="mu-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button loading={busy === "pw"} disabled={password.length < 10} onClick={() => patch({ password }, "pw")}>
            Set
          </Button>
        </div>
        <div className="space-y-2 rounded-lg bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200">
          <div className="flex items-center justify-between gap-2">
            <span>One-time link to set their password (valid 7 days)</span>
            <Button size="sm" loading={busy === "link"} onClick={makeLink}>
              Create link
            </Button>
          </div>
          {link && <code className="block rounded bg-white px-2 py-1.5 font-mono text-xs break-all ring-1 ring-zinc-200">{link}</code>}
        </div>
        {me.role === "owner" && user.agency_role !== "owner" && (
          <div className="flex items-center justify-between rounded-lg bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200">
            <span>{user.agency_role ? "Agency admin (sees every sub-account)" : "Not an agency admin"}</span>
            <Button size="sm" loading={busy === "role"} onClick={() => patch({ agencyAdmin: !user.agency_role }, "role")}>
              {user.agency_role ? "Remove agency access" : "Make agency admin"}
            </Button>
          </div>
        )}
        {user.id !== me.id && user.agency_role !== "owner" && (
          <div className="border-t border-zinc-100 pt-4">
            {confirmDel ? (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span>Delete {user.name}&apos;s login permanently?</span>
                <Button size="sm" variant="danger" loading={busy === "delete"} onClick={del}>
                  Delete
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="danger" onClick={() => setConfirmDel(true)}>
                Delete user
              </Button>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
