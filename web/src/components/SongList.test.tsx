import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SongList } from "./SongList";
import { useLibraryStore } from "@/state/libraryStore";
import type { Song } from "@/lib/apiClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderSongList() {
  return render(
    <MemoryRouter>
      <SongList />
    </MemoryRouter>,
  );
}

describe("SongList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useLibraryStore.setState({ songs: [], isUploading: false, error: null });
  });

  it("shows the empty state with no songs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));

    renderSongList();

    await waitFor(() => expect(screen.getByText(/no songs yet/i)).toBeInTheDocument());
  });

  it("lists songs returned by the backend", async () => {
    const songs: Song[] = [
      { id: "1", title: "practice-track.mp3", created_at: "2026-01-01T00:00:00Z", job_status: "pending" },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(songs));

    renderSongList();

    await waitFor(() => expect(screen.getByText("practice-track.mp3")).toBeInTheDocument());
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("links a ready song to its song page, and leaves an unready one unlinked", async () => {
    const songs: Song[] = [
      { id: "1", title: "ready.mp3", created_at: "2026-01-01T00:00:00Z", job_status: "complete" },
      { id: "2", title: "still-going.mp3", created_at: "2026-01-01T00:00:00Z", job_status: "processing" },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(songs));

    renderSongList();

    await waitFor(() => expect(screen.getByText("ready.mp3")).toBeInTheDocument());
    expect(screen.getByText("ready.mp3").closest("a")).toHaveAttribute("href", "/songs/1");
    expect(screen.getByText("still-going.mp3").closest("a")).toBeNull();
  });
});
