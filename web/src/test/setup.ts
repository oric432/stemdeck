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

// jsdom doesn't implement scrollIntoView either — ChordTimeline uses it to
// keep the active chord in view as playback advances.
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
});
