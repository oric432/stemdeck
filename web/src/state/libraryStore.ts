import { create } from "zustand";
import { deleteSong, fetchSongs, uploadSong, type Song } from "@/lib/apiClient";

const PAGE_SIZE = 20;

interface LibraryState {
  songs: Song[];
  isUploading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  upload: (file: File) => Promise<void>;
  remove: (songId: string) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  songs: [],
  isUploading: false,
  isLoadingMore: false,
  hasMore: true,
  error: null,

  // Re-fetches everything currently loaded (not just the first page) so job
  // status changes reach rows brought in by loadMore, without resetting
  // back down to one page — used both for the initial load and for the
  // active-job poll in SongList.
  refresh: async () => {
    const count = Math.max(get().songs.length, PAGE_SIZE);
    try {
      const songs = await fetchSongs({ limit: count, offset: 0 });
      set({ songs, error: null, hasMore: songs.length === count });
    } catch {
      set({ error: "Couldn't load your songs." });
    }
  },

  loadMore: async () => {
    if (get().isLoadingMore || !get().hasMore) return;
    set({ isLoadingMore: true });
    try {
      const offset = get().songs.length;
      const page = await fetchSongs({ limit: PAGE_SIZE, offset });
      set((state) => ({
        songs: [...state.songs, ...page],
        hasMore: page.length === PAGE_SIZE,
        error: null,
      }));
    } catch {
      set({ error: "Couldn't load more songs." });
    } finally {
      set({ isLoadingMore: false });
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

  remove: async (songId: string) => {
    try {
      await deleteSong(songId);
      set((state) => ({ songs: state.songs.filter((song) => song.id !== songId) }));
    } catch {
      set({ error: "Couldn't delete this song." });
    }
  },
}));
