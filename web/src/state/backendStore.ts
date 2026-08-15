import { create } from "zustand";
import { checkHealth } from "@/lib/apiClient";

export type BackendStatus = "unknown" | "reachable" | "unreachable";

interface BackendState {
  status: BackendStatus;
  check: () => Promise<void>;
}

export const useBackendStore = create<BackendState>((set) => ({
  status: "unknown",
  check: async () => {
    try {
      const ok = await checkHealth();
      set({ status: ok ? "reachable" : "unreachable" });
    } catch {
      set({ status: "unreachable" });
    }
  },
}));
