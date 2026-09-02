import { vi } from "vitest";

// Core modules use Node timers (also in headless tests). Route through globals
// so Vitest's clock controls the same timers, without waiting for real minutes.
vi.mock("node:timers", () => ({
  setTimeout: (...args: Parameters<typeof setTimeout>) =>
    globalThis.setTimeout(...args),
  clearTimeout: (...args: Parameters<typeof clearTimeout>) =>
    globalThis.clearTimeout(...args),
}));
