import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/KPI', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const withUpDeltaSpec: Spec = {
  root: 'kpi',
  elements: {
    kpi: {
      type: 'KPI',
      props: {
        label: 'Monthly Active Users',
        value: '24,318',
        delta: { value: '+12%', trend: 'up' },
        caption: 'vs prior 30 days',
      },
      children: [],
    },
  },
};

const withDownDeltaSpec: Spec = {
  root: 'kpi',
  elements: {
    kpi: {
      type: 'KPI',
      props: {
        label: 'Churn',
        value: '3.2%',
        delta: { value: '-0.4pt', trend: 'down' },
      },
      children: [],
    },
  },
};

const flatDeltaSpec: Spec = {
  root: 'kpi',
  elements: {
    kpi: {
      type: 'KPI',
      props: {
        label: 'NPS',
        value: '42',
        delta: { value: '0', trend: 'flat' },
        caption: 'No change vs last week',
      },
      children: [],
    },
  },
};

const noDeltaSpec: Spec = {
  root: 'kpi',
  elements: {
    kpi: {
      type: 'KPI',
      props: { label: 'Total Revenue', value: '$12.4M' },
      children: [],
    },
  },
};

export const WithUpDelta: Story = { args: { spec: withUpDeltaSpec } };
export const WithDownDelta: Story = { args: { spec: withDownDeltaSpec } };
export const FlatDelta: Story = { args: { spec: flatDeltaSpec } };
export const NoDelta: Story = { args: { spec: noDeltaSpec } };
