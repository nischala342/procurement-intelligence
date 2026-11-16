import { useEffect, useState } from 'react';

/** Minimal hash router: `#/ingestion` -> "ingestion". */
export function useHashRoute(defaultRoute: string): string {
  const read = () => window.location.hash.replace(/^#\/?/, '') || defaultRoute;
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  });
  return route;
}
