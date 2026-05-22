import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'StateBinding', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

// Tabs.valueStatePath drives a sibling Text — clicking a tab updates the text
const tabsDriveText: Spec = {
  root: 'card',
  state: { mode: 'daily' },
  elements: {
    card: {
      type: 'Card',
      props: { title: 'Tabs control sibling text' },
      children: ['tabs', 'echo'],
    },
    tabs: {
      type: 'Tabs',
      props: {
        valueStatePath: '/mode',
        tabs: [
          { id: 'daily', label: 'Today', children: [] },
          { id: 'weekly', label: '7-Day', children: [] },
        ],
      },
      children: [],
    },
    echo: { type: 'Text', props: { text: { $state: '/mode' } }, children: [] },
  },
};

// setState toggle — single button flips /open via $cond
const setStateToggle: Spec = {
  root: 'card',
  state: { open: false },
  elements: {
    card: {
      type: 'Card',
      props: { title: 'setState toggle' },
      children: ['toggle-btn', 'detail-text'],
    },
    'toggle-btn': {
      type: 'Button',
      props: { label: 'Toggle details' },
      on: {
        press: {
          action: 'setState',
          params: {
            statePath: '/open',
            value: { $cond: { $state: '/open' }, $then: false, $else: true },
          },
        },
      },
      children: [],
    },
    'detail-text': {
      type: 'Text',
      props: { text: 'Here are the details, revealed by the toggle.' },
      visible: { $state: '/open' },
      children: [],
    },
  },
};

// Locked card — submit button + form, rendered with applyLockToSpec
const lockedFormSpec: Spec = {
  root: 'card',
  state: { signup: { email: 'jane@example.com' } },
  elements: {
    card: {
      type: 'Card',
      props: { title: 'Locked state — post-submit' },
      children: ['form'],
    },
    form: { type: 'Form', props: { name: 'signup' }, children: ['email-input', 'submit-btn'] },
    'email-input': {
      type: 'Input',
      props: { name: 'email', label: 'Email', kind: 'email' },
      children: [],
    },
    'submit-btn': {
      type: 'Button',
      props: { label: 'Submit', variant: 'primary' },
      on: { press: { action: 'submitForm', params: { formName: 'signup' } } },
      children: [],
    },
  },
};

// Weather card — endpoint-mode fetchWeather + tabs + reactive text
// Default fetchWeather handler returns canned summary so the visual flow works.
const weatherCard: Spec = {
  root: 'weather-card',
  state: { mode: 'daily', loading: false, weather: { summary: 'Press refresh to load.' } },
  elements: {
    'weather-card': {
      type: 'Card',
      props: { title: 'Weather' },
      children: ['mode-tabs', 'refresh-btn', 'loading-text', 'weather-text'],
    },
    'mode-tabs': {
      type: 'Tabs',
      props: {
        valueStatePath: '/mode',
        tabs: [
          { id: 'daily', label: 'Today', children: [] },
          { id: 'weekly', label: '7-Day', children: [] },
        ],
      },
      children: [],
    },
    'refresh-btn': {
      type: 'Button',
      props: { label: 'Refresh', variant: 'secondary' },
      on: {
        press: {
          action: 'fetchWeather',
          params: {
            mode: { $state: '/mode' },
            _writeResponseTo: '/weather',
            _setPendingAt: '/loading',
          },
        },
      },
      children: [],
    },
    'loading-text': {
      type: 'Text',
      props: { text: 'Loading…', muted: true },
      visible: { $state: '/loading' },
      children: [],
    },
    'weather-text': {
      type: 'Text',
      props: { text: { $state: '/weather/summary' } },
      children: [],
    },
  },
};

export const TabsDriveText: Story = { args: { spec: tabsDriveText } };
export const SetStateToggle: Story = { args: { spec: setStateToggle } };
export const LockedForm: Story = { args: { spec: lockedFormSpec, locked: true } };
export const UnlockedForSidebySide: Story = { args: { spec: lockedFormSpec, locked: false } };
export const WeatherEndpoint: Story = { args: { spec: weatherCard } };
