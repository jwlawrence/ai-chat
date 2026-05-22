'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartInput as ChartProps } from './chart-schema';

const FALLBACK_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

function buildConfig(series: ChartProps['series']) {
  return Object.fromEntries(
    series.map((s, i) => [
      s.key,
      {
        label: s.label ?? s.key,
        color: s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      },
    ]),
  );
}

function ChartBody(props: ChartProps) {
  const { kind, data, series, xKey, yAxisLabel, legend = true, grid = true } = props;

  if (kind === 'pie') {
    const first = series[0];
    return (
      <PieChart>
        <Pie data={data} dataKey={first.key} nameKey={xKey} label>
          {data.map((row, i) => (
            <Cell
              key={`${String(row[xKey] ?? i)}-${i}`}
              fill={first.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltipContent />} />
        {legend && <Legend />}
      </PieChart>
    );
  }

  const sharedAxes = (
    <>
      {grid && <CartesianGrid strokeDasharray="3 3" />}
      <XAxis dataKey={xKey} />
      <YAxis
        label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft' } : undefined}
      />
      <Tooltip content={<ChartTooltipContent />} />
      {legend && <Legend />}
    </>
  );

  if (kind === 'line') {
    return (
      <LineChart data={data}>
        {sharedAxes}
        {series.map((s, i) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
            dot={false}
          />
        ))}
      </LineChart>
    );
  }

  if (kind === 'bar') {
    return (
      <BarChart data={data}>
        {sharedAxes}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            fill={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
          />
        ))}
      </BarChart>
    );
  }

  return (
    <AreaChart data={data}>
      {sharedAxes}
      {series.map((s, i) => (
        <Area
          key={s.key}
          dataKey={s.key}
          name={s.label ?? s.key}
          fill={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
          stroke={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
        />
      ))}
    </AreaChart>
  );
}

export function Chart(props: ChartProps) {
  const { data, series, title } = props;
  const config = buildConfig(series);

  if (data.length === 0) {
    return (
      <div className="w-full space-y-2">
        {title && <h3 className="font-medium text-sm">{title}</h3>}
        <div className="flex h-[200px] items-center justify-center text-muted-foreground text-sm">
          No data
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-2">
      {title && <h3 className="font-medium text-sm">{title}</h3>}
      <ChartContainer config={config} className="w-full">
        <ChartBody {...props} />
      </ChartContainer>
    </div>
  );
}
