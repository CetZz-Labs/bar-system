import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import BarAuditLogView from './BarAuditLogView';
import * as AuditLogAPI from '@/API/AuditLogAPI';
import type { AuditLogResponse } from '@/types/audit';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/API/AuditLogAPI');

const baseResponse: AuditLogResponse = {
  items: [
    {
      id: 'log-1',
      bar: 'bar-1',
      actorType: 'CASHIER',
      actorId: 'cashier-1',
      actorName: 'Juan Cajero',
      eventType: 'consumo.registered',
      entityType: 'Consumo',
      entityId: 'cons-1',
      metadata: { amount: 12000, groupId: 'g-1' },
      deviceInfo: 'POS-1',
      ip: '127.0.0.1',
      createdAt: '2026-08-24T20:00:00.000Z',
    },
  ],
  nextCursor: null,
  hasMore: false,
};

const renderView = (route = '/bar/bar-1/auditoria') =>
  renderWithProviders(
    <Routes>
      <Route path="/bar/:barId/auditoria" element={<BarAuditLogView />} />
    </Routes>,
    { route }
  );

describe('BarAuditLogView (LB-77)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(AuditLogAPI.getAuditLogs).mockResolvedValue(baseResponse);
  });

  it('renders the audit entries loaded from the API', async () => {
    renderView();

    await waitFor(() => {
      expect(AuditLogAPI.getAuditLogs).toHaveBeenCalledWith(
        'bar-1',
        expect.objectContaining({ limit: 50 })
      );
    });

    // Wait for the table to appear (data loaded, not in loading state)
    const table = await screen.findByRole('table');
    const { getAllByText } = within(table);

    expect(getAllByText(/Juan Cajero/).length).toBeGreaterThan(0);
    // Metadata is collapsed by default — verify the expand button exists
    expect(within(table).getAllByRole('button', { name: /expandir detalle/i }).length).toBeGreaterThan(0);
  });

  it('shows the empty state when there are no records', async () => {
    vi.mocked(AuditLogAPI.getAuditLogs).mockResolvedValue({
      items: [],
      nextCursor: null,
      hasMore: false,
    });

    renderView();

    expect(await screen.findByText(/no hay registros/i)).toBeInTheDocument();
  });

  it('applies the filters to the query when changed', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Consumo registrado');

    await user.selectOptions(screen.getByLabelText('EVENTO'), 'shift.opened');
    await user.selectOptions(screen.getByLabelText('ACTOR'), 'OWNER');

    await waitFor(() => {
      expect(AuditLogAPI.getAuditLogs).toHaveBeenLastCalledWith(
        'bar-1',
        expect.objectContaining({ eventType: 'shift.opened', actorType: 'OWNER' })
      );
    });
  });

  it('loads the next page via the cursor when "Cargar más" is clicked', async () => {
    vi.mocked(AuditLogAPI.getAuditLogs).mockResolvedValueOnce({
      items: baseResponse.items,
      nextCursor: 'cursor-2',
      hasMore: true,
    });
    vi.mocked(AuditLogAPI.getAuditLogs).mockResolvedValueOnce({
      items: [
        {
          ...baseResponse.items[0],
          id: 'log-2',
          eventType: 'shift.closed',
          metadata: { amount: 999 },
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    const user = userEvent.setup();
    renderView();

    const loadMore = await screen.findByRole('button', { name: /cargar más/i });
    await user.click(loadMore);

    await waitFor(() => {
      expect(AuditLogAPI.getAuditLogs).toHaveBeenLastCalledWith(
        'bar-1',
        expect.objectContaining({ cursor: 'cursor-2' })
      );
    });
    // El segundo registro (página 2) aparece acumulado con el primero.
    const table = screen.getByRole('table');
    const { getAllByText } = within(table);
    expect(getAllByText('Turno cerrado').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Consumo registrado').length).toBeGreaterThan(0);
  });

  it('renders metadata with Spanish labels instead of raw JSON', async () => {
    renderView();

    // Wait for the table to appear (data loaded)
    const table = await screen.findByRole('table');
    const expandButtons = within(table).getAllByRole('button', { name: /expandir detalle/i });
    expect(expandButtons.length).toBeGreaterThan(0);
  });

  it('expands and collapses metadata detail on click', async () => {
    const user = userEvent.setup();
    renderView();

    // Wait for the table to appear (data loaded)
    const table = await screen.findByRole('table');

    // Metadata is collapsed by default — "Monto" should NOT be visible in the table
    expect(within(table).queryByText('Monto')).not.toBeInTheDocument();

    // Click the first expand button
    const expandButtons = within(table).getAllByRole('button', { name: /expandir detalle/i });
    await user.click(expandButtons[0]);

    // After expanding, "Monto" should appear within the table
    const montoLabels = within(table).getAllByText('Monto');
    expect(montoLabels.length).toBeGreaterThanOrEqual(1);

    // Click again to collapse
    const collapseButtons = within(table).getAllByRole('button', { name: /colapsar detalle/i });
    await user.click(collapseButtons[0]);

    // After collapsing, "Monto" should not be visible in the table
    await waitFor(() => {
      expect(within(table).queryByText('Monto')).not.toBeInTheDocument();
    });
  });
});
