import { withThemeByClassName } from '@storybook/addon-themes';
import type { Preview } from '@storybook/nextjs-vite';
import '../app/globals.css';

const preview: Preview = {
  parameters: {
    // `padded` (not `centered`) so the wrapper decorator's `w-full max-w-2xl`
    // has room to span. Centered layout flex-shrinks to content width, which
    // collapses w-full and hides full-width children like Divider.
    layout: 'padded',
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: 'var(--background, #ffffff)' },
        { name: 'white', value: '#ffffff' },
        { name: 'black', value: '#000000' },
      ],
    },
    controls: {
      matchers: { color: /(background|color)$/i, date: /Date$/i },
    },
  },
  decorators: [
    withThemeByClassName({
      themes: { light: '', dark: 'dark' },
      defaultTheme: 'light',
    }),
    (Story) => (
      <div className="font-sans mx-auto w-full max-w-2xl p-6">
        <Story />
      </div>
    ),
  ],
};

export default preview;
