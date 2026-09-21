import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import GroupOutingView from "./GroupOutingView";
import { getGroupBySlug } from "@/API/GroupAPI";
import { getActiveOuting } from "@/API/OutingAPI";
import { getGroupBalance, getGroupHistory } from "@/API/PointsAPI";
import { getGroupRewards } from "@/API/RewardAPI";
import { getGroupRedemptions } from "@/API/RedemptionAPI";
import type { GroupDetail } from "@/types/group";
import type { Outing } from "@/types/outing";
import type { GroupHistoryPage } from "@/types/points";

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

vi.mock("@/API/PointsAPI", () => ({
  getGroupBalance: vi.fn(),
  getGroupHistory: vi.fn(),
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

const emptyHistory: GroupHistoryPage = { items: [], nextCursor: null };

function buildOuting(overrides: Partial<Outing> = {}): Outing {
  return {
    _id: "outing-1",
    group: "group-1",
    bar: { _id: "bar-1", name: "El Boliche", slug: "el-boliche" },
    createdBy: { _id: "u1", name: "Juan", lastName: "Pérez" },
    scheduledFor: new Date().toISOString(),
    status: "PENDING",
    invitees: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function renderView() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={["/groups/los-pibes/salida"]}>
        <Routes>
          <Route path="/groups/:slug/salida" element={<GroupOutingView />} />
          <Route path="/groups/:slug/home" element={<div>Home del grupo</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("GroupOutingView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGroupBySlug).mockResolvedValue(baseGroup);
    vi.mocked(getGroupBalance).mockResolvedValue({ total: 120, byBar: [], updatedAt: null });
    vi.mocked(getGroupRedemptions).mockResolvedValue([]);
    vi.mocked(getGroupHistory).mockResolvedValue(emptyHistory);
  });

  it("shows the group's total balance", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(null);

    renderView();

    await waitFor(() => expect(screen.getByText("120")).toBeInTheDocument());
    expect(screen.getByText("Saldo del grupo")).toBeInTheDocument();
  });

  it("shows the empty outing state with a Crear salida CTA when there is no active/pending outing", async () => {
    vi.mocked(getActiveOuting).mockResolvedValue(null);

    renderView();

    await waitFor(() =>
      expect(screen.getByText("Todavía no hay una salida")).toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: /Crear salida/ })).toBeInTheDocument();
    expect(getGroupRewards).not.toHaveBeenCalled();
  });

  it("shows the outing details and an 'En curso' badge when the outing is ACTIVE", async () => {
    const activeOuting = buildOuting({ status: "ACTIVE", invitees: ["a", "b"] });
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue({ balance: 30, rewards: [] });

    renderView();

    await waitFor(() => expect(screen.getByText("El Boliche")).toBeInTheDocument());
    expect(screen.getByText("En curso")).toBeInTheDocument();
    expect(screen.getByText("2 invitados")).toBeInTheDocument();
  });

  it("requests the movements history filtered by the active outing's id", async () => {
    const activeOuting = buildOuting({ status: "ACTIVE" });
    vi.mocked(getActiveOuting).mockResolvedValue(activeOuting);
    vi.mocked(getGroupRewards).mockResolvedValue({ balance: 30, rewards: [] });
    vi.mocked(getGroupHistory).mockResolvedValue({
      items: [
        {
          id: "tx-1",
          groupId: "group-1",
          barId: "bar-1",
          barName: "El Boliche",
          outingId: "outing-1",
          type: "asistencia",
          points: 10,
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: null,
    });

    renderView();

    await waitFor(() =>
      expect(getGroupHistory).toHaveBeenCalledWith("group-1", null, 20, "outing-1")
    );
    expect(await screen.findByText("asistencia", { exact: false })).toBeInTheDocument();
  });

  it("mounts the rewards section gated on the active outing's check-in status", async () => {
    const pendingOuting = buildOuting({ status: "PENDING" });
    vi.mocked(getActiveOuting).mockResolvedValue(pendingOuting);

    renderView();

    await waitFor(() =>
      expect(screen.getByText("Necesitás un check-in activo")).toBeInTheDocument()
    );
    expect(getGroupRewards).not.toHaveBeenCalled();
  });

  it("navigates back to the group home from the header back button", async () => {
    const user = userEvent.setup();
    vi.mocked(getActiveOuting).mockResolvedValue(null);

    renderView();

    await waitFor(() => expect(screen.getByText("Salida")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.getByText("Home del grupo")).toBeInTheDocument());
  });
});
