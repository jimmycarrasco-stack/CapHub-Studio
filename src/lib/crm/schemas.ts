import { z } from "zod";

/** Request schemas shared between route files (route modules may only export handlers). */

export const contactInputSchema = z.object({
  first_name: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  email: z.string().trim().email("Enter a valid email").max(200).nullable().optional().or(z.literal("")),
  phone: z.string().max(40).nullable().optional(),
  company: z.string().max(200).optional(),
  source: z.string().max(100).optional(),
  custom: z.record(z.string().max(60), z.string().max(2000)).optional(),
  dnd: z.boolean().optional(),
  tags: z.array(z.string().max(50)).max(50).optional(),
});

export const productInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().min(50).max(1e10),
  currency: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z]{3}$/)
    .optional(),
  interval: z.enum(["month", "year"]).nullable().optional(),
  active: z.boolean().optional(),
});

export const locationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  website: z.string().trim().max(200).optional(),
  timezone: z
    .string()
    .trim()
    .max(60)
    .refine((tz) => Intl.supportedValuesOf("timeZone").includes(tz), "Unknown time zone")
    .optional(),
});
