// App-wide theme with a manual toggle; defaults to dark to match the design.
// ponytail: module-level store + useSyncExternalStore so every existing
// useColorScheme() call site switches without threading a provider through the tree.
import { useSyncExternalStore } from 'react';

type Scheme = 'light' | 'dark';

let scheme: Scheme = 'dark';
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useColorScheme(): Scheme {
  return useSyncExternalStore(subscribe, () => scheme, () => scheme);
}

export function toggleColorScheme() {
  scheme = scheme === 'dark' ? 'light' : 'dark';
  listeners.forEach((l) => l());
}
