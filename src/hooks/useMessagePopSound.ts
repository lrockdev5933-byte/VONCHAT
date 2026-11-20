import { useCallback, useEffect, useRef, useState } from 'react';

interface UseMessagePopSoundOptions {
  /** Peak gain (0..1). Kept low by default to match vonChat's calm aesthetic. */
  volume?: number;
  /** localStorage key for persisting mute preference. */
  storageKey?: string;
}

interface UseMessagePopSoundReturn {
  playPop: () => void;
  isMuted: boolean;
  toggleMuted: () => void;
  setMuted: (muted: boolean) => void;
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function readStoredMuted(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === 'true';
  } catch {
    return false;
  }
}

export function useMessagePopSound(
  options: UseMessagePopSoundOptions = {}
): UseMessagePopSoundReturn {
  const volume = Math.min(Math.max(options.volume ?? 0.08, 0.01), 0.25);
  const storageKey = options.storageKey ?? 'vonchat_sound_muted';

  const [isMuted, setIsMutedState] = useState<boolean>(() =>
    readStoredMuted(storageKey)
  );
  const isMutedRef = useRef<boolean>(isMuted);
  const volumeRef = useRef<number>(volume);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastPlayedAtRef = useRef<number>(0);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      return audioCtxRef.current;
    }
    const AudioCtx = getAudioContextConstructor();
    if (!AudioCtx) {
      return null;
    }
    try {
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      return ctx;
    } catch {
      return null;
    }
  }, []);

  // Unlock/resume AudioContext on first user interaction so incoming messages can chime
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      const ctx = audioCtxRef.current;
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
      } else if (!ctx) {
        const created = ensureAudioContext();
        if (created && created.state === 'suspended') {
          void created.resume().catch(() => {});
        }
      }
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ensureAudioContext]);

  // Dispose AudioContext on unmount
  useEffect(() => {
    return () => {
      const ctx = audioCtxRef.current;
      audioCtxRef.current = null;
      if (ctx && ctx.state !== 'closed') {
        void ctx.close().catch(() => {});
      }
    };
  }, []);

  const setMuted = useCallback(
    (muted: boolean) => {
      isMutedRef.current = muted;
      setIsMutedState(muted);
      try {
        window.localStorage.setItem(storageKey, String(muted));
      } catch {
        // Ignore storage failures in restricted frames
      }
    },
    [storageKey]
  );

  const toggleMuted = useCallback(() => {
    setMuted(!isMutedRef.current);
  }, [setMuted]);

  const playPop = useCallback(() => {
    if (isMutedRef.current) return;

    const nowMs = Date.now();
    if (nowMs - lastPlayedAtRef.current < 180) {
      return;
    }
    lastPlayedAtRef.current = nowMs;

    const ctx = ensureAudioContext();
    if (!ctx) return;

    const triggerTone = () => {
      try {
        const start = ctx.currentTime + 0.005;
        const duration = 0.115;

        const oscillator = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gainNode = ctx.createGain();

        // Warm, soft water-drop 'pop' pitch contour
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(420, start);
        oscillator.frequency.exponentialRampToValueAtTime(760, start + 0.048);
        oscillator.frequency.exponentialRampToValueAtTime(580, start + duration);

        // Gentle low-pass filter to keep the pop rounded and calm
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1600, start);
        filter.Q.setValueAtTime(1.2, start);

        // Soft envelope at calm volume
        gainNode.gain.setValueAtTime(0.0001, start);
        gainNode.gain.linearRampToValueAtTime(volumeRef.current, start + 0.009);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, start + duration);

        oscillator.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.onended = () => {
          oscillator.disconnect();
          filter.disconnect();
          gainNode.disconnect();
        };

        oscillator.start(start);
        oscillator.stop(start + duration + 0.01);
      } catch {
        // Ignore audio scheduling errors in restricted environments
      }
    };

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => {
          if (ctx.state === 'running') {
            triggerTone();
          }
        })
        .catch(() => {});
      return;
    }

    if (ctx.state === 'running') {
      triggerTone();
    }
  }, [ensureAudioContext]);

  return {
    playPop,
    isMuted,
    toggleMuted,
    setMuted,
  };
}
