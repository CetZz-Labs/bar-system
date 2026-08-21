import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import CashierShiftSummaryView from "./CashierShiftSummaryView";
import * as CashierAPI from "@/API/CashierAPI";
import type { CashierShiftSummary } from "@/types/cashier";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

vi.mock("@/API/CashierAPI");

const summary: CashierShiftSummary = {
  status: "PENDING",
  totalConsumptions: 4,
  confirmedConsumptions: 2,
  pendingConsumptions: 1,
  rejectedConsumptions: 0,
  disputedConsumptions: 1,
  totalAmount: 12500,
  pointsAwarded: 20,
  redemptionCount: 0,
  redemptionsAvailable: false,
  generatedAt: "2026-08-19T04:00:00.000Z",
};

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[{
          pathname: "/bar/bar-1/cajero/cierre/shift-1",
          state: { summary },
        }]}
      >
        <Routes>
          <Route path="/bar/:barId/cajero/cierre/:shiftId" element={<CashierShiftSummaryView />} />
          <Route path="/login" element={<div>Acceso del cajero</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderRefreshView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/bar/bar-1/cajero/cierre/shift-1"]}>
        <Routes>
          <Route path="/bar/:barId/cajero/cierre/:shiftId" element={<CashierShiftSummaryView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("CashierShiftSummaryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:summary"),
      revokeObjectURL: vi.fn(),
    });
    vi.mocked(CashierAPI.downloadShiftSummaryPdf).mockResolvedValue(new Blob(["pdf"]));
    vi.mocked(CashierAPI.downloadShiftSummaryCsv).mockResolvedValue(new Blob(["csv"]));
  });

  it("renders pending/disputed warnings and keeps the exit action explicit", async () => {
    renderView();

    expect(screen.getByRole("heading", { name: "Resumen de cierre" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("1 consumo(s) pendiente(s)");
    expect(screen.getByText("No disponible")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Salir y cerrar sesión/i })).toBeInTheDocument();
  });

  it("downloads PDF and CSV using their separate endpoints", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: "PDF" }));
    await user.click(screen.getByRole("button", { name: "CSV" }));

    await waitFor(() => {
      expect(CashierAPI.downloadShiftSummaryPdf).toHaveBeenCalledWith("shift-1");
      expect(CashierAPI.downloadShiftSummaryCsv).toHaveBeenCalledWith("shift-1");
    });
  });

  it("refreshes the cashier-owned summary through the authorized endpoint", async () => {
    vi.mocked(CashierAPI.getShiftSummary).mockResolvedValue({
      shiftId: "shift-1",
      barId: "bar-1",
      cashierId: "cashier-1",
      role: "CASHIER",
      deviceInfo: "test",
      startedAt: "2026-08-18T20:00:00.000Z",
      endedAt: "2026-08-19T04:00:00.000Z",
      endReason: "BAR_CLOSED",
      summary,
    });

    renderRefreshView();

    expect(await screen.findByRole("heading", { name: "Resumen de cierre" })).toBeInTheDocument();
    expect(CashierAPI.getShiftSummary).toHaveBeenCalledWith("shift-1");
  });

  it("exits to the unified login after the summary is reviewed", async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole("button", { name: /Salir y cerrar sesión/i }));

    expect(await screen.findByText("Acceso del cajero")).toBeInTheDocument();
  });
});
