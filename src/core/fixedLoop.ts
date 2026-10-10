// Fixed-timestep driver: the simulation always advances in exact STEP slices,
// rendering interpolates between the last two states with `alpha`.

export const SIM_HZ = 60;
export const STEP = 1 / SIM_HZ;

export interface FixedLoopHooks {
  step(dt: number): void;
  render(alpha: number, frameDt: number): void;
}

export class FixedLoop {
  private acc = 0;
  private last = -1;
  /** Upper bound on catch-up steps per frame, so a hitch never spirals. */
  maxStepsPerFrame = 5;
  /** Multiplier applied to real time (hitstop and slow-mo are handled inside the sim). */
  timeScale = 1;

  constructor(private readonly hooks: FixedLoopHooks) {}

  /** Advance by a real-time timestamp in ms (e.g. from requestAnimationFrame). */
  frame(nowMs: number): void {
    if (this.last < 0) this.last = nowMs;
    let frameDt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    if (frameDt > 0.25) frameDt = 0.25;
    if (frameDt < 0) frameDt = 0;
    this.acc += frameDt * this.timeScale;
    let steps = 0;
    while (this.acc >= STEP && steps < this.maxStepsPerFrame) {
      this.hooks.step(STEP);
      this.acc -= STEP;
      steps++;
    }
    if (steps === this.maxStepsPerFrame && this.acc > STEP) this.acc = STEP * 0.5;
    this.hooks.render(this.acc / STEP, frameDt);
  }

  reset(): void {
    this.acc = 0;
    this.last = -1;
  }
}
