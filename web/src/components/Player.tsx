import { Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { usePlayerStore } from "@/state/playerStore";
import type { StemKind } from "@/lib/apiClient";

const STEM_LABELS: Record<StemKind, string> = {
  vocals: "Vocals",
  drums: "Drums",
  bass: "Bass",
  other: "Other",
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
    <Card className="w-80">
      <CardHeader>
        <div className="flex w-full items-center justify-between gap-2">
          <span className="truncate text-sm font-medium">{songTitle}</span>
          <Button size="icon-xs" variant="ghost" onClick={close} aria-label="Close player">
            <X className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Loading stems…</p> : null}

        {!isLoading && !error ? (
          <>
            <div className="flex items-center gap-3">
              <Button size="icon-sm" onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              </Button>
              <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
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

            <div className="flex flex-col gap-3">
              {stems.map((stem) => (
                <div key={stem.kind} className="flex items-center gap-2">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => toggleMute(stem.kind)}
                    aria-label={stem.muted ? `Unmute ${stem.kind}` : `Mute ${stem.kind}`}
                    aria-pressed={stem.muted}
                  >
                    {stem.muted ? (
                      <VolumeX className="size-3.5 text-muted-foreground" />
                    ) : (
                      <Volume2 className="size-3.5" />
                    )}
                  </Button>
                  <span className="w-14 shrink-0 text-xs">{STEM_LABELS[stem.kind]}</span>
                  <Slider
                    value={[stem.muted ? 0 : stem.volume * 100]}
                    min={0}
                    max={100}
                    step={1}
                    disabled={stem.muted}
                    onValueChange={([value]) => setVolume(stem.kind, value / 100)}
                  />
                </div>
              ))}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
