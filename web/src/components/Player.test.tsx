import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Player } from "./Player";
import { usePlayerStore } from "@/state/playerStore";

describe("Player", () => {
  const originalSetPitchSemitones = usePlayerStore.getState().setPitchSemitones;

  afterEach(() => {
    usePlayerStore.setState({
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
      setPitchSemitones: originalSetPitchSemitones,
    });
  });

  it("renders nothing when no song is loaded", () => {
    const { container } = render(<Player />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the loading state while stems are fetched", () => {
    usePlayerStore.setState({ songId: "1", songTitle: "song.mp3", isLoading: true });
    render(<Player />);
    expect(screen.getByText(/loading stems/i)).toBeInTheDocument();
  });

  it("renders transport and a mixer row per stem once loaded", () => {
    usePlayerStore.setState({
      songId: "1",
      songTitle: "song.mp3",
      isLoading: false,
      duration: 120,
      stems: [
        { kind: "vocals", volume: 1, muted: false },
        { kind: "drums", volume: 0.5, muted: true },
      ],
    });
    render(<Player />);

    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByText("VOX")).toBeInTheDocument();
    expect(screen.getByText("DRM")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unmute drums/i })).toBeInTheDocument();
  });

  it("shows tempo and key, and steps the key up/down a semitone at a time", () => {
    const setPitchSemitones = vi.fn();
    usePlayerStore.setState({
      songId: "1",
      songTitle: "song.mp3",
      isLoading: false,
      duration: 120,
      stems: [],
      tempo: 1.1,
      pitchSemitones: 2,
      setPitchSemitones,
    });
    render(<Player />);

    expect(screen.getByText("110%")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();

    screen.getByRole("button", { name: /pitch up a semitone/i }).click();
    expect(setPitchSemitones).toHaveBeenCalledWith(3);

    screen.getByRole("button", { name: /pitch down a semitone/i }).click();
    expect(setPitchSemitones).toHaveBeenCalledWith(1);
  });
});
