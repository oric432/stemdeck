import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Library } from "./Library";
import { useLibraryStore } from "@/state/libraryStore";
import type { Song } from "@/lib/apiClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Library", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useLibraryStore.setState({ songs: [], isUploading: false, error: null });
  });

  it("shows the empty state with no songs", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse([]));

    render(<Library />);

    await waitFor(() =>
      expect(screen.getByText(/no songs yet/i)).toBeInTheDocument(),
    );
  });

  it("lists songs returned by the backend", async () => {
    const songs: Song[] = [
      { id: "1", title: "practice-track.mp3", created_at: "2026-01-01T00:00:00Z", job_status: "pending" },
    ];
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(songs));

    render(<Library />);

    await waitFor(() => expect(screen.getByText("practice-track.mp3")).toBeInTheDocument());
    expect(screen.getByText("pending")).toBeInTheDocument();
  });

  it("uploads the selected file and refreshes the list", async () => {
    const user = userEvent.setup();
    const uploaded: Song = {
      id: "1",
      title: "song.mp3",
      created_at: "2026-01-01T00:00:00Z",
      job_status: "pending",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse(uploaded));
      }
      return Promise.resolve(jsonResponse(init ? [] : [uploaded]));
    });

    render(<Library />);
    await waitFor(() => expect(screen.getByText(/no songs yet/i)).toBeInTheDocument());

    const file = new File(["fake audio"], "song.mp3", { type: "audio/mpeg" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/songs"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("uploads a file dropped onto the card", async () => {
    const uploaded: Song = {
      id: "1",
      title: "dropped.mp3",
      created_at: "2026-01-01T00:00:00Z",
      job_status: "pending",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation((_url, init) => {
      if (init?.method === "POST") {
        return Promise.resolve(jsonResponse(uploaded));
      }
      return Promise.resolve(jsonResponse(init ? [] : [uploaded]));
    });

    const { container } = render(<Library />);
    const dropzone = container.querySelector('[data-slot="card"]')!;

    const file = new File(["fake audio"], "dropped.mp3", { type: "audio/mpeg" });
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/songs"),
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });
});
