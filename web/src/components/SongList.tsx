import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Music } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Led, type LedColor } from "@/components/Led";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/state/libraryStore";
import type { Song } from "@/lib/apiClient";

const JOB_STATUS_CONFIG: Record<Song["job_status"], { color: LedColor; label: string; pulse?: boolean }> = {
  pending: { color: "dim", label: "Pending" },
  processing: { color: "amber", label: "Separating", pulse: true },
  complete: { color: "green", label: "Ready" },
  failed: { color: "red", label: "Failed" },
  unknown: { color: "dim", label: "Unknown" },
};

function StatusReadout({ status }: { status: Song["job_status"] }) {
  const { color, label, pulse } = JOB_STATUS_CONFIG[status];
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <Led color={color} pulse={pulse} />
      <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
    </span>
  );
}

const ACTIVE_STATUSES: ReadonlySet<Song["job_status"]> = new Set(["pending", "processing"]);
const POLL_INTERVAL_MS = 3000;

export function SongList() {
  const songs = useLibraryStore((state) => state.songs);
  const hasActiveJobs = useLibraryStore((state) =>
    state.songs.some((song) => ACTIVE_STATUSES.has(song.job_status)),
  );
  const error = useLibraryStore((state) => state.error);
  const refresh = useLibraryStore((state) => state.refresh);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasActiveJobs, refresh]);

  return (
    <Card className="mx-auto w-full max-w-lg border-2 border-border">
      <CardHeader>
        <span className="font-display text-xl tracking-wide text-foreground uppercase">Songs</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {songs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No songs yet — upload one above to get started.</p>
        ) : (
          songs.map((song, index) => {
            const isPlayable = song.job_status === "complete";
            const rowClassName = "flex w-full items-center justify-between gap-3 rounded-sm px-1 py-1.5";
            const row = (
              <>
                <div className="flex min-w-0 items-center gap-2.5">
                  <Music className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-base">{song.title}</span>
                </div>
                <StatusReadout status={song.job_status} />
              </>
            );
            return (
              <div key={song.id}>
                {index > 0 ? <Separator className="mb-4" /> : null}
                {isPlayable ? (
                  <Link
                    to={`/songs/${song.id}`}
                    className={cn(rowClassName, "transition-[transform,background-color] hover:bg-accent/40 active:translate-y-px")}
                  >
                    {row}
                  </Link>
                ) : (
                  <div className={rowClassName}>{row}</div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
