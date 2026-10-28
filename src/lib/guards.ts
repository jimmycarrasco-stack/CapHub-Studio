import "server-only";
import { requireAccess, type LocationRole } from "./auth";
import { HttpError } from "./errors";
import { getApp } from "./apps/repo";
import { getAgent, getSite } from "./repo";

/**
 * Load a record and check the signed-in user may access its sub-account.
 * Missing and forbidden both return 404 so IDs can't be probed across sub-accounts.
 */

export async function siteFor(id: string, minRole: LocationRole = "user") {
  const site = getSite(id);
  if (!site) throw new HttpError(404, "Site not found");
  const ctx = await requireAccess(site.location_id, minRole);
  return { site, ctx };
}

export async function agentFor(id: string, minRole: LocationRole = "user") {
  const agent = getAgent(id);
  if (!agent) throw new HttpError(404, "Agent not found");
  const ctx = await requireAccess(agent.location_id, minRole);
  return { agent, ctx };
}

export async function appFor(id: string, minRole: LocationRole = "user") {
  const app = getApp(id);
  if (!app) throw new HttpError(404, "App not found");
  const ctx = await requireAccess(app.location_id, minRole);
  return { app, ctx };
}

// ───────── CRM records ─────────

import { getAutomation } from "./crm/automations";
import { getContact } from "./crm/contacts";
import { getProduct } from "./crm/payments";
import { getOpportunity, getPipeline } from "./crm/pipelines";
import { getFunnel } from "./crm/funnels";

async function guarded<T extends { location_id: string | null }>(rec: T | null, label: string, minRole: LocationRole) {
  if (!rec) throw new HttpError(404, `${label} not found`);
  const ctx = await requireAccess(rec.location_id, minRole);
  return { rec, ctx };
}

export const contactFor = async (id: string, minRole: LocationRole = "user") => guarded(getContact(id), "Contact", minRole);
export const pipelineFor = async (id: string, minRole: LocationRole = "user") => guarded(getPipeline(id), "Pipeline", minRole);
export const opportunityFor = async (id: string, minRole: LocationRole = "user") => guarded(getOpportunity(id), "Deal", minRole);
export const productFor = async (id: string, minRole: LocationRole = "user") => guarded(getProduct(id), "Product", minRole);
export const automationFor = async (id: string, minRole: LocationRole = "user") => guarded(getAutomation(id), "Automation", minRole);
export const funnelFor = async (id: string, minRole: LocationRole = "user") => guarded(getFunnel(id), "Funnel", minRole);
