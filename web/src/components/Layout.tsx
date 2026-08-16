import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { motion } from "motion/react";
import { useBackendStore } from "@/state/backendStore";
import { Led } from "@/components/Led";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Layout() {
  const status = useBackendStore((state) => state.status);
  const check = useBackendStore((state) => state.check);

  useEffect(() => {
    check();
  }, [check]);

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
              Stemdeck
            </h1>
            <p className="mt-2 text-xs tracking-[0.2em] text-muted-foreground uppercase">
              Stem separation &amp; practice deck
            </p>
          </div>
          <div className="flex items-center gap-3 pb-1">
            {/* Silent when healthy, like most apps — only speak up when
                there's actually something wrong. */}
            {status === "unreachable" ? (
              <div className="flex items-center gap-2" data-testid="backend-status">
                <Led color="red" />
                <span className="text-xs tracking-wide text-muted-foreground uppercase">
                  Backend unreachable
                </span>
              </div>
            ) : null}
            <ThemeToggle />
          </div>
        </header>

        <Outlet />
      </motion.div>
    </main>
  );
}
