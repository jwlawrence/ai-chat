import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/nextjs-vite';

const here = dirname(fileURLToPath(import.meta.url));

const config: StorybookConfig = {
  stories: ['../stories/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-docs', '@storybook/addon-themes'],
  framework: {
    name: '@storybook/nextjs-vite',
    options: {},
  },
  // staticDirs intentionally omitted: this repo has no top-level `public/` directory.
  typescript: {
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  // SB 10 with @storybook/nextjs-vite uses Vite. Re-declare the @/ alias because
  // tsconfig paths are not auto-applied to Storybook's bundler.
  viteFinal: async (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      '@': resolve(here, '..'),
    };
    return config;
  },
};

export default config;
