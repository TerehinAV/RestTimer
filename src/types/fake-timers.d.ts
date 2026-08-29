declare module '@sinonjs/fake-timers' {
  export interface InstalledClock {
    now(): number;
    tick(ms: number): number;
    uninstall(): void;
  }
  export function install(opts?: { now?: number }): InstalledClock;
  const FakeTimers: { install(opts?: { now?: number }): InstalledClock };
  export default FakeTimers;
}
