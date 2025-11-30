import { z } from 'zod';
import {
  CALL_OUTCOME_LIST,
  CONTACT_STATUS_LIST,
  SWISS_CANTONS,
  TMA_STATUS_LIST,
} from '../utils/constants';

const phoneSchema = z
  .string()
  .trim()
  .min(3, 'Phone number must be at least 3 characters')
  .max(50, 'Phone number is too long')
  .optional()
  .nullable();

const emailSchema = z.string().trim().email('Invalid email address').optional().nullable();

const optionalTextSchema = z.string().trim().max(2000, 'Notes are too long').optional().nullable();

const statusSchema = z.enum(CONTACT_STATUS_LIST, {
  message: 'Invalid contact status',
});

const baseContactSchema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required'),
  contact_name: z.string().trim().min(1, 'Contact name is required'),
  phone: phoneSchema,
  email: emailSchema,
  canton: z.enum(SWISS_CANTONS).optional().nullable(),
  last_call: z.string().datetime().optional().nullable(),
  follow_up_at: z.string().datetime().optional().nullable(),
  follow_up_note: optionalTextSchema,
  notes: optionalTextSchema,
});

export const ContactCreateSchema = baseContactSchema.extend({
  status: statusSchema.nullable().optional().default(null),
});

export const ContactUpdateSchema = baseContactSchema
  .extend({
    status: statusSchema.nullable().optional(),
  })
  .partial();

export const ContactFilterSchema = z.object({
  status: z.enum(CONTACT_STATUS_LIST).optional(),
  canton: z.enum(SWISS_CANTONS).optional(),
  search: z.string().trim().min(1).optional(),
  list_id: z.string().trim().min(1).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
});

export const CallLogCreateSchema = z.object({
  contact_id: z.string().trim().min(1, 'contact_id is required'),
  outcome: z.enum(CALL_OUTCOME_LIST, {
    message: 'Invalid call outcome',
  }),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const CallLogQuerySchema = z.object({
  contact_id: z.string().trim().min(1, 'contact_id is required'),
});

const tmaBaseSchema = z.object({
  first_name: z.string().trim().min(1, "First name is required"),
  last_name: z.string().trim().min(1, "Last name is required"),
  phone: phoneSchema,
  email: emailSchema,
  canton: z.enum(SWISS_CANTONS).optional().nullable(),
  position_title: optionalTextSchema,
  notes: optionalTextSchema,
  follow_up_at: z.string().datetime().optional().nullable(),
  follow_up_note: optionalTextSchema,
  cv_url: z.string().url().optional().nullable(),
  references_url: z.string().url().optional().nullable(),
  short_profile_url: z.string().url().optional().nullable(),
});

export const TmaCreateSchema = tmaBaseSchema.extend({
  status: z.enum(TMA_STATUS_LIST).nullable().optional().default(null),
});

export const TmaUpdateSchema = tmaBaseSchema.extend({
  status: z.enum(TMA_STATUS_LIST).nullable().optional(),
}).partial();

export const TmaFilterSchema = z.object({
  status: z.enum(TMA_STATUS_LIST).optional(),
  canton: z.enum(SWISS_CANTONS).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
});

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>;
export type ContactFilterInput = z.infer<typeof ContactFilterSchema>;
export type CallLogCreateInput = z.infer<typeof CallLogCreateSchema>;
export type TmaCreateInput = z.infer<typeof TmaCreateSchema>;
export type TmaUpdateInput = z.infer<typeof TmaUpdateSchema>;
export type TmaFilterInput = z.infer<typeof TmaFilterSchema>;
