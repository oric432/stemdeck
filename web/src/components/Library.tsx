import { useEffect, useRef, useState } from "react";
import { Clock, Loader2, Music, Upload, XCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useLibraryStore } from "@/state/libraryStore";
import { usePlayerStore } from "@/state/playerStore";
import type { Song } from "@/lib/apiClient";

const JOB_STATUS_CONFIG: Record<Song["job_status"], { icon: typeof Clock; className: string }> = {
  pending: { icon: Clock, className: "text-muted-foreground" },
  processing: { icon: Loader2, className: "text-muted-foreground" },
  complete: { icon: CheckCircle2, className: "text-success" },
  failed: { icon: XCircle, className: "text-destructive" },
  unknown: { icon: Clock, className: "text-muted-foreground" },
};

function JobStatusBadge({ status }: { status: Song["job_status"] }) {
  const { icon: Icon, className } = JOB_STATUS_CONFIG[status];
  return (
    <Badge variant="outline" className={`gap-1 ${className}`}>
      <Icon className={status === "processing" ? "size-3 animate-spin" : "size-3"} />
      {status}
    </Badge>
  );
}

const ACTIVE_STATUSES: ReadonlySet<Song["job_status"]> = new Set(["pending", "processing"]);
const POLL_INTERVAL_MS = 3000;

export function Library() {
  const songs = useLibraryStore((state) => state.songs);
  const hasActiveJobs = useLibraryStore((state) =>
    state.songs.some((song) => ACTIVE_STATUSES.has(song.job_status)),
  );
  const isUploading = useLibraryStore((state) => state.isUploading);
  const error = useLibraryStore((state) => state.error);
  const refresh = useLibraryStore((state) => state.refresh);
  const upload = useLibraryStore((state) => state.upload);
  const loadSong = usePlayerStore((state) => state.loadSong);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!hasActiveJobs) return;
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [hasActiveJobs, refresh]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      upload(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => setIsDraggingOver(false);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDraggingOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      upload(file);
    }
  };

  return (
    <Card
      className={cn("w-80 transition-colors", isDraggingOver && "border-primary bg-accent/50")}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <CardHeader>
        <div className="flex w-full items-center justify-between">
          <span className="text-sm font-medium">Your songs</span>
          <Button
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            Upload
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            // sr-only, not `hidden` — Firefox won't open the picker via
            // .click() on a display:none input, only Chrome tolerates that.
            className="sr-only"
            onChange={handleFileChange}
          />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {songs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No songs yet — upload one, or drag an audio file in.
          </p>
        ) : (
          songs.map((song, index) => {
            const isPlayable = song.job_status === "complete";
            return (
              <div key={song.id}>
                {index > 0 ? <Separator className="mb-3" /> : null}
                <button
                  type="button"
                  disabled={!isPlayable}
                  onClick={() => loadSong(song.id, song.title)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md text-left",
                    isPlayable && "cursor-pointer hover:text-primary",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Music className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate text-sm">{song.title}</span>
                  </div>
                  <JobStatusBadge status={song.job_status} />
                </button>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
