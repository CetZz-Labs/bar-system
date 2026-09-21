import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { GroupRewardsSection } from "./GroupRewardsSection";
import { getActiveOuting } from "@/API/OutingAPI";
import { getGroupRewards } from "@/API/RewardAPI";
import { createRedemption, cancelRedemption, getGroupRedemptions } from "@/API/RedemptionAPI";
import type { Outing } from "@/types/outing";
import type { GroupRewardsAvailability } from "@/types/reward";
import type { Redemption, RedemptionQrResult } from "@/types/redemption";

/**
 * LB-111: cubre la pieza extraída de `GroupRewardsView.tsx` de forma
 * aislada (sin depender del wrapper de página). Los escenarios espejan
 * `GroupRewardsView.test.tsx` porque comparten la misma lógica de negocio —
 * acá se prueba que sigue funcionando montada sin la vista completa.
 */

vi.mock("motion/react", async () => {
  const { mockMotion } = await import("@/test/mocks/motion");
  return mockMotion();
});

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/API/OutingAPI", () => ({
  getActiveOuting: vi.fn(),
}));

vi.mock("@/API/RewardAPI", () => ({
  getGroupRewards: vi.fn(),
}));

vi.mock("@/API/RedemptionAPI", () => ({
  createRedemption: vi.fn(),
  cancelRedemption: vi.fn(),
  getGroupRedemptions: vi.fn(),
}));

vi.mock("@/hooks/useGroupPointsSocket", () => ({
  useGroupPointsSocket: vi.fn(),
}));

const activeOuting = {
  _id: "outing-1",
  status: "ACTIVE",
  bar: { _id: "bar-1", name: "El Boliche", slug: "el-boliche" },
} as Outing;

const rewardsResponse: GroupRewardsAvailability = {
  balance: 80,
  rewards: [
    {
      id: "reward-1",
      bar: "bar-1",
      name: "Chopp gratis",
      pointsRequired: 50,
      unlimitedStock: false,
      stock: 5,
      status: "active",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

function renderSection(canManageRedemptions = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onBack = vi.fn();
  const utils = render(
    <QueryClientProvider client={client}>
      <GroupRewardsSection
        groupId="group-1"
        canManageRedemptions={canManageRedemptions}
        onBack={onBack}
      />
    </QueryClientProvider>
  );
  return { ...utils, onBack };
}

describe("GroupRewardsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGroupRedemptions).mockResolvedValue([]);
  });

  it("shows the empty check-in state and calls onBack when there is no ACTIVE outing", async () => {
    const user = userEvent.setup();
    vi.mocked(getActiveOuting).mockResolvedValue(null);

    const { onBack } = renderSection();

    await waitFor(() =>
      expect(screen.getByText("Necesitás un check-in activo")).toBeInTheDocument()
    );
    expect(getGroupRewards).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Volver al grupo" }));
    expect(onBack).toHaveBeenCalled();
  });

  it("shows balance header and reward cards, with an enabled Canjear button when there is an ACTIVE outing", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue(rewardsResponse);

    renderSection();

    await waitFor(() => expect(screen.getByText(/Tenés/)).toBeInTheDocument());
    expect(screen.getByText(/80 pts/)).toBeInTheDocument();
    expect(screen.getByText("El Boliche", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Chopp gratis")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Canjear" })).toBeEnabled();
  });

  it("opens the confirmation modal and creates the redemption on confirm", async () => {
    const user = userEvent.setup();
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue(rewardsResponse);
    const qrResult: RedemptionQrResult = {
      id: "redemption-1",
      group: "group-1",
      outing: "outing-1",
      bar: "bar-1",
      reward: "reward-1",
      rewardName: "Chopp gratis",
      pointsRequired: 50,
      status: "HELD",
      manualCode: "123456",
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      qrData: "data:image/png;base64,xxx",
      availablePoints: 30,
    };
    vi.mocked(createRedemption).mockResolvedValue(qrResult);

    renderSection();

    await waitFor(() => expect(screen.getByText("Chopp gratis")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Canjear" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await user.click(screen.getByRole("dialog").querySelector("button:last-of-type")!);

    await waitFor(() => {
      expect(createRedemption).toHaveBeenCalledWith("group-1", "reward-1");
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Canje generado, mostrale el QR o el código al cajero"
    );
    await waitFor(() => expect(screen.getByAltText("QR de canje")).toBeInTheDocument());
  });

  it("lists HELD redemptions with a cancel button and cancels on click", async () => {
    const user = userEvent.setup();
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue(rewardsResponse);
    const heldRedemption: Redemption = {
      id: "redemption-1",
      group: "group-1",
      outing: "outing-1",
      bar: "bar-1",
      reward: "reward-1",
      rewardName: "Chopp gratis",
      pointsRequired: 50,
      status: "HELD",
      manualCode: "654321",
      expiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    };
    vi.mocked(getGroupRedemptions).mockResolvedValue([heldRedemption]);
    vi.mocked(cancelRedemption).mockResolvedValue({ ...heldRedemption, status: "CANCELLED" });

    renderSection();

    await waitFor(() => expect(screen.getByText("Canjes pendientes")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /Cancelar/ }));

    await waitFor(() => {
      expect(cancelRedemption).toHaveBeenCalledWith("group-1", "redemption-1");
    });
    expect(toast.success).toHaveBeenCalledWith("Canje cancelado");
  });

  it("does not show the Canjear button nor fetch redemptions when canManageRedemptions is false", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue(rewardsResponse);

    renderSection(false);

    await waitFor(() => expect(screen.getByText("Chopp gratis")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Canjear" })).not.toBeInTheDocument();
    expect(getGroupRedemptions).not.toHaveBeenCalled();
  });

  it("renders an ErrorState with a Reintentar button when the rewards query fails", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockRejectedValue({ type: "server", message: "boom" });

    renderSection();

    await waitFor(() =>
      expect(screen.getByText("No pudimos cargar las recompensas.")).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });
});
