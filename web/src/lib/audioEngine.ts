import { SoundTouchNode } from "@soundtouchjs/audio-worklet";
import processorUrl from "@soundtouchjs/audio-worklet/processor?url";
import type { Stem, StemKind } from "@/lib/apiClient";

interface EngineStem {
  kind: StemKind;
  buffer: AudioBuffer;
  gainNode: GainNode;
  soundTouchNode: SoundTouchNode;
  source: AudioBufferSourceNode | null;
  volume: number;
  muted: boolean;
}

// AudioBufferSourceNode has no pause() — it's one-shot. To pause/seek we stop
// the current sources and, on the next play(), create fresh ones started at
// the right offset. `startedAt` + `startOffset` together let currentTime be
// derived without a running timer.
export class AudioEngine {
  private context: AudioContext;
  private stems: EngineStem[] = [];
  private startedAt = 0;
  private startOffset = 0;
  private playing = false;
  private tempo = 1;
  private pitchSemitones = 0;
  private workletReady: Promise<void> | null = null;

  constructor() {
    this.context = new AudioContext();
  }

  private registerWorklet(): Promise<void> {
    this.workletReady ??= SoundTouchNode.register(this.context, processorUrl);
    return this.workletReady;
  }

  async load(stems: Stem[]): Promise<void> {
    this.stop();
    await this.registerWorklet();
    this.stems = await Promise.all(
      stems.map(async ({ kind, url }): Promise<EngineStem> => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch stem "${kind}": ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = await this.context.decodeAudioData(arrayBuffer);
        const gainNode = this.context.createGain();
        gainNode.connect(this.context.destination);
        // SoundTouch sits between the (one-shot) source and the (persistent)
        // gain node, same lifetime as the gain node — only the source itself
        // gets recreated on every play().
        const soundTouchNode = new SoundTouchNode({ context: this.context });
        soundTouchNode.connect(gainNode);
        soundTouchNode.playbackRate.value = this.tempo;
        soundTouchNode.pitchSemitones.value = this.pitchSemitones;
        return { kind, buffer, gainNode, soundTouchNode, source: null, volume: 1, muted: false };
      }),
    );
    this.startOffset = 0;
  }

  get duration(): number {
    return this.stems.reduce((max, stem) => Math.max(max, stem.buffer.duration), 0);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get currentTime(): number {
    if (!this.playing) return this.startOffset;
    // Wall-clock time advances the song position `tempo`x as fast, since
    // that's how much faster the source is being fed through playbackRate.
    return this.startOffset + (this.context.currentTime - this.startedAt) * this.tempo;
  }

  play(): void {
    if (this.playing || this.stems.length === 0) return;
    void this.context.resume();
    for (const stem of this.stems) {
      const source = this.context.createBufferSource();
      source.buffer = stem.buffer;
      source.playbackRate.value = this.tempo;
      source.connect(stem.soundTouchNode);
      source.start(0, this.startOffset);
      stem.source = source;
    }
    this.startedAt = this.context.currentTime;
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    this.startOffset = this.currentTime;
    this.stopSources();
    this.playing = false;
  }

  seek(time: number): void {
    const wasPlaying = this.playing;
    if (wasPlaying) this.stopSources();
    this.startOffset = Math.min(Math.max(time, 0), this.duration);
    this.playing = false;
    if (wasPlaying) this.play();
  }

  // Tempo changes apply live to already-running sources (playbackRate is a
  // real AudioParam) — no need to stop/restart them, just re-anchor the
  // offset/clock bookkeeping so currentTime keeps reporting correctly.
  setTempo(rate: number): void {
    if (this.playing) {
      this.startOffset = this.currentTime;
      this.startedAt = this.context.currentTime;
    }
    this.tempo = rate;
    for (const stem of this.stems) {
      stem.soundTouchNode.playbackRate.value = rate;
      if (stem.source) stem.source.playbackRate.value = rate;
    }
  }

  // Pitch-only change — doesn't affect playback speed, so no timing
  // bookkeeping needed, just push the new value to each stem's processor.
  setPitchSemitones(semitones: number): void {
    this.pitchSemitones = semitones;
    for (const stem of this.stems) {
      stem.soundTouchNode.pitchSemitones.value = semitones;
    }
  }

  setVolume(kind: StemKind, volume: number): void {
    const stem = this.stems.find((s) => s.kind === kind);
    if (!stem) return;
    stem.volume = volume;
    this.applyGain(stem);
  }

  toggleMute(kind: StemKind): void {
    const stem = this.stems.find((s) => s.kind === kind);
    if (!stem) return;
    stem.muted = !stem.muted;
    this.applyGain(stem);
  }

  mixerState(): { kind: StemKind; volume: number; muted: boolean }[] {
    return this.stems.map(({ kind, volume, muted }) => ({ kind, volume, muted }));
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
    this.startOffset = 0;
  }

  dispose(): void {
    this.stop();
    void this.context.close();
  }

  private applyGain(stem: EngineStem): void {
    stem.gainNode.gain.value = stem.muted ? 0 : stem.volume;
  }

  private stopSources(): void {
    for (const stem of this.stems) {
      stem.source?.stop();
      stem.source = null;
    }
  }
}
