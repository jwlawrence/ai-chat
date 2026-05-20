// Global test setup — extend Vitest expect with @testing-library/jest-dom matchers
// when running in jsdom environment (registry.test.tsx).
// In node environment these imports are harmless no-ops because the matchers
// are only registered when the DOM globals are present.

import '@testing-library/jest-dom/vitest';
