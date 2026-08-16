import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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

  if (!songId) return null;

  return (
    <Card className="mx-auto w-full max-w-lg border-2 border-border">
      <CardContent className="flex flex-col gap-6">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Loading stems…</p> : null}

        {!isLoading && !error ? (
          <>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-4">
                <Button
                  size="icon-lg"
                  className="rounded-full"
                  onClick={togglePlay}
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
                </Button>
                <span className="rounded-sm border border-border bg-background px-3 py-1.5 font-mono text-sm tabular-nums text-primary shadow-[inset_0_1px_2px_rgb(0_0_0_/_0.6)]">
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
            </div>

            <Separator />

            <div className="flex items-start justify-between px-4 pt-1">
              {stems.map((stem) => (
                <div key={stem.kind} className="flex flex-col items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => toggleMute(stem.kind)}
                    aria-label={stem.muted ? `Unmute ${stem.kind}` : `Mute ${stem.kind}`}
                    aria-pressed={stem.muted}
                    className={cn(
                      "flex size-7 items-center justify-center rounded-sm border-2 transition-colors",
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
                    className="h-40"
                  />
                  <span className="font-mono text-xs tracking-wider text-muted-foreground">
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
