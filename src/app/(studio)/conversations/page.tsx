import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { listMessages, smtpStatus } from "@/lib/crm/email";
import { pageCtx } from "@/lib/page-ctx";
import { MessageList } from "../contacts/[id]/contact-view";

export const metadata = { title: "Conversations" };

export default async function ConversationsPage() {
  const ctx = await pageCtx();
  const messages = listMessages(ctx.location.id, { limit: 300 });
  const smtp = smtpStatus(ctx.location.id);
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-10">
      <PageHeader title="Conversations" subtitle="Every email sent from this account — one-off emails, automation emails and team notifications." />
      {!smtp.configured && (
        <Link href="/settings#email" className="mb-6 block rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200 hover:bg-amber-100">
          <strong className="font-semibold">Email isn&apos;t set up yet.</strong> Connect your mail server (Gmail, Outlook, SendGrid, Resend…) to send emails →
        </Link>
      )}
      {messages.length === 0 ? (
        <EmptyState title="No emails yet">Send one from a contact&apos;s page, or let an automation do it.</EmptyState>
      ) : (
        <MessageList messages={messages} showContact />
      )}
    </div>
  );
}
