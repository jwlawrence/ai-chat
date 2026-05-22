import type { Spec } from '@json-render/core';
import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { SpecStory } from './_render-spec-story';

const meta: Meta<typeof SpecStory> = { title: 'Primitives/Table', component: SpecStory };
export default meta;
type Story = StoryObj<typeof SpecStory>;

const basicSpec: Spec = {
  root: 'table',
  elements: {
    table: {
      type: 'Table',
      props: {
        caption: 'Top contributors',
        columns: [
          { key: 'name', label: 'Name' },
          { key: 'commits', label: 'Commits', align: 'right' },
          { key: 'role', label: 'Role' },
        ],
        rows: [
          { name: 'Ada', commits: 142, role: 'Maintainer' },
          { name: 'Grace', commits: 98, role: 'Maintainer' },
          { name: 'Linus', commits: 67, role: 'Reviewer' },
        ],
      },
      children: [],
    },
  },
};

const emptySpec: Spec = {
  root: 'table',
  elements: {
    table: {
      type: 'Table',
      props: { columns: [{ key: 'x', label: 'X' }], rows: [] },
      children: [],
    },
  },
};

export const Basic: Story = { args: { spec: basicSpec } };
export const Empty: Story = { args: { spec: emptySpec } };
