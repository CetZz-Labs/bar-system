import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import CashierPanelView from "./CashierPanelView";
import { closeCashierShift } from "@/API/CashierAPI";
import { useCashierAuth } from "@/hooks/useCashierAuth";
import type { CashierSession } from "@/types/cashier";

vi.mock("motion/react", async () => {
  const { mockMotion } = await import("@/test/mocks/motion");
  return mockMotion();
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/API/CashierAPI", async () => {
  const actual = await vi.importActual<typeof import("@/API/CashierAPI")>("@/API/CashierAPI");
  return { ...actual, closeCashierShift: vi.fn() };
});

vi.mock("@/hooks/useCashierAuth", () => ({
  useCashierAuth: vi.fn(),
}));

const mockCloseCashierShift = vi.mocked(closeCashierShift);
const mockUseCashierAuth = vi.mocked(useCashierAuth);

const session: CashierSession = {
  role: "CASHIER",
  bar: { id: "bar-1", name: "Bar Test", closingTime: "06:00" },
  shift: { startedAt: "2026-08-18T20:00:00.000Z" },
  user: { name: "Test", lastName: "Cashier" },
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/bar/bar-1/cajero"]}>
        <Routes>
          <Route path="/bar/:barId/cajero" element={<CashierPanelView />} />
          <Route path="/bar/:barId/cajero/cierre/:shiftId" element={<div>Resumen de cierre</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CashierPanelView shift closing", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockUseCashierAuth.mockReturnValue({
      data: session,
      isError: false,
      isLoading: false,
      logoutCashier: vi.fn(),
      autoClosedRecovery: null,
    });
  });

  it("shows a non-blocking warning for pending or disputed consumptions", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "CERRAR TURNO" }));

    expect(screen.getByRole("alert")).toHaveTextContent("pendientes o en disputa");
    expect(screen.getByRole("button", { name: "Seguir trabajando" })).toBeInTheDocument();
  });

  it("closes the shift without logging out before navigating to the full summary", async () => {
    const user = userEvent.setup();
    mockCloseCashierShift.mockResolvedValue({
      message: "Turno cerrado correctamente",
      shiftId: "shift-1",
      summary: {
        status: "PENDING",
        totalConsumptions: 2,
        confirmedConsumptions: 1,
        pendingConsumptions: 1,
        rejectedConsumptions: 0,
        disputedConsumptions: 0,
        totalAmount: 1000,
        pointsAwarded: 10,
        redemptionCount: 0,
        redemptionsAvailable: false,
        generatedAt: "2026-08-19T04:00:00.000Z",
      },
    });

    renderView();
    await user.click(screen.getByRole("button", { name: "CERRAR TURNO" }));
    await user.click(screen.getByRole("button", { name: "Cerrar turno" }));

    await waitFor(() => expect(mockCloseCashierShift).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Resumen de cierre")).toBeInTheDocument();
  });
});
