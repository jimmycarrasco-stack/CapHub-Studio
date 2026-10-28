import { notFound } from "next/navigation";
import { getContact, listActivities, listLocationTags, listTasks, contactName } from "@/lib/crm/contacts";
import { listAutomations, listRuns } from "@/lib/crm/automations";
import { listMessages, smtpStatus } from "@/lib/crm/email";
import { listOrders } from "@/lib/crm/payments";
import { listContactOpportunities, listPipelines } from "@/lib/crm/pipelines";
import { pageAccess } from "@/lib/page-ctx";
import { ContactView } from "./contact-view";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const c = getContact((await params).id);
  return { title: c ? contactName(c) : "Contact" };
}

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const c = getContact((await params).id);
  if (!c) notFound();
  await pageAccess(c.location_id);
  return (
    <ContactView
      contact={c}
      activities={listActivities(c.id)}
      tasks={listTasks(c.location_id, { contactId: c.id })}
      deals={listContactOpportunities(c.id)}
      orders={listOrders(c.location_id, { contactId: c.id })}
      messages={listMessages(c.location_id, { contactId: c.id, limit: 50 })}
      runs={listRuns({ contactId: c.id, limit: 30 })}
      automations={listAutomations(c.location_id).map((a) => ({ id: a.id, name: a.name, enabled: a.enabled }))}
      pipelines={listPipelines(c.location_id).map((p) => ({ id: p.id, name: p.name }))}
      allTags={listLocationTags(c.location_id).map((t) => t.tag)}
      emailReady={smtpStatus(c.location_id).configured}
    />
  );
}
