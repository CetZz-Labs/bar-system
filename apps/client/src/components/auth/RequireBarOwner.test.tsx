import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RequireBarOwner } from "./RequireBarOwner";

vi.mock("@/hooks/useActiveContext", () => ({
  useActiveContext: vi.fn(),
}));

vi.mock("@/API/BarAPI", () => ({
  getMyBars: vi.fn(),
}));

import { useActiveContext } from "@/hooks/useActiveContext";
import { getMyBars } from "@/API/BarAPI";
import type { MyBar } from "@/types/bar";

const mockCtx = vi.mocked(useActiveContext);
const mockMyBars = vi.mocked(getMyBars);

describe("RequireBarOwner (LB-85)", () => {
  it("redirects bar-context JWT away from owner admin", () => {
    mockCtx.mockReturnValue({
      mode: "bar",
      barId: "b1",
      barRole: "CASHIER",
      isLoading: false,
      isBarContext: true,
      isUserContext: false,
      roleHome: "/bar/b1/cajero",
      cashierProbeFailed: false,
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/bar/b1/perfil"]}>
          <Routes>
            <Route path="/bar/b1/cajero" element={<div>Cashier</div>} />
            <Route
              path="/bar/:id/perfil"
              element={
                <RequireBarOwner>
                  <div>Owner Content</div>
                </RequireBarOwner>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.queryByText("Owner Content")).not.toBeInTheDocument();
    expect(screen.getByText("Cashier")).toBeInTheDocument();
  });

  it("shows children when user is OWNER of the bar", async () => {
    mockCtx.mockReturnValue({
      mode: "user",
      barId: undefined,
      barRole: undefined,
      isLoading: false,
      isBarContext: false,
      isUserContext: true,
      roleHome: "/",
      cashierProbeFailed: true,
    });
    mockMyBars.mockResolvedValue([
      { id: "bar-1", name: "Test", role: "OWNER" } as MyBar,
    ]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/bar/bar-1/perfil"]}>
          <Routes>
            <Route
              path="/bar/:id/perfil"
              element={
                <RequireBarOwner>
                  <div>Owner Content</div>
                </RequireBarOwner>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Owner Content")).toBeInTheDocument();
  });

  it("redirects non-owner to mis-bares", async () => {
    mockCtx.mockReturnValue({
      mode: "user",
      barId: undefined,
      barRole: undefined,
      isLoading: false,
      isBarContext: false,
      isUserContext: true,
      roleHome: "/",
      cashierProbeFailed: true,
    });
    mockMyBars.mockResolvedValue([
      { id: "bar-1", name: "Test", role: "CASHIER" } as unknown as MyBar,
    ]);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/bar/bar-1/perfil"]}>
          <Routes>
            <Route path="/bar/mis-bares" element={<div>Mis bares</div>} />
            <Route
              path="/bar/:id/perfil"
              element={
                <RequireBarOwner>
                  <div>Owner Content</div>
                </RequireBarOwner>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByText("Mis bares")).toBeInTheDocument();
  });
});
