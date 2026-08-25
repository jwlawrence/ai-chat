import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Compositions', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

// 1. Card stack — heading + text + badge row + divider + callout
const cardStack: Spec = {
  root: 'card',
  elements: {
    card: {
      type: 'Card',
      props: { title: 'Release 2.4.0' },
      children: ['heading', 'summary', 'badge', 'div', 'callout'],
    },
    heading: { type: 'Heading', props: { level: 3, text: 'Highlights' }, children: [] },
    summary: {
      type: 'Text',
      props: { text: 'Three improvements landed in this release.' },
      children: [],
    },
    badge: { type: 'Badge', props: { label: 'Stable', tone: 'success' }, children: [] },
    div: { type: 'Divider', props: {}, children: [] },
    callout: {
      type: 'Callout',
      props: {
        tone: 'info',
        title: 'Heads up',
        text: 'Run pnpm install to pick up the new lockfile.',
      },
      children: [],
    },
  },
};

// 2. Full contact form — matches catalog prompt example
const fullForm: Spec = {
  root: 'contact-card',
  state: { contact: { email: '', topic: 'general', subscribe: false } },
  elements: {
    'contact-card': { type: 'Card', props: { title: 'Contact us' }, children: ['contact-form'] },
    'contact-form': {
      type: 'Form',
      props: { name: 'contact' },
      children: ['email-input', 'topic-select', 'subscribe-check', 'submit-btn'],
    },
    'email-input': {
      type: 'Input',
      props: { name: 'email', label: 'Email', kind: 'email', placeholder: 'you@example.com' },
      children: [],
    },
    'topic-select': {
      type: 'Select',
      props: {
        name: 'topic',
        label: 'Topic',
        options: [
          { value: 'general', label: 'General' },
          { value: 'support', label: 'Support' },
          { value: 'billing', label: 'Billing' },
        ],
      },
      children: [],
    },
    'subscribe-check': {
      type: 'Checkbox',
      props: { name: 'subscribe', label: 'Subscribe to updates' },
      children: [],
    },
    'submit-btn': {
      type: 'Button',
      props: { label: 'Send', variant: 'primary' },
      on: {
        press: {
          action: 'submitForm',
          params: { formName: 'contact', label: 'Submitted contact form' },
        },
      },
      children: [],
    },
  },
};

// 3. Annotated list — flat Text + Badge rows (matches catalog prompt pattern)
const annotatedList: Spec = {
  root: 'status-card',
  elements: {
    'status-card': {
      type: 'Card',
      props: { title: 'Task status' },
      children: ['row-1', 'badge-1', 'row-2', 'badge-2', 'row-3', 'badge-3'],
    },
    'row-1': { type: 'Text', props: { text: 'Deploy pipeline' }, children: [] },
    'badge-1': { type: 'Badge', props: { label: 'Done', tone: 'success' }, children: [] },
    'row-2': { type: 'Text', props: { text: 'Integration tests' }, children: [] },
    'badge-2': { type: 'Badge', props: { label: 'Running', tone: 'warning' }, children: [] },
    'row-3': { type: 'Text', props: { text: 'Staging deploy' }, children: [] },
    'badge-3': { type: 'Badge', props: { label: 'Pending', tone: 'default' }, children: [] },
  },
};

// 4. Approval card — Approve / Reject model-mode pair
const approvalCard: Spec = {
  root: 'review-card',
  elements: {
    'review-card': {
      type: 'Card',
      props: { title: 'Review required' },
      children: ['summary-text', 'approve-btn', 'reject-btn'],
    },
    'summary-text': {
      type: 'Text',
      props: { text: 'The user submitted a change request awaiting approval.' },
      children: [],
    },
    'approve-btn': {
      type: 'Button',
      props: { label: 'Approve', variant: 'primary' },
      on: {
        press: {
          action: 'sendToModel',
          params: { label: 'Approve', message: 'User approved the request.' },
        },
      },
      children: [],
    },
    'reject-btn': {
      type: 'Button',
      props: { label: 'Reject', variant: 'destructive' },
      on: {
        press: {
          action: 'sendToModel',
          params: { label: 'Reject', message: 'User rejected the request.' },
        },
      },
      children: [],
    },
  },
};

// 5. Dashboard — Card + heading + Row of KPIs + Chart
const dashboard: Spec = {
  root: 'dashboard-card',
  elements: {
    'dashboard-card': {
      type: 'Card',
      props: {},
      children: ['dashboard-heading', 'kpi-row', 'revenue-chart'],
    },
    'dashboard-heading': {
      type: 'Heading',
      props: { level: 2, text: 'Business dashboard' },
      children: [],
    },
    'kpi-row': {
      type: 'Row',
      props: { gap: 'normal', align: 'stretch', fill: true },
      children: ['mrr-kpi', 'users-kpi', 'uptime-kpi'],
    },
    'mrr-kpi': {
      type: 'KPI',
      props: {
        label: 'MRR',
        value: '$124K',
        delta: { value: '+12%', trend: 'up' },
      },
      children: [],
    },
    'users-kpi': {
      type: 'KPI',
      props: {
        label: 'Users',
        value: '8,432',
        delta: { value: '-3%', trend: 'down' },
      },
      children: [],
    },
    'uptime-kpi': {
      type: 'KPI',
      props: {
        label: 'Uptime',
        value: '99.9%',
        delta: { value: '0', trend: 'flat' },
      },
      children: [],
    },
    'revenue-chart': {
      type: 'Chart',
      props: {
        kind: 'line',
        title: 'Monthly revenue',
        xKey: 'month',
        series: [{ key: 'revenue', label: 'Revenue' }],
        data: [
          { month: 'Jan', revenue: 98 },
          { month: 'Feb', revenue: 105 },
          { month: 'Mar', revenue: 112 },
          { month: 'Apr', revenue: 118 },
          { month: 'May', revenue: 121 },
          { month: 'Jun', revenue: 124 },
        ],
      },
      children: [],
    },
  },
};

export const CardStack: Story = { args: { spec: cardStack } };
export const FullContactForm: Story = { args: { spec: fullForm } };
export const AnnotatedList: Story = { args: { spec: annotatedList } };
export const ApprovalCard: Story = { args: { spec: approvalCard } };
export const Dashboard: Story = { args: { spec: dashboard } };
