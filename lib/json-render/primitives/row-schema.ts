import { z } from 'zod';

export const rowPropsSchema = z.object({
  gap: z
    .enum(['tight', 'normal', 'loose'])
    .default('normal')
    .describe('Horizontal spacing between children: tight=gap-2, normal=gap-4, loose=gap-6'),
  align: z
    .enum(['start', 'center', 'end', 'stretch'])
    .default('stretch')
    .describe('Cross-axis alignment of children (items-*)'),
});

export type RowProps = z.infer<typeof rowPropsSchema>;
export type RowInput = z.input<typeof rowPropsSchema>;

export const rowPrimitive = {
  description:
    'A horizontal layout. Children render in equal-width flex slots. Use to compose KPIs, badges, or buttons side-by-side. Wrap in a Card for dashboard headers.',
  propsSchema: rowPropsSchema,
};
