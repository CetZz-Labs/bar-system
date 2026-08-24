import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import BarProfileView from './BarProfileView';
import * as BarAPI from '@/API/BarAPI';
import type { Bar } from '@/types/bar';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock('@/API/BarAPI');

const mockBar: Bar = {
  id: 'bar-1',
  name: 'El Bar de Juan',
  slug: 'el-bar-de-juan',
  address: { street: 'Calle Falsa', number: '123', city: 'CABA' },
  phone: '+54 11 1234-5678',
  schedule: [{ day: 1, open: '20:00', close: '03:00' }],
  description: 'Un bar con buena onda',
  status: 'active',
  logoUrl: undefined,
  coverUrl: undefined,
  closingTime: '06:00',
  attendancePointsByDay: {
    monday: 0,
    tuesday: 0,
    wednesday: 0,
    thursday: 0,
    friday: 100,
    saturday: 150,
    sunday: 0,
  },
};

const renderBarProfile = () =>
  renderWithProviders(
    <Routes>
      <Route path="/bar/:id/perfil" element={<BarProfileView />} />
    </Routes>,
    { route: '/bar/bar-1/perfil' }
  );

describe('BarProfileView — attendance points section (LB-59)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(BarAPI.getBarProfile).mockResolvedValue(mockBar);
    vi.mocked(BarAPI.updateBarProfile).mockResolvedValue({ message: 'ok' });
  });

  it('renders the 7 weekday inputs pre-filled with the bar current config', async () => {
    renderBarProfile();

    await waitFor(() => {
      expect(screen.getByText('Puntos por asistencia')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('LUNES')).toHaveValue(0);
    expect(screen.getByLabelText('VIERNES')).toHaveValue(100);
    expect(screen.getByLabelText('SÁBADO')).toHaveValue(150);
    expect(screen.getByLabelText('DOMINGO')).toHaveValue(0);
  });

  it('submits the updated attendancePointsByDay alongside the unchanged profile fields', async () => {
    const user = userEvent.setup();
    renderBarProfile();

    await waitFor(() => {
      expect(screen.getByText('Puntos por asistencia')).toBeInTheDocument();
    });

    const fridayInput = screen.getByLabelText('VIERNES');
    await user.clear(fridayInput);
    await user.type(fridayInput, '250');

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(BarAPI.updateBarProfile).toHaveBeenCalledTimes(1);
    });

    const [idArg, payload] = vi.mocked(BarAPI.updateBarProfile).mock.calls[0];
    expect(idArg).toBe('bar-1');
    expect(payload.attendancePointsByDay).toEqual({
      monday: 0,
      tuesday: 0,
      wednesday: 0,
      thursday: 0,
      friday: 250,
      saturday: 150,
      sunday: 0,
    });
    expect(payload.name).toBe(mockBar.name);
    expect(payload.phone).toBe(mockBar.phone);
  });

  it('shows a validation error and blocks submission when a day exceeds 1000 points', async () => {
    const user = userEvent.setup();
    renderBarProfile();

    await waitFor(() => {
      expect(screen.getByText('Puntos por asistencia')).toBeInTheDocument();
    });

    const saturdayInput = screen.getByLabelText('SÁBADO');
    await user.clear(saturdayInput);
    await user.type(saturdayInput, '1500');

    await user.click(screen.getByRole('button', { name: /guardar cambios/i }));

    await waitFor(() => {
      expect(screen.getByText('Máximo 1000')).toBeInTheDocument();
    });

    expect(BarAPI.updateBarProfile).not.toHaveBeenCalled();
  });
});
