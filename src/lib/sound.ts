import { getSettings, type Volume } from "./settings";

/**
 * The game's few sounds, made with the Web Audio API so there are no audio
 * files to load: a wooden knock when a tile is placed, two rising notes when
 * it becomes your turn, and a short tune when the game ends.
 */
export type Sound = "place" | "turn" | "over";

const PEAK: Record<Volume, number> = { low: 0.08, medium: 0.18, high: 0.35 };

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  const Context =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Context) return null;
  context ??= new Context();
  if (context.state === "suspended") void context.resume().catch(() => {});
  return context;
}

/** Browsers only start audio after a tap or a key press: get it ready on the first one. */
export function unlockAudioOnFirstGesture(): () => void {
  function stop() {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  }
  function unlock() {
    audio();
    stop();
  }
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  return stop;
}

function tone(ctx: AudioContext, start: number, frequency: number, length: number, peak: number, type: OscillatorType, slideTo?: number) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + length + 0.05);
}

/** Plays a sound if sounds are on (`force` plays it anyway, for the settings' test button). */
export function playSound(sound: Sound, { force = false } = {}) {
  const settings = getSettings();
  if (!settings.sound && !force) return;
  const ctx = audio();
  // Before any tap the browser keeps audio suspended; queued sounds would all play at once later.
  if (!ctx || ctx.state !== "running") return;
  const peak = PEAK[settings.volume];
  const now = ctx.currentTime + 0.01;
  if (sound === "place") {
    tone(ctx, now, 240, 0.09, peak, "triangle", 110);
  } else if (sound === "turn") {
    tone(ctx, now, 659.25, 0.4, peak, "sine");
    tone(ctx, now + 0.17, 987.77, 0.55, peak, "sine");
  } else {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, i) => tone(ctx, now + i * 0.12, frequency, 0.5, peak, "sine"));
  }
}
