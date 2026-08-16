import { useEffect } from "react";
import { motion } from "motion/react";
import { useBackendStore, type BackendStatus } from "@/state/backendStore";
import { Library } from "@/components/Library";
import { Player } from "@/components/Player";
import { Led, type LedColor } from "@/components/Led";

const STATUS_CONFIG: Record<BackendStatus, { color: LedColor; label: string; pulse?: boolean }> = {
  unknown: { color: "amber", label: "Checking backend…", pulse: true },
  reachable: { color: "green", label: "Backend reachable" },
  unreachable: { color: "red", label: "Backend unreachable" },
};

function App() {
  const status = useBackendStore((state) => state.status);
  const check = useBackendStore((state) => state.check);

  useEffect(() => {
    check();
  }, [check]);

  const { color, label, pulse } = STATUS_CONFIG[status];

  return (
    <main className="min-h-svh bg-background px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="mx-auto flex max-w-4xl flex-col gap-8"
      >
        <header className="flex items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <h1 className="font-display text-4xl leading-none font-semibold tracking-wide text-foreground uppercase">
              AVSeparate
            </h1>
            <p className="mt-2 text-xs tracking-[0.2em] text-muted-foreground uppercase">
              Stem separation &amp; practice deck
            </p>
          </div>
          <div className="flex items-center gap-2 pb-1" data-testid="backend-status">
            <Led color={color} pulse={pulse} />
            <span className="text-xs tracking-wide text-muted-foreground uppercase">{label}</span>
          </div>
        </header>

        <div className="flex flex-col items-start gap-6 md:flex-row">
          <Library />
          <Player />
        </div>
      </motion.div>
    </main>
  );
}

export default App;
