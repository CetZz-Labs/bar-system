import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import GroupRewardsView from "./GroupRewardsView";
import { getGroupBySlug } from "@/API/GroupAPI";
import { getActiveOuting } from "@/API/OutingAPI";
import { getGroupRewards } from "@/API/RewardAPI";
import { createRedemption, cancelRedemption, getGroupRedemptions } from "@/API/RedemptionAPI";
import type { GroupDetail } from "@/types/group";
import type { Outing } from "@/types/outing";
import type { GroupRewardsAvailability } from "@/types/reward";
import type { Redemption, RedemptionQrResult } from "@/types/redemption";

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

vi.mock("@/API/GroupAPI", () => ({
  getGroupBySlug: vi.fn(),
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

const baseGroup: GroupDetail = {
  id: "group-1",
  name: "Los Pibes",
  slug: "los-pibes",
  type: "OPEN",
  description: "",
  avatarUrl: "",
  memberCount: 3,
  members: [],
  canManage: true,
  currentUserRole: "LEADER",
};

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

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/groups/los-pibes/recompensas"]}>
        <Routes>
          <Route path="/groups/:slug/recompensas" element={<GroupRewardsView />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("GroupRewardsView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGroupBySlug).mockResolvedValue(baseGroup);
    vi.mocked(getGroupRedemptions).mockResolvedValue([]);
  });

  it("shows the empty check-in state when there is no ACTIVE outing", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(null);

    renderView();

    await waitFor(() =>
      expect(screen.getByText("Necesitás un check-in activo")).toBeInTheDocument()
    );
    expect(
      screen.getByText(
        "Hacé check-in en un bar con tu grupo para ver y canjear sus recompensas."
      )
    ).toBeInTheDocument();
    expect(getGroupRewards).not.toHaveBeenCalled();
  });

  it("shows the empty check-in state when the outing is PENDING (not checked in yet)", async () => {
    const pendingOuting = {
      _id: "outing-1",
      status: "PENDING",
      bar: { _id: "bar-1", name: "El Boliche", slug: "el-boliche" },
    } as Outing;
    vi.mocked(getActiveOuting).mockResolvedValue(pendingOuting);

    renderView();

    await waitFor(() =>
      expect(screen.getByText("Necesitás un check-in activo")).toBeInTheDocument()
    );
    expect(getGroupRewards).not.toHaveBeenCalled();
  });

  it("shows balance header and reward cards, with an enabled Canjear button when there is an ACTIVE outing", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue(rewardsResponse);

    renderView();

    await waitFor(() =>
      expect(screen.getByText(/Tenés/)).toBeInTheDocument()
    );
    expect(screen.getByText(/80 pts/)).toBeInTheDocument();
    expect(screen.getByText("El Boliche", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Chopp gratis")).toBeInTheDocument();
    expect(screen.getByText("Podés canjear")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Canjear" })).toBeEnabled();
  });

  it("opens the confirmation modal with the expected text and creates the redemption on confirm", async () => {
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

    renderView();

    await waitFor(() => expect(screen.getByText("Chopp gratis")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Canjear" }));

    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    expect(
      screen.getByText("Vas a canjear Chopp gratis por 50 pts, quedan 30 pts")
    ).toBeInTheDocument();

    await user.click(screen.getByRole("dialog").querySelector("button:last-of-type")!);

    await waitFor(() => {
      expect(createRedemption).toHaveBeenCalledWith("group-1", "reward-1");
    });
    expect(toast.success).toHaveBeenCalledWith(
      "Canje generado, mostrale el QR o el código al cajero"
    );
    await waitFor(() => expect(screen.getByAltText("QR de canje")).toBeInTheDocument());
    expect(screen.getByText("123456")).toBeInTheDocument();
  });

  it("shows an error toast when the redemption fails", async () => {
    const user = userEvent.setup();
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue(rewardsResponse);
    vi.mocked(createRedemption).mockRejectedValue({
      type: "server",
      message: "No tenés suficientes puntos disponibles en este bar",
      status: 409,
    });

    renderView();

    await waitFor(() => expect(screen.getByText("Chopp gratis")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Canjear" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await user.click(screen.getByRole("dialog").querySelector("button:last-of-type")!);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
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

    renderView();

    await waitFor(() => expect(screen.getByText("Canjes pendientes")).toBeInTheDocument());
    expect(screen.getByText("Código 654321", { exact: false })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Cancelar/ }));

    await waitFor(() => {
      expect(cancelRedemption).toHaveBeenCalledWith("group-1", "redemption-1");
    });
    expect(toast.success).toHaveBeenCalledWith("Canje cancelado");
  });

  it("does not show the Canjear button nor the pending redemptions list for a MEMBER", async () => {
    vi.mocked(getGroupBySlug).mockResolvedValue({ ...baseGroup, currentUserRole: "MEMBER" });
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue(rewardsResponse);

    renderView();

    await waitFor(() => expect(screen.getByText("Chopp gratis")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Canjear" })).not.toBeInTheDocument();
    expect(getGroupRedemptions).not.toHaveBeenCalled();
  });

  it("renders an EmptyState when the bar has no rewards", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue({ balance: 10, rewards: [] });

    renderView();

    await waitFor(() =>
      expect(
        screen.getByText("Todavía no hay recompensas en este bar.")
      ).toBeInTheDocument()
    );
  });

  it("renders an ErrorState with a Reintentar button when the rewards query fails", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockRejectedValue({ type: "server", message: "boom" });

    renderView();

    await waitFor(() =>
      expect(
        screen.getByText("No pudimos cargar las recompensas.")
      ).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
  });

  it("shows REJECTED and EXPIRED redemptions with catalog copy", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue(rewardsResponse);
    const base = {
      group: "group-1",
      outing: "outing-1",
      bar: "bar-1",
      reward: "reward-1",
      rewardName: "Chopp gratis",
      pointsRequired: 50,
      createdAt: new Date().toISOString(),
    };
    const rejected: Redemption = {
      ...base,
      id: "r-rej",
      status: "REJECTED",
      manualCode: "111111",
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    };
    const expired: Redemption = {
      ...base,
      id: "r-exp",
      status: "EXPIRED",
      manualCode: "222222",
      expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
    };
    vi.mocked(getGroupRedemptions).mockResolvedValue([rejected, expired]);

    renderView();

    await waitFor(() =>
      expect(screen.getByText("Canjes recientes")).toBeInTheDocument()
    );
    expect(screen.getByText("Este canje fue rechazado.")).toBeInTheDocument();
    expect(
      screen.getByText("Este QR venció. Generá uno nuevo.")
    ).toBeInTheDocument();
  });

  it("keeps an accessible name on the Canjear button while the redemption is pending", async () => {
    const user = userEvent.setup();
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue(rewardsResponse);
    // Promesa que nunca resuelve: deja la mutación en isPending.
    vi.mocked(createRedemption).mockReturnValue(new Promise(() => {}));

    renderView();

    await waitFor(() => expect(screen.getByText("Chopp gratis")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Canjear" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeInTheDocument());
    await user.click(screen.getByRole("dialog").querySelector("button:last-of-type")!);

    // El botón de la card conserva un nombre accesible ("Canjeando") en vez
    // de quedar solo con el spinner.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Canjeando" })).toBeInTheDocument()
    );
  });
});
