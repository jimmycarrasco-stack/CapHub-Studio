import "server-only";

/**
 * CRM event bus. Contacts, pipelines, payments and forms emit events; the automation engine
 * subscribes (registered lazily to avoid an import cycle).
 */

export type CrmEvent =
  | { type: "contact_created"; contactId: string; data?: undefined }
  | { type: "tag_added"; contactId: string; data: { tag: string } }
  | {
      type: "form_submitted";
      contactId: string;
      data: {
        siteId: string;
        formName: string;
        fields: Record<string, string>;
      };
    }
  | {
      type: "opportunity_stage_changed";
      contactId: string | null;
      data: { opportunityId: string; pipelineId: string; stageId: string };
    }
  | {
      type: "opportunity_status_changed";
      contactId: string | null;
      data: {
        opportunityId: string;
        pipelineId: string;
        status: "won" | "lost" | "open";
      };
    }
  | {
      type: "payment_received";
      contactId: string | null;
      data: {
        orderId: string;
        productId: string | null;
        amountCents: number;
        currency: string;
      };
    }
  | {
      type: "webhook";
      contactId: string;
      data: { automationId: string; payload: Record<string, unknown> };
    }
  | { type: "manual"; contactId: string; data: { automationId: string } };

export type EventMeta = { depth?: number };
type Handler = (locationId: string, event: CrmEvent, meta: EventMeta) => void;

const g = globalThis as unknown as { __caphubEventHandlers?: Handler[] };
const handlers = (g.__caphubEventHandlers ??= []);

export function onEvent(h: Handler) {
  if (!handlers.includes(h)) handlers.push(h);
}

export function emitEvent(locationId: string, event: CrmEvent, meta: EventMeta = {}) {
  for (const h of handlers) {
    try {
      h(locationId, event, meta);
    } catch (err) {
      console.error("[caphub] event handler failed", err);
    }
  }
}
