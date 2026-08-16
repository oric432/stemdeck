import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SongPage } from "./SongPage";
import { usePlayerStore } from "@/state/playerStore";

vi.mock("@/lib/audioEngine", () => {
  class FakeAudioEngine {
    duration = 0;
    isPlaying = false;
    currentTime = 0;
    async load() {}
    play() {}
    pause() {}
    seek() {}
    setVolume() {}
    toggleMute() {}
    mixerState() {
      return [];
    }
    stop() {}
    dispose() {}
  }
  return { AudioEngine: FakeAudioEngine };
});

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

function renderAt(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/songs/${id}`]}>
      <Routes>
        <Route path="/songs/:id" element={<SongPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SongPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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

  it("shows a waiting message while the job is still processing", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ id: "1", title: "song.mp3", created_at: "2026-01-01T00:00:00Z", job_status: "processing" }),
    );

    renderAt("1");

    await waitFor(() => expect(screen.getByText(/separating stems/i)).toBeInTheDocument());
    expect(screen.getByText("song.mp3")).toBeInTheDocument();
  });

  it("mounts the player once the job completes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      if (String(url).includes("/stems")) return Promise.resolve(jsonResponse([]));
      return Promise.resolve(
        jsonResponse({ id: "1", title: "song.mp3", created_at: "2026-01-01T00:00:00Z", job_status: "complete" }),
      );
    });

    renderAt("1");

    await waitFor(() => expect(usePlayerStore.getState().songId).toBe("1"));
  });
});
