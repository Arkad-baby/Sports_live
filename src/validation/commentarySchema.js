import { z } from 'zod';

/**
 * Event Types Enum
 */
export const EventTypeEnum = z.enum([
  'GOAL',
  'YELLOW_CARD',
  'RED_CARD',
  'SUBSTITUTION',
  'PENALTY',
  'CORNER',
  'FOUL',
  'SAVE',
  'KICKOFF',
  'HALFTIME',
  'FULLTIME',
]);

/**
 * Period Enum
 */
export const PeriodEnum = z.enum([
  'FIRST_HALF',
  'SECOND_HALF',
  'EXTRA_TIME',
  'PENALTY_SHOOTOUT',
]);

/**
 * Create Commentary Schema
 */
export const CreateCommentarySchema = z.object({
  matchesId: z.number().int().positive('Match ID must be positive'),
  minute: z.number().int().min(0).max(200).nullable().optional(),
  sequence: z.number().int().positive().nullable().optional(),
  period: PeriodEnum.nullable().optional(),
  eventType: EventTypeEnum.nullable().optional(),
  actor: z.string().max(255).nullable().optional(),
  team: z.string().max(255).nullable().optional(),
  message: z.string().min(1, 'Message is required').max(1000),
  metadata: z.record(z.any()).nullable().optional(),
  tags: z.array(z.string()).max(20).nullable().optional(),
});

/**
 * Update Commentary Schema
 */
export const UpdateCommentarySchema = z.object({
  matchesId: z.number().int().positive().optional(),
  minute: z.number().int().min(0).max(200).nullable().optional(),
  sequence: z.number().int().positive().nullable().optional(),
  period: PeriodEnum.nullable().optional(),
  eventType: EventTypeEnum.nullable().optional(),
  actor: z.string().max(255).nullable().optional(),
  team: z.string().max(255).nullable().optional(),
  message: z.string().min(1).max(1000).optional(),
  metadata: z.record(z.any()).nullable().optional(),
  tags: z.array(z.string()).max(20).nullable().optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: 'At least one field is required',
});

/**
 * ID Param Schema
 */
export const IdParamSchema = z.object({
  id: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * Match ID Param Schema
 */
export const MatchIdParamSchema = z.object({
  matchId: z.string().regex(/^\d+$/).transform(Number),
});