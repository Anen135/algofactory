/** Optional feedback hook. Created only after an explicit user gesture. */
export class SoundFeedback {
  enabled = false;
  private context?: AudioContext;
  play(success: boolean): void {
    if (!this.enabled) return;
    try { this.context ??= new AudioContext(); void this.context.resume(); const oscillator = this.context.createOscillator(), gain = this.context.createGain(); oscillator.connect(gain); gain.connect(this.context.destination); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(success ? 660 : 220, this.context.currentTime); gain.gain.setValueAtTime(.035, this.context.currentTime); gain.gain.exponentialRampToValueAtTime(.001, this.context.currentTime + .15); oscillator.start(); oscillator.stop(this.context.currentTime + .16); } catch { /* Sound must never block gameplay. */ }
  }
}
