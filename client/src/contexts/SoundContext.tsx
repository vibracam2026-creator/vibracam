import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { playUiSound, type UiSound } from "@/lib/sounds";

const STORAGE_KEY = "vibracam-sound-enabled";

type SoundContextValue = {
  enabled: boolean;
  toggleSound: () => void;
  setSoundEnabled: (enabled: boolean | ((previous: boolean) => boolean)) => void;
  play: (sound?: UiSound) => void;
};

const SoundContext = createContext<SoundContextValue | undefined>(undefined);

function readStoredValue() {
  if (typeof window === "undefined") return true;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored !== "false";
  } catch {
    return true;
  }
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [enabled, setEnabled] = useState(readStoredValue);
  const syncedFromServer = useRef(false);
  const preferences = trpc.accountCenter.preferences.get.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const updatePreferences = trpc.accountCenter.preferences.update.useMutation();

  useEffect(() => {
    if (!preferences.data || syncedFromServer.current) return;
    syncedFromServer.current = true;
    setEnabled(preferences.data.soundEnabled ?? true);
  }, [preferences.data]);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // localStorage is optional and must never block the application.
    }
  }, [enabled]);

  const setSoundEnabled = useCallback((next: boolean | ((previous: boolean) => boolean)) => {
    setEnabled(previous => {
      const resolved = typeof next === "function" ? next(previous) : next;
      if (isAuthenticated) updatePreferences.mutate({ soundEnabled: resolved });
      return resolved;
    });
  }, [isAuthenticated, updatePreferences]);

  const toggleSound = useCallback(() => {
    setSoundEnabled(value => !value);
  }, [setSoundEnabled]);

  const play = useCallback((sound: UiSound = "click") => {
    if (enabled) playUiSound(sound);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const interactive = target.closest<HTMLElement>("button, a, [role='button']");
      if (!interactive || interactive.dataset.sound === "none" || interactive.getAttribute("aria-disabled") === "true" || interactive.hasAttribute("disabled")) return;
      const sound = interactive.dataset.sound as UiSound | undefined;
      play(sound ?? "click");
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [enabled, play]);

  const value = useMemo(() => ({ enabled, toggleSound, setSoundEnabled, play }), [enabled, toggleSound, setSoundEnabled, play]);
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSound() {
  const context = useContext(SoundContext);
  if (!context) throw new Error("useSound must be used within SoundProvider");
  return context;
}
