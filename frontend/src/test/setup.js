import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Vitest doesn't expose Jest-style globals by default, so
// @testing-library/react's automatic afterEach(cleanup) never registers.
// Without this, DOM from one test's render() (including portal content
// appended straight to document.body) leaks into the next test.
afterEach(() => {
  cleanup();
});
