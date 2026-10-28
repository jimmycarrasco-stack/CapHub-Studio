import "server-only";
import nodemailer from "nodemailer";
import { db } from "../db";
import { HttpError } from "../errors";
import { getLocation } from "../auth";
import { addActivity, getContact, touchContact } from "./contacts";
import { getLocSetting, secretHint } from "./location-settings";

/**
 * Outbound email through the sub-account's own SMTP server (Gmail/Workspace, Outlook, Resend,
 * SendGrid, Mailgun, Postmark… all offer SMTP). Every message is logged to the contact.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}

export function getSmtp(locationId: string): SmtpConfig | null {
  const host = getLocSetting(locationId, "smtp_host");
  const fromEmail = getLocSetting(locationId, "smtp_from_email");
  if (!host || !fromEmail) return null;
  const port = Number(getLocSetting(locationId, "smtp_port") || 587);
  return {
    host,
    port,
    secure: (getLocSetting(locationId, "smtp_secure") ?? (port === 465 ? "1" : "0")) === "1",
    user: getLocSetting(locationId, "smtp_user") ?? "",
    pass: getLocSetting(locationId, "smtp_pass") ?? "",
    fromName: getLocSetting(locationId, "smtp_from_name") ?? getLocation(locationId)?.name ?? "",
    fromEmail,
  };
}

export function smtpStatus(locationId: string) {
  const c = getSmtp(locationId);
  return c
    ? {
        configured: true,
        host: c.host,
        port: c.port,
        secure: c.secure,
        user: c.user,
        fromName: c.fromName,
        fromEmail: c.fromEmail,
        passHint: secretHint(locationId, "smtp_pass"),
      }
    : { configured: false };
}

function transport(c: SmtpConfig) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    connectionTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export async function verifySmtp(locationId: string) {
  const c = getSmtp(locationId);
  if (!c) throw new HttpError(400, "Email isn't set up yet");
  try {
    await transport(c).verify();
  } catch (err) {
    throw new HttpError(502, `SMTP connection failed: ${(err as Error).message}`);
  }
}

/** Replaces {{contact.first_name}}-style merge fields. Unknown fields become empty. */
export function renderTemplate(tpl: string, vars: Record<string, unknown>) {
  return tpl.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => {
    let v: unknown = vars;
    for (const part of key.split(".")) v = v && typeof v === "object" ? (v as Record<string, unknown>)[part] : undefined;
    return v === undefined || v === null ? "" : String(v);
  });
}

export function mergeVars(contactId: string | null, extra: Record<string, unknown> = {}) {
  const c = contactId ? getContact(contactId) : null;
  return {
    contact: c
      ? {
          first_name: c.first_name,
          last_name: c.last_name,
          name: `${c.first_name} ${c.last_name}`.trim(),
          email: c.email ?? "",
          phone: c.phone ?? "",
          company: c.company,
          ...c.custom,
        }
      : {},
    ...extra,
  };
}

function textToHtml(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.55;color:#18181b">${esc
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
}

/**
 * Sends a plain-text email (rendered to simple HTML) and logs it. Never throws for delivery
 * failures — the result says what happened and the failure is logged on the contact.
 */
export async function sendEmail(
  locationId: string,
  input: {
    to: string;
    subject: string;
    body: string;
    contactId?: string | null;
    userId?: string;
    skipDnd?: boolean;
  },
): Promise<{ ok: boolean; error?: string; messageId?: number }> {
  const contact = input.contactId ? getContact(input.contactId) : null;
  const log = (status: "sent" | "failed", error: string | null, providerId: string | null, from: string) => {
    const r = db()
      .prepare(
        `INSERT INTO crm_messages (location_id, contact_id, channel, direction, to_addr, from_addr, subject, body, status, error, provider_id)
         VALUES (?, ?, 'email', 'out', ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(locationId, input.contactId ?? null, input.to, from, input.subject, input.body, status, error, providerId);
    if (input.contactId) {
      addActivity(
        locationId,
        input.contactId,
        "email",
        status === "sent" ? `Email sent: ${input.subject}` : `Email failed: ${input.subject} — ${error}`,
        { messageId: Number(r.lastInsertRowid) },
        input.userId,
      );
      touchContact(input.contactId);
    }
    return Number(r.lastInsertRowid);
  };

  if (contact?.dnd && !input.skipDnd) {
    return {
      ok: false,
      error: "Contact is marked Do Not Contact",
      messageId: log("failed", "Contact is marked Do Not Contact", null, ""),
    };
  }
  const c = getSmtp(locationId);
  if (!c)
    return {
      ok: false,
      error: "Email isn't set up (Settings → Email)",
      messageId: log("failed", "Email isn't set up", null, ""),
    };
  const from = c.fromName ? `"${c.fromName.replace(/"/g, "")}" <${c.fromEmail}>` : c.fromEmail;
  try {
    const info = await transport(c).sendMail({
      from,
      to: input.to,
      subject: input.subject,
      text: input.body,
      html: textToHtml(input.body),
    });
    return {
      ok: true,
      messageId: log("sent", null, info.messageId ?? null, c.fromEmail),
    };
  } catch (err) {
    const msg = (err as Error).message.slice(0, 500);
    return {
      ok: false,
      error: msg,
      messageId: log("failed", msg, null, c.fromEmail),
    };
  }
}

export interface MessageRow {
  id: number;
  contact_id: string | null;
  contact_name: string | null;
  channel: string;
  direction: string;
  to_addr: string;
  subject: string;
  body: string;
  status: string;
  error: string | null;
  created_at: string;
}

export function listMessages(locationId: string, opts: { contactId?: string; limit?: number } = {}): MessageRow[] {
  const where = ["m.location_id = ?"];
  const args: unknown[] = [locationId];
  if (opts.contactId) {
    where.push("m.contact_id = ?");
    args.push(opts.contactId);
  }
  return db()
    .prepare(
      `SELECT m.id, m.contact_id, TRIM(c.first_name || ' ' || c.last_name) AS contact_name, m.channel, m.direction, m.to_addr, m.subject,
         m.body, m.status, m.error, m.created_at
       FROM crm_messages m LEFT JOIN contacts c ON c.id = m.contact_id WHERE ${where.join(" AND ")} ORDER BY m.id DESC LIMIT ?`,
    )
    .all(...args, opts.limit ?? 200) as MessageRow[];
}
