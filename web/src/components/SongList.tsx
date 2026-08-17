import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Music, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Led, type LedColor } from "@/components/Led";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/state/libraryStore";
import type { Song } from "@/lib/apiClient";

const JOB_STATUS_CONFIG: Record<Song["job_status"], { color: LedColor; label: string; pulse?: boolean }> = {
  pending: { color: "dim", label: "Pending" },
  processing: { color: "primary", label: "Separating", pulse: true },
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
  const hasMore = useLibraryStore((state) => state.hasMore);
  const isLoadingMore = useLibraryStore((state) => state.isLoadingMore);
  const error = useLibraryStore((state) => state.error);
  const refresh = useLibraryStore((state) => state.refresh);
  const loadMore = useLibraryStore((state) => state.loadMore);
  const remove = useLibraryStore((state) => state.remove);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasActiveJobs, refresh]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  function handleDelete(song: Song) {
    if (window.confirm(`Delete "${song.title}"? This can't be undone.`)) {
      remove(song.id);
    }
  }

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
            const linkContent = (
              <>
                <Music className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate text-base">{song.title}</span>
              </>
            );
            return (
              <div key={song.id}>
                {index > 0 ? <Separator className="mb-4" /> : null}
                <div className="flex w-full items-center justify-between gap-3 rounded-sm px-1 py-1.5">
                  {isPlayable ? (
                    <Link
                      to={`/songs/${song.id}`}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2.5 rounded-sm",
                        "transition-[transform,background-color] hover:bg-accent/40 active:translate-y-px",
                      )}
                    >
                      {linkContent}
                    </Link>
                  ) : (
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">{linkContent}</div>
                  )}
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusReadout status={song.job_status} />
                    <button
                      type="button"
                      aria-label={`Delete ${song.title}`}
                      onClick={() => handleDelete(song)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
        {hasMore ? (
          <div ref={sentinelRef} className="py-2 text-center text-xs text-muted-foreground">
            {isLoadingMore ? "Loading more…" : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
