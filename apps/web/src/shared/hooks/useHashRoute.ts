import { useEffect, useState } from 'react';

const parse = (defaultRoute: string) => {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path = '', query = ''] = raw.split('?');
  return { route: path || defaultRoute, params: new URLSearchParams(query) };
};

/** Minimal hash router: `#/ingestion` -> "ingestion". A query part (`#/products?open=abc`) is ignored here; see useHashParam. */
export function useHashRoute(defaultRoute: string): string {
  const [route, setRoute] = useState(() => parse(defaultRoute).route);
  useEffect(() => {
    const onChange = () => setRoute(parse(defaultRoute).route);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [defaultRoute]);
  return route;
}

/** Reads one query parameter from the hash (e.g. `open` in `#/products?open=abc`), live. */
export function useHashParam(name: string): string | null {
  const [value, setValue] = useState(() => parse('').params.get(name));
  useEffect(() => {
    const onChange = () => setValue(parse('').params.get(name));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, [name]);
  return value;
}

/** Removes the query from the hash without triggering navigation, so the same deep link can be followed again. */
export function clearHashQuery(): void {
  const path = window.location.hash.split('?')[0] ?? '';
  window.history.replaceState(null, '', path || '#/');
  window.dispatchEvent(new Event('hashchange')); // replaceState is silent; let hooks re-read the (now empty) query
}
