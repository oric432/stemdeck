import { memo, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/state/playerStore";
import { fetchChords, type ChordEvent } from "@/lib/apiClient";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
// madmom's chord vocabulary hasn't been observed emitting flats, but handle
// them anyway rather than silently failing to transpose a root we don't
// recognize — always normalized to the equivalent sharp name.
const FLAT_TO_SHARP: Record<string, string> = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };

function transposeRoot(root: string, semitones: number): string {
  const normalized = FLAT_TO_SHARP[root] ?? root;
  const index = SHARP_NAMES.indexOf(normalized);
  if (index === -1) return root;
  return SHARP_NAMES[((index + semitones) % 12 + 12) % 12];
}

function formatChordLabel(label: string, pitchSemitones: number): string {
  if (label === "N") return "–";
  const [root, quality] = label.split(":");
  const transposedRoot = transposeRoot(root, pitchSemitones);
  if (!quality || quality === "maj") return transposedRoot;
  if (quality === "min") return `${transposedRoot}m`;
  return `${transposedRoot}${quality}`;
}

// A grid of fixed-width cells, like Chordify's — every cell is the same
// width, and a chord's on-screen span is how many cells it covers, not a
// variable per-chord cell width (that read as an uneven, broken grid).
// There's no real beat/tempo detection here, so each cell stands in for a
// fixed slice of time rather than an actual quarter note.
const CELL_SECONDS = 1;
const CELL_WIDTH = 80;
const CELL_HEIGHT = 72;
// Every 4th cell gets a bar-line-style separator — a grouping cue, same
// idea as a measure line, even without real beat detection behind it.
const CELLS_PER_BAR = 4;

// Only cells within this window of the playhead are actually mounted. A
// full song can be a few hundred cells, each with its own live store
// subscription (see ChordCell) — on weaker hardware that's enough constant
// background work (per a real profile: ~96% busy, dominated by GC/cycle-
// collector churn) to read as lag even though no single frame is slow.
// Recomputing the window itself is throttled to every WINDOW_STEP_SECONDS
// rather than every tick — it only needs to stay a step ahead of playback,
// not track it exactly, since WINDOW_BEFORE/AFTER give it slack either side.
const WINDOW_BEFORE_SECONDS = 16;
const WINDOW_AFTER_SECONDS = 32;
const WINDOW_STEP_SECONDS = 2;

interface Cell {
  chordIndex: number;
  cellIndex: number;
  globalIndex: number;
  startTime: number;
  endTime: number;
  label: string;
  isRest: boolean;
}

// Each cell subscribes to only "am I the active one" — a two-comparison
// selector re-run on every currentTime tick, but its *result* only flips
// for the one cell losing highlight and the one gaining it. Everything
// else's selector returns the same `false` it always has, so React skips
// re-rendering it. Doing this in the parent (one selector computing a
// single activeIndex for the whole grid) meant every chord change forced
// React to reconcile every mounted button at once — cheap on average, but
// a visible stutter right at each transition.
const ChordCell = memo(function ChordCell({
  cell,
  isChordStart,
  isBarStart,
}: {
  cell: Cell;
  isChordStart: boolean;
  isBarStart: boolean;
}) {
  const isActive = usePlayerStore(
    (state) => state.currentTime >= cell.startTime && state.currentTime < cell.endTime,
  );
  const seek = usePlayerStore((state) => state.seek);
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isActive) {
      ref.current?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
  }, [isActive]);

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => seek(cell.startTime)}
      style={{ width: `${CELL_WIDTH}px`, height: `${CELL_HEIGHT}px` }}
      className={cn(
        "relative flex shrink-0 items-center justify-center border-r border-border/60 font-mono text-base transition-colors",
        isChordStart && "border-l border-border/60",
        isBarStart && "border-l-2 border-l-primary/50",
        isActive
          ? "bg-primary text-primary-foreground"
          : cell.isRest
            ? "text-muted-foreground/40 hover:bg-accent/40"
            : "text-foreground hover:bg-accent/40",
      )}
    >
      {cell.label}
    </button>
  );
});

export function ChordTimeline({ songId }: { songId: string }) {
  const [chords, setChords] = useState<ChordEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pitchSemitones = usePlayerStore((state) => state.pitchSemitones);

  useEffect(() => {
    fetchChords(songId)
      .then(setChords)
      .catch(() => setError("Couldn't load the chord timeline."));
  }, [songId]);

  const cells: Cell[] = useMemo(() => {
    let globalIndex = 0;
    return chords.flatMap((chord, chordIndex) => {
      const duration = chord.end_time - chord.start_time;
      const cellCount = Math.max(Math.round(duration / CELL_SECONDS), 1);
      const step = duration / cellCount;
      return Array.from({ length: cellCount }, (_, cellIndex) => ({
        chordIndex,
        cellIndex,
        globalIndex: globalIndex++,
        startTime: chord.start_time + cellIndex * step,
        endTime: chord.start_time + (cellIndex + 1) * step,
        label: cellIndex === 0 ? formatChordLabel(chord.chord_label, pitchSemitones) : "",
        isRest: chord.chord_label === "N",
      }));
    });
  }, [chords, pitchSemitones]);

  const windowCenter = usePlayerStore(
    (state) => Math.floor(state.currentTime / WINDOW_STEP_SECONDS) * WINDOW_STEP_SECONDS,
  );

  const { visibleCells, leftSpacerWidth, rightSpacerWidth } = useMemo(() => {
    const windowStart = windowCenter - WINDOW_BEFORE_SECONDS;
    const windowEnd = windowCenter + WINDOW_AFTER_SECONDS;
    let startIndex = cells.findIndex((cell) => cell.endTime > windowStart);
    if (startIndex === -1) startIndex = cells.length;
    let endIndex = cells.length - 1;
    for (let i = startIndex; i < cells.length; i++) {
      if (cells[i].startTime > windowEnd) {
        endIndex = i - 1;
        break;
      }
    }
    return {
      visibleCells: cells.slice(startIndex, endIndex + 1),
      leftSpacerWidth: startIndex * CELL_WIDTH,
      rightSpacerWidth: Math.max(cells.length - 1 - endIndex, 0) * CELL_WIDTH,
    };
  }, [cells, windowCenter]);

  if (error) return <p className="mx-auto w-full max-w-xl text-sm text-destructive">{error}</p>;
  if (chords.length === 0) return null;

  return (
    <div className="relative mx-auto w-full max-w-xl overflow-hidden rounded-sm border-2 border-border bg-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 z-10 w-px -translate-x-1/2 bg-primary"
      />
      <div
        className="chord-scrollbar flex items-stretch overflow-x-auto scroll-smooth py-5"
        style={{ paddingInline: `calc(50% - ${CELL_WIDTH / 2}px)` }}
      >
        <div aria-hidden style={{ width: `${leftSpacerWidth}px` }} className="shrink-0" />
        {visibleCells.map((cell) => (
          <ChordCell
            key={`${cell.chordIndex}-${cell.cellIndex}`}
            cell={cell}
            isChordStart={cell.cellIndex === 0}
            isBarStart={cell.globalIndex % CELLS_PER_BAR === 0}
          />
        ))}
        <div aria-hidden style={{ width: `${rightSpacerWidth}px` }} className="shrink-0" />
      </div>
    </div>
  );
}
