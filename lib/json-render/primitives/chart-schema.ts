import { z } from 'zod';

const chartKind = z.enum(['line', 'bar', 'area', 'pie']);

const seriesEntry = z.object({
  key: z.string().describe('Property name in each data row to read this series value from'),
  label: z.string().optional().describe('Display name for the legend; defaults to key'),
  color: z
    .string()
    .regex(/^(hsl\(.+\)|#[0-9a-fA-F]{3,8}|var\(.+\))$/)
    .optional()
    .describe('CSS color, hex, or CSS variable. Omit to use theme defaults.'),
  endpointLabel: z
    .string()
    .optional()
    .describe('Optional label rendered at the right edge of the last data point. Line/area only.'),
});

const dataRow = z.record(z.string(), z.union([z.string(), z.number()]));

const annotation = z.object({
  x: z.string().describe('xKey value where the annotation lands; must match an entry in data'),
  label: z.string().describe('Short callout text shown at the annotation'),
});

export const chartPropsSchema = z.object({
  kind: chartKind.describe('Chart type'),
  data: z
    .array(dataRow)
    .min(1)
    .max(100)
    .describe('Rows of data points. Cap at 100 to keep spec size bounded.'),
  series: z
    .array(seriesEntry)
    .min(1)
    .max(8)
    .describe('Which data keys to plot as series. Pie charts use only the first series.'),
  xKey: z.string().describe('Property name in each data row used as the x-axis / category label'),
  title: z.string().optional().describe('Optional chart title rendered above the chart'),
  yAxisLabel: z.string().optional(),
  legend: z.boolean().optional().default(true),
  grid: z.boolean().optional().default(true),
  annotations: z
    .array(annotation)
    .max(4)
    .optional()
    .describe('Optional vertical callouts at specific x values. Line/bar/area only.'),
});

export type ChartProps = z.infer<typeof chartPropsSchema>;
export type ChartInput = z.input<typeof chartPropsSchema>;

export const chartPrimitive = {
  description:
    'A data visualization. Choose `kind` based on intent: line for trends, bar for comparisons, area for stacked trends, pie for parts-of-a-whole. Provide data as rows; series.key picks the numeric value per row.',
  propsSchema: chartPropsSchema,
};
