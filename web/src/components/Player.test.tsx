import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Player } from "./Player";
import { usePlayerStore } from "@/state/playerStore";

describe("Player", () => {
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

    expect(screen.getByText("song.mp3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByText("Vocals")).toBeInTheDocument();
    expect(screen.getByText("Drums")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /unmute drums/i })).toBeInTheDocument();
  });
});
