const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export interface Song {
  id: string;
  title: string;
  created_at: string;
  job_status: "pending" | "processing" | "complete" | "failed" | "unknown";
}

export async function checkHealth(): Promise<boolean> {
  const response = await fetch(`${BASE_URL}/health`);
  return response.ok;
}

export async function fetchSongs(): Promise<Song[]> {
  const response = await fetch(`${BASE_URL}/songs`);
  if (!response.ok) {
    throw new Error(`Failed to fetch songs: ${response.status}`);
  }
  return response.json();
}

export type StemKind = "vocals" | "drums" | "bass" | "other";

export interface Stem {
  kind: StemKind;
  url: string;
}

export async function fetchStems(songId: string): Promise<Stem[]> {
  const response = await fetch(`${BASE_URL}/songs/${songId}/stems`);
  if (!response.ok) {
    throw new Error(`Failed to fetch stems: ${response.status}`);
  }
  return response.json();
}

export async function uploadSong(file: File): Promise<Song> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${BASE_URL}/songs`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Failed to upload song: ${response.status}`);
  }
  return response.json();
}
