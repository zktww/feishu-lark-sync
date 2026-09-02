import * as timers from "node:timers";
export function nextDelay(minutes: number, failures: number): number {
  return Math.min(
    minutes * 60_000 * 2 ** Math.min(failures, 6),
    6 * 60 * 60_000,
  );
}
/** One-shot scheduling: next run is armed only after the previous task settles. */
export class SyncScheduler {
  private timer?: ReturnType<typeof timers.setTimeout>;
  nextRunAt?: number;
  constructor(
    private readonly run: () => Promise<void>,
    private readonly changed: () => void,
  ) {}
  stop(): void {
    if (this.timer) timers.clearTimeout(this.timer);
    this.timer = undefined;
    this.nextRunAt = undefined;
    this.changed();
  }
  arm(minutes: number, failures: number): void {
    this.stop();
    if (minutes <= 0) return;
    const delay = nextDelay(minutes, failures);
    this.nextRunAt = Date.now() + delay;
    this.timer = timers.setTimeout(() => {
      this.timer = undefined;
      this.nextRunAt = undefined;
      this.changed();
      void this.run();
    }, delay);
    this.changed();
  }
}
