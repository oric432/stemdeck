import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { useBackendStore } from "@/state/backendStore";

describe("App", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useBackendStore.setState({ status: "unknown" });
  });

  it("stays silent once the health check succeeds", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

    render(<App />);

    await waitFor(() => expect(useBackendStore.getState().status).toBe("reachable"));
    expect(screen.queryByTestId("backend-status")).not.toBeInTheDocument();
  });

  it("shows unreachable when the health check fails", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));

    render(<App />);

    await waitFor(() =>
      expect(screen.getByTestId("backend-status")).toHaveTextContent("Backend unreachable"),
    );
  });
});
