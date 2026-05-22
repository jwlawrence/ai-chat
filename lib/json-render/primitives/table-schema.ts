import { z } from 'zod';

const column = z.object({
  key: z.string().describe('Property name in each row to read the cell value from'),
  label: z.string().describe('Column header text'),
  align: z.enum(['left', 'center', 'right']).optional().default('left'),
});

const cellValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const row = z.record(z.string(), cellValue);

export const tablePropsSchema = z.object({
  columns: z.array(column).min(1).max(10),
  rows: z.array(row).max(50).describe('Data rows. Cap at 50 to keep spec size bounded.'),
  caption: z.string().optional(),
});

export type TableProps = z.infer<typeof tablePropsSchema>;
export type TableInput = z.input<typeof tablePropsSchema>;

export const tablePrimitive = {
  description:
    'A tabular data display. Columns describe the schema; rows hold the data. Cap at 10 columns × 50 rows.',
  propsSchema: tablePropsSchema,
};
