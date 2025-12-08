import { z } from 'zod';
import {
  CALL_OUTCOME_LIST,
  CONTACT_STATUS_LIST,
  SWISS_CANTONS,
  TMA_STATUS_LIST,
  TMA_ACTIVITY,
} from '../utils/constants';

const TMA_ACTIVITY_LIST = [TMA_ACTIVITY.ACTIVE, TMA_ACTIVITY.INACTIVE] as const;

const phoneSchema = z
  .string()
  .trim()
  .min(3, 'Phone number must be at least 3 characters')
  .max(50, 'Phone number is too long')
  .optional()
  .nullable();

const emailSchema = z.string().trim().email('Invalid email address').optional().nullable();

const optionalTextSchema = z.string().trim().max(2000, 'Notes are too long').optional().nullable();
const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/, 'Color must be a valid hex value')
  .optional()
  .default('#4B5563');

const statusSchema = z.enum(CONTACT_STATUS_LIST, {
  message: 'Invalid contact status',
});

const baseContactSchema = z.object({
  company_name: z.string().trim().min(1, 'Company name is required'),
  contact_name: z.string().trim().min(1, 'Contact name is required'),
  phone: phoneSchema,
  email: emailSchema,
  canton: z.enum(SWISS_CANTONS).optional().nullable(),
  city: optionalTextSchema,
  street: optionalTextSchema,
  postal_code: optionalTextSchema,
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  last_call: z.string().datetime().optional().nullable(),
  follow_up_at: z.string().datetime().optional().nullable(),
  follow_up_note: optionalTextSchema,
  notes: optionalTextSchema,
  team_id: z.string().uuid().optional().nullable(),
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

export const ContactPersonSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required'),
  last_name: z.string().trim().min(1, 'Last name is required'),
  role: optionalTextSchema,
  mobile: phoneSchema,
  direct_phone: phoneSchema,
  email: emailSchema,
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
  city: optionalTextSchema,
  street: optionalTextSchema,
  postal_code: optionalTextSchema,
  position_title: optionalTextSchema,
  notes: optionalTextSchema,
  follow_up_at: z.string().datetime().optional().nullable(),
  follow_up_note: optionalTextSchema,
  cv_url: z.string().url().optional().nullable(),
  references_url: z.string().url().optional().nullable(),
  short_profile_url: z.string().url().optional().nullable(),
  team_id: z.string().uuid().optional().nullable(),
  status_tags: z
    .array(z.enum(TMA_STATUS_LIST))
    .optional()
    .transform((tags) => {
      if (!tags) return [];
      const deduped = Array.from(new Set(tags));
      const order = ["A", "B", "C"] as const;
      return deduped.sort((a, b) => order.indexOf(a as (typeof order)[number]) - order.indexOf(b as (typeof order)[number]));
    }),
});

export const TmaCreateSchema = tmaBaseSchema.extend({
  status: z.enum(TMA_STATUS_LIST).nullable().optional().default(null),
  activity: z.enum(TMA_ACTIVITY_LIST).nullable().optional().default(null),
}).transform((data) => ({
  ...data,
  status_tags:
    data.status_tags && data.status_tags.length > 0
      ? data.status_tags
      : data.status
      ? [data.status]
      : [],
  status: data.status ?? null,
}));

export const TmaUpdateSchema = tmaBaseSchema.extend({
  status: z.enum(TMA_STATUS_LIST).nullable().optional(),
  activity: z.enum(TMA_ACTIVITY_LIST).nullable().optional(),
  claimed_by: z.string().uuid().nullable().optional(),
})
  .partial()
  .transform((data) => ({
    ...data,
    status_tags:
      data.status_tags && data.status_tags.length > 0
        ? data.status_tags
        : data.status !== undefined
        ? data.status
          ? [data.status]
          : []
        : data.status_tags,
  }));

export const TmaFilterSchema = z.object({
  status: z.enum(TMA_STATUS_LIST).optional(),
  activity: z.enum(TMA_ACTIVITY_LIST).optional(),
  canton: z.enum(SWISS_CANTONS).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(1000).optional(),
});

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>;
export type ContactPersonInput = z.infer<typeof ContactPersonSchema>;
export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>;
export type ContactFilterInput = z.infer<typeof ContactFilterSchema>;
export type CallLogCreateInput = z.infer<typeof CallLogCreateSchema>;
export type TmaCreateInput = z.infer<typeof TmaCreateSchema>;
export type TmaUpdateInput = z.infer<typeof TmaUpdateSchema>;
export type TmaFilterInput = z.infer<typeof TmaFilterSchema>;

export const TmaRoleCreateSchema = z.object({
  name: z.string().trim().min(1, "Role name is required").max(64, "Role name is too long"),
  color: hexColorSchema,
  note: z.string().trim().max(500, "Role note is too long").optional().nullable(),
});

export const TmaRoleUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    color: hexColorSchema.optional(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "No fields provided for update",
    path: ["name"],
  });

export type TmaRoleCreateInput = z.infer<typeof TmaRoleCreateSchema>;
export type TmaRoleUpdateInput = z.infer<typeof TmaRoleUpdateSchema>;
