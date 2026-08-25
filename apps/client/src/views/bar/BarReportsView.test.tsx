import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { toast } from 'sonner';
import { renderWithProviders } from '@/test/renderWithProviders';
import BarReportsView from './BarReportsView';
import * as ReportAPI from '@/API/ReportAPI';

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/API/ReportAPI');

function blobFromString(text: string): Blob {
  return new Blob([text], { type: 'text/csv' });
}

const renderView = (route = '/bar/bar-1/reportes') =>
  renderWithProviders(
    <Routes>
      <Route path="/bar/:barId/reportes" element={<BarReportsView />} />
    </Routes>,
    { route }
  );

function fillForm() {
  const from = screen.getByLabelText('DESDE');
  const to = screen.getByLabelText('HASTA');
  fireEvent.change(from, { target: { value: '2026-08-01' } });
  fireEvent.change(to, { target: { value: '2026-08-10' } });
}

describe('BarReportsView (LB-78)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ReportAPI.downloadReport).mockResolvedValue({
      mode: 'file',
      blob: blobFromString('a,b\n1,2\n'),
      fileName: 'reporte-consumos-bar-1-2026-08-01-2026-08-10.csv',
    });
  });

  it('renders the report type, format and range selectors', () => {
    renderView();
    expect(screen.getByLabelText('TIPO DE REPORTE')).toBeInTheDocument();
    expect(screen.getByLabelText('FORMATO')).toBeInTheDocument();
    expect(screen.getByLabelText('DESDE')).toBeInTheDocument();
    expect(screen.getByLabelText('HASTA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exportar reporte/i })).toBeEnabled();
  });

  it('submits the query and triggers a download toast for short ranges (file mode)', async () => {
    const user = userEvent.setup();
    renderView();

    await user.selectOptions(screen.getByLabelText('TIPO DE REPORTE'), 'consumptions');
    await user.selectOptions(screen.getByLabelText('FORMATO'), 'csv');
    fillForm();
    await user.click(screen.getByRole('button', { name: /exportar reporte/i }));

    await waitFor(() => {
      expect(ReportAPI.downloadReport).toHaveBeenCalledWith('bar-1', {
        kind: 'consumptions',
        format: 'csv',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-10T23:59:59.999Z',
      });
    });
    expect(toast.success).toHaveBeenCalledWith('Reporte descargado');
  });

  it('shows an email toast when the range is long (202 → email mode)', async () => {
    vi.mocked(ReportAPI.downloadReport).mockResolvedValue({
      mode: 'email',
      message: 'El reporte se enviará por email',
    });

    const user = userEvent.setup();
    renderView();

    await user.selectOptions(screen.getByLabelText('TIPO DE REPORTE'), 'redemptions');
    await user.selectOptions(screen.getByLabelText('FORMATO'), 'pdf');
    fillForm();
    await user.click(screen.getByRole('button', { name: /exportar reporte/i }));

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith('El reporte se enviará por email');
    });
  });

  it('shows an error toast when the API call fails', async () => {
    vi.mocked(ReportAPI.downloadReport).mockRejectedValue({ type: 'server', message: 'No autorizado' });

    const user = userEvent.setup();
    renderView();

    fillForm();
    await user.click(screen.getByRole('button', { name: /exportar reporte/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });

  it('blocks a range longer than 3 months without calling the API', async () => {
    const user = userEvent.setup();
    renderView();

    await user.selectOptions(screen.getByLabelText('TIPO DE REPORTE'), 'consumptions');
    await user.selectOptions(screen.getByLabelText('FORMATO'), 'csv');

    const from = screen.getByLabelText('DESDE');
    const to = screen.getByLabelText('HASTA');
    fireEvent.change(from, { target: { value: '2026-01-01' } });
    fireEvent.change(to, { target: { value: '2026-08-01' } });

    await user.click(screen.getByRole('button', { name: /exportar reporte/i }));

    expect(await screen.findByText(/rango máximo permitido es de 3 meses/i)).toBeInTheDocument();
    expect(ReportAPI.downloadReport).not.toHaveBeenCalled();
  });
});
