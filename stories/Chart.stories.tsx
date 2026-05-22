import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Chart', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const sample = [
  { month: 'Jan', revenue: 120, costs: 80 },
  { month: 'Feb', revenue: 145, costs: 95 },
  { month: 'Mar', revenue: 175, costs: 100 },
  { month: 'Apr', revenue: 210, costs: 110 },
];

const lineSingleSeriesSpec: Spec = {
  root: 'chart',
  elements: {
    chart: {
      type: 'Chart',
      props: {
        kind: 'line',
        data: sample,
        series: [{ key: 'revenue', label: 'Revenue' }],
        xKey: 'month',
        title: 'Monthly Revenue',
      },
      children: [],
    },
  },
};

const barTwoSeriesSpec: Spec = {
  root: 'chart',
  elements: {
    chart: {
      type: 'Chart',
      props: {
        kind: 'bar',
        data: sample,
        series: [
          { key: 'revenue', label: 'Revenue' },
          { key: 'costs', label: 'Costs' },
        ],
        xKey: 'month',
      },
      children: [],
    },
  },
};

const areaStackedSpec: Spec = {
  root: 'chart',
  elements: {
    chart: {
      type: 'Chart',
      props: {
        kind: 'area',
        data: sample,
        series: [
          { key: 'revenue', label: 'Revenue' },
          { key: 'costs', label: 'Costs' },
        ],
        xKey: 'month',
        title: 'Revenue vs Costs',
      },
      children: [],
    },
  },
};

const pieChartSpec: Spec = {
  root: 'chart',
  elements: {
    chart: {
      type: 'Chart',
      props: {
        kind: 'pie',
        data: [
          { segment: 'Org', value: 45 },
          { segment: 'SMB', value: 30 },
          { segment: 'Ent', value: 25 },
        ],
        series: [{ key: 'value' }],
        xKey: 'segment',
      },
      children: [],
    },
  },
};

export const LineSingleSeries: Story = { args: { spec: lineSingleSeriesSpec } };
export const BarTwoSeries: Story = { args: { spec: barTwoSeriesSpec } };
export const AreaStacked: Story = { args: { spec: areaStackedSpec } };
export const PieChart: Story = { args: { spec: pieChartSpec } };
