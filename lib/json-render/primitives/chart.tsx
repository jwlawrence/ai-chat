'use client';

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart';
import type { ChartInput as ChartProps } from './chart-schema';

// Recharts' own entrance animations are switched off on every series
// (`isAnimationActive={false}`). Two reasons: a chart always mounts inside
// AnimatedCardShell, whose GSAP cascade is the one authored entrance the
// design system allows, so recharts' draw-on animation is a second motion
// system competing inside it; and unlike the GSAP path it is not gated on
// `prefers-reduced-motion`. Switching it off also makes charts deterministic
// wherever requestAnimationFrame is throttled — background tabs, print,
// screenshot tooling — where a frame-zero line renders as an empty plot.
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

// Endpoint labels render as an HTML caption row below the chart rather than as
// SVG <LabelList> nodes inside it. Two reasons:
//   1. SVG labels are unreliable in narrow viewports — recharts clips text that
//      overflows the chart's right margin.
//   2. <LabelList> with a custom `content` callback doesn't render in jsdom,
//      so the test surface for endpoint labels would otherwise be empty.
// The caption row gives the same scanning information at a glance and stays
// accessible to screen readers.
function EndpointCaptions({
  series,
  config,
}: {
  series: ChartProps['series'];
  config: ReturnType<typeof buildConfig>;
}) {
  const labelled = series.filter((s) => Boolean(s.endpointLabel));
  if (labelled.length === 0) return null;
  return (
    <ul
      data-testid="chart-endpoint-captions"
      className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs"
    >
      {labelled.map((s) => {
        const color = config[s.key]?.color ?? 'currentColor';
        return (
          <li key={s.key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="text-foreground/80">{`${s.label ?? s.key}: ${s.endpointLabel}`}</span>
          </li>
        );
      })}
    </ul>
  );
}

function ChartBody(props: ChartProps) {
  const {
    kind,
    data,
    series,
    xKey,
    yAxisLabel,
    legend = true,
    grid = true,
    annotations = [],
  } = props;

  if (kind === 'pie') {
    const first = series[0];
    // A pie has a single series, so sectors are colored per data ROW (a
    // parts-of-a-whole split), not per series. Bake a distinct `fill` onto each
    // row from the theme palette so every slice reads differently; honor an
    // explicit per-row `color` when one is supplied. (Passing <Cell> children
    // was not reliably applied by recharts here, leaving every slice one color.)
    const pieData = data.map((row, i) => ({
      ...row,
      fill: typeof row.color === 'string' ? row.color : FALLBACK_COLORS[i % FALLBACK_COLORS.length],
    }));
    return (
      <PieChart>
        <Pie data={pieData} dataKey={first.key} nameKey={xKey} label isAnimationActive={false} />
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

  // Annotation labels: alternate position so two labels close to each other
  // on the x-axis don't render their centered text bands on top of each other.
  // Even index → "top" (above chart, centered on ref line); odd index →
  // "insideTopRight" (just below top axis, anchored to the right of the line).
  // Color comes from the Tailwind selector on the ChartContainer className
  // below, NOT an inline `fill` here, because inline fill bypasses the
  // theme-aware shadcn chart styles.
  const annotationLines = annotations.map((ann, i) => (
    <ReferenceLine
      key={`ann-${ann.x}-${ann.label}`}
      x={ann.x}
      // --border is an oklch() value in globals.css; wrapping it in hsl()
      // produces an invalid color and the line silently doesn't paint.
      stroke="var(--border)"
      strokeDasharray="3 3"
      label={{
        value: ann.label,
        position: i % 2 === 0 ? 'top' : 'insideTopRight',
        fontSize: 11,
      }}
    />
  ));

  if (kind === 'line') {
    return (
      <LineChart data={data} margin={{ top: 20, right: 24, left: 0, bottom: 0 }}>
        {sharedAxes}
        {annotationLines}
        {series.map((s, i) => (
          <Line
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            stroke={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
            dot={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    );
  }

  if (kind === 'bar') {
    return (
      <BarChart data={data} margin={{ top: 20, right: 24, left: 0, bottom: 0 }}>
        {sharedAxes}
        {annotationLines}
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label ?? s.key}
            fill={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    );
  }

  return (
    <AreaChart data={data} margin={{ top: 20, right: 24, left: 0, bottom: 0 }}>
      {sharedAxes}
      {annotationLines}
      {series.map((s, i) => (
        <Area
          key={s.key}
          dataKey={s.key}
          name={s.label ?? s.key}
          fill={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
          stroke={s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
          isAnimationActive={false}
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

  // Fixed-height chart slot. We tried a flex-1 + h-full chain so the chart
  // could grow inside a bento hero cell, but it collapses inside a standalone
  // Card where no parent provides a computed height for h-full to resolve
  // against. A fixed 320px is a clear, predictable rendering target that
  // works in any context. Bento heroes lose a bit of fill but stay legible.
  return (
    <div className="w-full space-y-3">
      {title && <h3 className="font-medium text-sm">{title}</h3>}
      <div className="h-[320px] w-full">
        {/*
          [&_.recharts-reference-line_text]:fill-muted-foreground pulls the
          annotation label fill into the shadcn theme. Without it the text
          renders at the SVG default (black), which is invisible on the dark
          chart background.
        */}
        <ChartContainer
          config={config}
          className="aspect-auto h-full w-full [&_.recharts-reference-line_text]:fill-muted-foreground"
        >
          <ChartBody {...props} />
        </ChartContainer>
      </div>
      <EndpointCaptions series={series} config={config} />
    </div>
  );
}
