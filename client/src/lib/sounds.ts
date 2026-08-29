export type UiSound =
  | "click"
  | "success"
  | "notification"
  | "message"
  | "toggle";

type Tone = {
  frequency: number;
  duration: number;
  delay?: number;
  type?: OscillatorType;
  volume?: number;
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;

  if (!audioContext) {
    const AudioContextConstructor =
      window.AudioContext ??
      (
        window as Window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!AudioContextConstructor) return null;

    audioContext = new AudioContextConstructor();
  }

  return audioContext;
}

/**
 * Resume AudioContext after a real user interaction.
 *
 * Chrome/Safari may block Web Audio until the user interacts
 * with the page. This function is intentionally safe and never
 * throws an error into the application.
 */
export async function unlockAudio(): Promise<boolean> {
  const context = getAudioContext();

  if (!context) return false;

  try {
    if (context.state === "suspended") {
      await context.resume();
    }

    return context.state === "running";
  } catch {
    return false;
  }
}

function playTone(context: AudioContext, tone: Tone) {
  if (context.state !== "running") return;

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  const startAt = context.currentTime + (tone.delay ?? 0);
  const endAt = startAt + tone.duration;

  const peak = tone.volume ?? 0.035;

  oscillator.type = tone.type ?? "sine";

  oscillator.frequency.setValueAtTime(
    tone.frequency,
    startAt,
  );

  gain.gain.setValueAtTime(
    0.0001,
    startAt,
  );

  gain.gain.exponentialRampToValueAtTime(
    peak,
    startAt + 0.012,
  );

  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    endAt,
  );

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(startAt);
  oscillator.stop(endAt + 0.02);
}

const SOUND_PATTERNS: Record<UiSound, Tone[]> = {
  click: [
    {
      frequency: 420,
      duration: 0.055,
      type: "sine",
      volume: 0.025,
    },
  ],

  toggle: [
    {
      frequency: 350,
      duration: 0.06,
      type: "sine",
      volume: 0.025,
    },
    {
      frequency: 520,
      duration: 0.08,
      delay: 0.045,
      type: "sine",
      volume: 0.022,
    },
  ],

  success: [
    {
      frequency: 520,
      duration: 0.08,
      type: "sine",
      volume: 0.028,
    },
    {
      frequency: 660,
      duration: 0.11,
      delay: 0.065,
      type: "sine",
      volume: 0.03,
    },
    {
      frequency: 820,
      duration: 0.14,
      delay: 0.13,
      type: "sine",
      volume: 0.026,
    },
  ],

  notification: [
    {
      frequency: 640,
      duration: 0.1,
      type: "triangle",
      volume: 0.026,
    },
    {
      frequency: 760,
      duration: 0.13,
      delay: 0.085,
      type: "triangle",
      volume: 0.024,
    },
  ],

  message: [
    {
      frequency: 480,
      duration: 0.075,
      type: "sine",
      volume: 0.024,
    },
    {
      frequency: 610,
      duration: 0.1,
      delay: 0.07,
      type: "sine",
      volume: 0.024,
    },
  ],
};

/**
 * Play a UI sound.
 *
 * This function never creates a browser-breaking exception.
 * If the browser has not unlocked audio yet, the sound is simply
 * skipped until the user interacts with the page.
 */
export function playUiSound(sound: UiSound = "click") {
  const context = getAudioContext();

  if (!context) return;

  try {
    // Never attempt to schedule sounds while Chrome has
    // suspended the AudioContext.
    if (context.state !== "running") {
      return;
    }

    const pattern = SOUND_PATTERNS[sound];

    if (!pattern) return;

    for (const tone of pattern) {
      playTone(context, tone);
    }
  } catch {
    // Audio is optional and must never break the application.
  }
}
