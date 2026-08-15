import { useEffect } from "react";
import { motion } from "motion/react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useBackendStore, type BackendStatus } from "@/state/backendStore";
import { Library } from "@/components/Library";

const STATUS_CONFIG: Record<
  BackendStatus,
  { label: string; icon: typeof Loader2; className: string }
> = {
  unknown: {
    label: "Checking backend…",
    icon: Loader2,
    className: "text-muted-foreground",
  },
  reachable: {
    label: "Backend reachable",
    icon: CheckCircle2,
    className: "text-success border-success/30 bg-success/10",
  },
  unreachable: {
    label: "Backend unreachable",
    icon: XCircle,
    className: "text-destructive border-destructive/30 bg-destructive/10",
  },
};

function App() {
  const status = useBackendStore((state) => state.status);
  const check = useBackendStore((state) => state.check);

  useEffect(() => {
    check();
  }, [check]);

  const { label, icon: Icon, className } = STATUS_CONFIG[status];

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex flex-col gap-4"
      >
        <Card className="w-80">
          <CardHeader>
            <h1 className="text-2xl leading-none font-semibold">AVSeparate</h1>
          </CardHeader>
          <CardContent>
            <Badge
              variant="outline"
              className={`gap-1.5 px-3 py-1 ${className}`}
              data-testid="backend-status"
            >
              <Icon className={status === "unknown" ? "size-3.5 animate-spin" : "size-3.5"} />
              {label}
            </Badge>
          </CardContent>
        </Card>
        <Library />
      </motion.div>
    </main>
  );
}

export default App;
