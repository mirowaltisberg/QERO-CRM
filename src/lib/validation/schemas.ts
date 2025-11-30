import { z } from 'zod';
import {
  CALL_OUTCOME_LIST,
  CONTACT_STATUS,
  CONTACT_STATUS_LIST,
  SWISS_CANTONS,
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
  notes: optionalTextSchema,
});

export const ContactCreateSchema = baseContactSchema.extend({
  status: statusSchema.default(CONTACT_STATUS.NEW),
});

export const ContactUpdateSchema = baseContactSchema
  .extend({
    status: statusSchema.optional(),
  })
  .partial();

export const ContactFilterSchema = z.object({
  status: z.enum(CONTACT_STATUS_LIST).optional(),
  canton: z.enum(SWISS_CANTONS).optional(),
  search: z.string().trim().min(1).optional(),
  list_id: z.string().trim().min(1).optional(),
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

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>;
export type ContactFilterInput = z.infer<typeof ContactFilterSchema>;
export type CallLogCreateInput = z.infer<typeof CallLogCreateSchema>;
