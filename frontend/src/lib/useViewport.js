import { useEffect, useState } from 'react';

// Breakpoints match the common mobile/tablet/desktop split used throughout
// the app's responsive layout: below 768 is a phone, 768–1023 a tablet
// (portrait especially), 1024+ a laptop/desktop. Everything here is driven
// from window.innerWidth (rather than CSS media queries) because the app's
// styling convention is inline style objects, not stylesheets.
const MOBILE_MAX = 767;
const TABLET_MAX = 1023;

function classify(width) {
  return {
    width,
    isMobile: width <= MOBILE_MAX,
    isTablet: width > MOBILE_MAX && width <= TABLET_MAX,
    isDesktop: width > TABLET_MAX,
  };
}

export function useViewport() {
  const [state, setState] = useState(() => classify(typeof window !== 'undefined' ? window.innerWidth : 1280));

  useEffect(() => {
    const onResize = () => setState(classify(window.innerWidth));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return state;
}
