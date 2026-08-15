import { create } from "zustand";
import { fetchSongs, uploadSong, type Song } from "@/lib/apiClient";

interface LibraryState {
  songs: Song[];
  isUploading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  upload: (file: File) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  songs: [],
  isUploading: false,
  error: null,
  refresh: async () => {
    try {
      const songs = await fetchSongs();
      set({ songs, error: null });
    } catch {
      set({ error: "Couldn't load your songs." });
    }
  },
  upload: async (file: File) => {
    set({ isUploading: true, error: null });
    try {
      await uploadSong(file);
      await get().refresh();
    } catch {
      set({ error: "Upload failed. Try again." });
    } finally {
      set({ isUploading: false });
    }
  },
}));
