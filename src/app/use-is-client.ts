"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// True only after hydration, so browser-only UI (clock, device APIs) doesn't mismatch the server render.
export function useIsClient(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
