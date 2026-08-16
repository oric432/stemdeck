import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Led, type LedColor } from "@/components/Led";
import { Player } from "@/components/Player";
import { usePlayerStore } from "@/state/playerStore";
import { fetchSong, type Song } from "@/lib/apiClient";

const STATUS_CONFIG: Record<Song["job_status"], { color: LedColor; label: string; pulse?: boolean }> = {
  pending: { color: "dim", label: "Waiting to start separation…" },
  processing: { color: "amber", label: "Separating stems — this can take a minute…", pulse: true },
  complete: { color: "green", label: "Ready" },
  failed: { color: "red", label: "Separation failed. Try uploading the song again." },
  unknown: { color: "dim", label: "Unknown status." },
};

const ACTIVE_STATUSES: ReadonlySet<Song["job_status"]> = new Set(["pending", "processing"]);
const POLL_INTERVAL_MS = 3000;

export function SongPage() {
  const { id } = useParams<{ id: string }>();
  const [song, setSong] = useState<Song | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadSong = usePlayerStore((state) => state.loadSong);
  const closePlayer = usePlayerStore((state) => state.close);

  useEffect(() => {
    if (!id) return;
    fetchSong(id)
      .then(setSong)
      .catch(() => setError("Couldn't load this song."));
  }, [id]);

  useEffect(() => {
    if (!id || !song || !ACTIVE_STATUSES.has(song.job_status)) return;
    const interval = setInterval(() => {
      fetchSong(id).then(setSong).catch(() => {});
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [id, song]);

  useEffect(() => {
    if (id && song?.job_status === "complete") {
      loadSong(id, song.title);
    }
  }, [id, song?.job_status, song?.title, loadSong]);

  // Stop playback (and free the AudioContext) as soon as this page is left,
  // not just on an explicit close — otherwise a stem keeps playing silently
  // after navigating back to the library.
  useEffect(() => {
    return () => closePlayer();
  }, [closePlayer]);

  return (
    <div className="flex w-full flex-col gap-6">
      <Link
        to="/"
        className="inline-flex w-fit items-center gap-1.5 text-xs tracking-wide text-muted-foreground uppercase hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        Back to library
      </Link>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {song ? <h2 className="mx-auto w-full max-w-lg truncate text-center text-2xl font-medium">{song.title}</h2> : null}

      {song && song.job_status === "complete" ? <Player /> : null}

      {song && song.job_status !== "complete" ? (
        <Card className="mx-auto w-full max-w-lg border-2 border-border">
          <CardContent className="flex items-center justify-center gap-3 py-8">
            <Led color={STATUS_CONFIG[song.job_status].color} pulse={STATUS_CONFIG[song.job_status].pulse} />
            <span className="text-base text-muted-foreground">{STATUS_CONFIG[song.job_status].label}</span>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
