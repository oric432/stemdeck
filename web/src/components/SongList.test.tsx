import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    useLibraryStore.setState({
      songs: [],
      isUploading: false,
      isLoadingMore: false,
      hasMore: true,
      error: null,
    });
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

  it("deletes a song after confirming", async () => {
    const songs: Song[] = [
      { id: "1", title: "practice-track.mp3", created_at: "2026-01-01T00:00:00Z", job_status: "complete" },
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/songs/1") && !url.includes("stems")) {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return Promise.resolve(jsonResponse(songs));
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    renderSongList();

    await waitFor(() => expect(screen.getByText("practice-track.mp3")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /delete practice-track.mp3/i }));

    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(expect.stringContaining("/songs/1"), expect.objectContaining({ method: "DELETE" })),
    );
    await waitFor(() => expect(screen.queryByText("practice-track.mp3")).not.toBeInTheDocument());
  });

  it("keeps a song when deletion isn't confirmed", async () => {
    const songs: Song[] = [
      { id: "1", title: "practice-track.mp3", created_at: "2026-01-01T00:00:00Z", job_status: "complete" },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(songs));
    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderSongList();

    await waitFor(() => expect(screen.getByText("practice-track.mp3")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: /delete practice-track.mp3/i }));

    expect(globalThis.fetch).not.toHaveBeenCalledWith(expect.stringContaining("/songs/1"), expect.objectContaining({ method: "DELETE" }));
    expect(screen.getByText("practice-track.mp3")).toBeInTheDocument();
  });

  it("shows a loading indicator while fetching more songs", async () => {
    // A full page (matches libraryStore's PAGE_SIZE) so refresh() concludes
    // there might be more, and the sentinel/loading indicator renders at all.
    const songs: Song[] = Array.from({ length: 20 }, (_, i) => ({
      id: String(i),
      title: `track-${i}.mp3`,
      created_at: "2026-01-01T00:00:00Z",
      job_status: "complete",
    }));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(songs));

    renderSongList();

    await waitFor(() => expect(useLibraryStore.getState().hasMore).toBe(true));
    useLibraryStore.setState({ isLoadingMore: true });

    await waitFor(() => expect(screen.getByText(/loading more/i)).toBeInTheDocument());
  });
});
