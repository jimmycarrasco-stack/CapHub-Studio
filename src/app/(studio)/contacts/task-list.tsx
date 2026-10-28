"use client";

import Link from "next/link";
import { useState } from "react";
import { api, Button, cx, EmptyState, Input, toast } from "@/components/ui";

export interface TaskItem {
  id: string;
  contact_id: string | null;
  contact_name: string | null;
  title: string;
  due_at: string | null;
  done: boolean;
}

/** Task list with add / complete / delete. Pass contactId to scope new tasks to a contact. */
export function TaskList({ initial, contactId, compact }: { initial: TaskItem[]; contactId?: string; compact?: boolean }) {
  const [tasks, setTasks] = useState(initial);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  async function add() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/tasks", { method: "POST", json: { title, contactId: contactId ?? null, dueAt: due || null } });
      setTasks([{ id, contact_id: contactId ?? null, contact_name: null, title: title.trim(), due_at: due || null, done: false }, ...tasks]);
      setTitle("");
      setDue("");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(t: TaskItem) {
    setTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)));
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", json: { done: !t.done } });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function remove(t: TaskItem) {
    setTasks(tasks.filter((x) => x.id !== t.id));
    try {
      await api(`/api/tasks/${t.id}`, { method: "DELETE" });
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const sorted = [...tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due_at ?? "9999").localeCompare(b.due_at ?? "9999"));

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input aria-label="New task" placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} className="min-w-[180px] flex-1" />
        <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-auto" />
        <Button type="submit" loading={busy} disabled={!title.trim()} aria-label="Add task">
          Add
        </Button>
      </form>
      {sorted.length === 0 ? (
        compact ? <p className="text-sm text-zinc-500">No tasks.</p> : <EmptyState title="No tasks yet">Tasks you or your automations create show up here.</EmptyState>
      ) : (
        <ul className={cx("divide-y divide-zinc-100", !compact && "rounded-xl bg-white ring-1 ring-zinc-200")}>
          {sorted.map((t) => (
            <li key={t.id} className={cx("group flex items-center gap-3 py-2.5", !compact && "px-4")}>
              <input type="checkbox" checked={t.done} onChange={() => toggle(t)} aria-label={`Mark “${t.title}” done`} className="size-4 accent-brand-600" />
              <div className="min-w-0 flex-1">
                <div className={cx("truncate text-sm", t.done && "text-zinc-400 line-through")}>{t.title}</div>
                <div className="text-xs text-zinc-400">
                  {!contactId && t.contact_id && (
                    <Link href={`/contacts/${t.contact_id}`} className="hover:text-brand-600">
                      {t.contact_name || "Contact"}
                    </Link>
                  )}
                  {t.due_at && (
                    <span className={cx(!t.done && t.due_at < today && "font-medium text-red-600")}>
                      {!contactId && t.contact_id ? " · " : ""}due {t.due_at}
                    </span>
                  )}
                </div>
              </div>
              <button type="button" onClick={() => remove(t)} className="text-xs text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-600 focus:opacity-100" aria-label={`Delete “${t.title}”`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
