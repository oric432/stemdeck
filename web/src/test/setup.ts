import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom has no ResizeObserver — Radix's Slider (and other size-aware
// primitives) need it just to mount, even in tests that never resize anything.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom has no IntersectionObserver either — SongList's infinite-scroll
// sentinel needs it just to mount, even in tests with too few songs to
// ever trigger loadMore.
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver ??= IntersectionObserverStub as unknown as typeof IntersectionObserver;

// jsdom doesn't implement scrollIntoView either — ChordTimeline uses it to
// keep the active chord in view as playback advances.
Element.prototype.scrollIntoView ??= () => {};

// jsdom has no Web Audio API at all — @soundtouchjs/audio-worklet's
// SoundTouchNode class declaration is `extends AudioWorkletNode`, so just
// *importing* audioEngine.ts (transitively, via playerStore) throws at
// module-load time in every test, even ones that never touch real audio.
// The engine itself is only ever instantiated in tests that mock this
// module outright, so a plain extendable stub is enough.
globalThis.AudioWorkletNode ??= class AudioWorkletNode {} as unknown as typeof AudioWorkletNode;

afterEach(() => {
  cleanup();
});
