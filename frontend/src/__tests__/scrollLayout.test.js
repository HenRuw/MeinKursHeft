import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The mobile/portrait scroll problems came down to the app shell using the
// layout viewport (height:100%), which the browser chrome overlaps, hiding the
// bottom of scroll areas. These guard the CSS fixes from silently regressing.
// vitest runs with the frontend project as cwd.
const css = readFileSync('src/styles/global.css', 'utf8');

describe('global scroll layout', () => {
  it('sizes the app shell to the dynamic viewport height', () => {
    expect(css).toMatch(/#root\s*\{[^}]*height:\s*100dvh/);
    // vh fallback for browsers without dvh support.
    expect(css).toMatch(/#root\s*\{[^}]*height:\s*100vh/);
  });

  it('contains scroll gestures inside scroll panels', () => {
    expect(css).toMatch(/\.scroll-panel\s*\{[^}]*overscroll-behavior:\s*contain/);
  });
});
