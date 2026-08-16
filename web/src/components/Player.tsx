import { Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Led } from "@/components/Led";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/state/playerStore";
import type { StemKind } from "@/lib/apiClient";

const STEM_LABELS: Record<StemKind, string> = {
  vocals: "VOX",
  drums: "DRM",
  bass: "BASS",
  other: "OTH",
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function Player() {
  const songId = usePlayerStore((state) => state.songId);
  const songTitle = usePlayerStore((state) => state.songTitle);
  const isLoading = usePlayerStore((state) => state.isLoading);
  const error = usePlayerStore((state) => state.error);
  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const stems = usePlayerStore((state) => state.stems);
  const togglePlay = usePlayerStore((state) => state.togglePlay);
  const seek = usePlayerStore((state) => state.seek);
  const setVolume = usePlayerStore((state) => state.setVolume);
  const toggleMute = usePlayerStore((state) => state.toggleMute);
  const close = usePlayerStore((state) => state.close);

  if (!songId) return null;

  return (
    <Card className="w-full border-2 border-border md:w-auto md:min-w-80">
      <CardHeader>
        <div className="flex w-full items-center justify-between gap-3">
          <span className="truncate text-sm font-medium">{songTitle}</span>
          <Button size="icon-xs" variant="ghost" onClick={close} aria-label="Close player">
            <X className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Loading stems…</p> : null}

        {!isLoading && !error ? (
          <>
            <div className="flex items-center gap-3">
              <Button
                size="icon-sm"
                className="rounded-full"
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
              </Button>
              <span className="rounded-sm border border-border bg-background px-2 py-1 font-mono text-xs tabular-nums text-primary shadow-[inset_0_1px_2px_rgb(0_0_0_/_0.6)]">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
            <Slider
              value={[currentTime]}
              min={0}
              max={duration || 1}
              step={0.1}
              onValueChange={([value]) => seek(value)}
            />

            <div className="flex items-start justify-center gap-5 pt-1">
              {stems.map((stem) => (
                <div key={stem.kind} className="flex flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleMute(stem.kind)}
                    aria-label={stem.muted ? `Unmute ${stem.kind}` : `Mute ${stem.kind}`}
                    aria-pressed={stem.muted}
                    className={cn(
                      "flex size-6 items-center justify-center rounded-sm border-2 transition-colors",
                      stem.muted ? "border-border bg-secondary" : "border-primary/60 bg-secondary",
                    )}
                  >
                    <Led color={stem.muted ? "dim" : "amber"} />
                  </button>
                  <Slider
                    orientation="vertical"
                    value={[stem.muted ? 0 : stem.volume * 100]}
                    min={0}
                    max={100}
                    step={1}
                    disabled={stem.muted}
                    onValueChange={([value]) => setVolume(stem.kind, value / 100)}
                    className="h-28"
                  />
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                    {STEM_LABELS[stem.kind]}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
