import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Upload } from "./Upload";
import { useLibraryStore } from "@/state/libraryStore";
import type { Song } from "@/lib/apiClient";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Upload", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useLibraryStore.setState({ songs: [], isUploading: false, error: null });
  });

  it("uploads the selected file", async () => {
    const user = userEvent.setup();
    const uploaded: Song = {
      id: "1",
      title: "song.mp3",
      created_at: "2026-01-01T00:00:00Z",
      job_status: "pending",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(uploaded));

    render(<Upload />);

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
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(uploaded));

    const { container } = render(<Upload />);
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

  it("shows a spinner and disables the button while uploading", () => {
    useLibraryStore.setState({ isUploading: true });
    render(<Upload />);
    expect(screen.getByRole("button", { name: /upload a song/i })).toBeDisabled();
  });
});
