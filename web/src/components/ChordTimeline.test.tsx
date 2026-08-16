import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChordTimeline } from "./ChordTimeline";
import { usePlayerStore } from "@/state/playerStore";
import type { ChordEvent } from "@/lib/apiClient";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const CHORDS: ChordEvent[] = [
  { start_time: 0, end_time: 4, chord_label: "N", confidence: 1 },
  { start_time: 4, end_time: 12, chord_label: "C:maj", confidence: 1 },
  { start_time: 12, end_time: 16, chord_label: "A:min", confidence: 1 },
];

describe("ChordTimeline", () => {
  const originalSeek = usePlayerStore.getState().seek;

  afterEach(() => {
    vi.restoreAllMocks();
    usePlayerStore.setState({ currentTime: 0, pitchSemitones: 0, seek: originalSeek });
  });

  it("renders nothing while there are no chords", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));
    const { container } = render(<ChordTimeline songId="1" />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("shows formatted chord labels and highlights the one at the current time", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(CHORDS));
    // C:maj runs 4-12s, split into 1s grid cells — 4.5s falls in its first
    // cell ([4, 5)), the one carrying the visible "C" label.
    usePlayerStore.setState({ currentTime: 4.5 });

    render(<ChordTimeline songId="1" />);

    await waitFor(() => expect(screen.getByText("C")).toBeInTheDocument());
    expect(screen.getByText("Am")).toBeInTheDocument();
    expect(screen.getByText("C").closest("button")).toHaveClass("bg-primary");
    expect(screen.getByText("Am").closest("button")).not.toHaveClass("bg-primary");
  });

  it("seeks to a chord's start time when clicked", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(CHORDS));
    const seek = vi.fn();
    usePlayerStore.setState({ seek });

    render(<ChordTimeline songId="1" />);

    await waitFor(() => expect(screen.getByText("Am")).toBeInTheDocument());
    screen.getByText("Am").click();

    expect(seek).toHaveBeenCalledWith(12);
  });

  it("transposes chord roots to match the key shift", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(CHORDS));
    usePlayerStore.setState({ currentTime: 4.5, pitchSemitones: 2 });

    render(<ChordTimeline songId="1" />);

    // C:maj up 2 semitones -> D, A:min up 2 semitones -> Bm.
    await waitFor(() => expect(screen.getByText("D")).toBeInTheDocument());
    expect(screen.getByText("Bm")).toBeInTheDocument();
  });

  it("only mounts cells near the playhead, not the whole song", async () => {
    // 30 ten-second chords — 300 grid cells' worth for a long song, to
    // confirm only a window around currentTime=0 actually mounts buttons.
    const longSong: ChordEvent[] = Array.from({ length: 30 }, (_, i) => ({
      start_time: i * 10,
      end_time: (i + 1) * 10,
      chord_label: "C:maj",
      confidence: 1,
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(longSong));

    render(<ChordTimeline songId="1" />);

    await waitFor(() => expect(screen.getAllByText("C").length).toBeGreaterThan(0));
    // The ~48s window (16 before + 32 after) at 1s/cell is well under 60
    // buttons — nowhere near the 300 cells the full song would produce.
    expect(screen.getAllByRole("button").length).toBeLessThan(60);
  });
});
