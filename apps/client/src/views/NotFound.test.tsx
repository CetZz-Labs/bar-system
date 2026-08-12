import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import NotFound from './NotFound';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

const renderNotFound = (route: string) =>
  renderWithProviders(
    <Routes>
      <Route path="/" element={<div>Home Page</div>} />
      <Route path="*" element={<NotFound />} />
    </Routes>,
    { route }
  );

describe('NotFound view (LB-64)', () => {
  it('shows a clear 404 message for an unknown route', () => {
    renderNotFound('/esta-ruta-no-existe');

    expect(screen.getByText('Página no encontrada')).toBeInTheDocument();
  });

  it('navigates back to home when clicking "Volver" with no prior in-app history', async () => {
    const user = userEvent.setup();
    renderNotFound('/esta-ruta-no-existe');

    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect(await screen.findByText('Home Page')).toBeInTheDocument();
  });
});
