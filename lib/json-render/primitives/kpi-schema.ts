import { z } from 'zod';

const delta = z.object({
  value: z.string().describe('Display string for the change, e.g. "+8%" or "-$2.1M"'),
  trend: z.enum(['up', 'down', 'flat']),
});

export const kpiPropsSchema = z.object({
  label: z.string().describe('What the metric measures'),
  value: z.string().describe('The headline metric value, pre-formatted'),
  delta: delta.optional(),
  caption: z.string().optional().describe('Optional small line beneath the value'),
});

export type KpiProps = z.infer<typeof kpiPropsSchema>;
export type KpiInput = z.input<typeof kpiPropsSchema>;

export const kpiPrimitive = {
  description: 'A headline stat (KPI) with optional delta indicator. Pre-format value strings.',
  propsSchema: kpiPropsSchema,
};
