import { create } from "zustand";
import { AudioEngine } from "@/lib/audioEngine";
import { fetchStems, type StemKind } from "@/lib/apiClient";

interface StemMix {
  kind: StemKind;
  volume: number;
  muted: boolean;
}

interface PlayerState {
  songId: string | null;
  songTitle: string | null;
  isLoading: boolean;
  error: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  stems: StemMix[];
  tempo: number;
  pitchSemitones: number;
  loadSong: (songId: string, title: string) => Promise<void>;
  togglePlay: () => void;
  seek: (time: number) => void;
  setVolume: (kind: StemKind, volume: number) => void;
  toggleMute: (kind: StemKind) => void;
  setTempo: (tempo: number) => void;
  setPitchSemitones: (semitones: number) => void;
  close: () => void;
}

let engine: AudioEngine | null = null;
let rafId: number | null = null;

function stopTicking(): void {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

export const usePlayerStore = create<PlayerState>((set, get) => {
  function tick(): void {
    if (!engine) return;
    const duration = engine.duration;
    if (engine.currentTime >= duration && duration > 0) {
      engine.pause();
      set({ isPlaying: false, currentTime: duration });
      stopTicking();
      return;
    }
    set({ currentTime: engine.currentTime });
    rafId = requestAnimationFrame(tick);
  }

  return {
    songId: null,
    songTitle: null,
    isLoading: false,
    error: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    stems: [],
    tempo: 1,
    pitchSemitones: 0,

    loadSong: async (songId, title) => {
      stopTicking();
      engine?.dispose();
      engine = new AudioEngine();
      set({
        songId,
        songTitle: title,
        isLoading: true,
        error: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        stems: [],
        tempo: 1,
        pitchSemitones: 0,
      });
      try {
        const stems = await fetchStems(songId);
        await engine.load(stems);
        set({ isLoading: false, duration: engine.duration, stems: engine.mixerState() });
      } catch {
        set({ isLoading: false, error: "Couldn't load stems for this song." });
      }
    },

    togglePlay: () => {
      if (!engine) return;
      if (get().isPlaying) {
        engine.pause();
        set({ isPlaying: false });
        stopTicking();
      } else {
        engine.play();
        set({ isPlaying: true });
        rafId = requestAnimationFrame(tick);
      }
    },

    seek: (time) => {
      if (!engine) return;
      engine.seek(time);
      set({ currentTime: engine.currentTime });
    },

    setVolume: (kind, volume) => {
      if (!engine) return;
      engine.setVolume(kind, volume);
      set({ stems: engine.mixerState() });
    },

    toggleMute: (kind) => {
      if (!engine) return;
      engine.toggleMute(kind);
      set({ stems: engine.mixerState() });
    },

    setTempo: (tempo) => {
      if (!engine) return;
      engine.setTempo(tempo);
      set({ tempo, currentTime: engine.currentTime });
    },

    setPitchSemitones: (semitones) => {
      if (!engine) return;
      engine.setPitchSemitones(semitones);
      set({ pitchSemitones: semitones });
    },

    close: () => {
      stopTicking();
      engine?.dispose();
      engine = null;
      set({
        songId: null,
        songTitle: null,
        isLoading: false,
        error: null,
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        stems: [],
        tempo: 1,
        pitchSemitones: 0,
      });
    },
  };
});
