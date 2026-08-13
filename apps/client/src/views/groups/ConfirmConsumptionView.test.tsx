import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ConfirmConsumptionView from "./ConfirmConsumptionView";

vi.mock("@/API/ConsumptionAPI", () => ({
  lookupConsumption: vi.fn(),
  acceptConsumption: vi.fn(),
  rejectConsumption: vi.fn(),
}));

vi.mock("@/hooks/useGroupPointsSocket", () => ({
  useGroupPointsSocket: vi.fn(),
}));

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/groups/demo/confirmar-consumo"]}>
        <Routes>
          <Route path="/groups/:slug/confirmar-consumo" element={<ConfirmConsumptionView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ConfirmConsumptionView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders confirm consumption heading and code input", () => {
    renderView();
    expect(screen.getByText("Confirmar consumo")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/6 dígitos o pegá el token del QR/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Buscar consumo/i })).toBeInTheDocument();
  });
});
