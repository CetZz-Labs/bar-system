import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route } from 'react-router';
import { renderWithProviders } from '@/test/renderWithProviders';
import ActivateCashierAccountView from './ActivateCashierAccountView';

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

vi.mock('@/API/AuthAPI', () => ({
  activateCashierAccount: vi.fn(),
}));

import { activateCashierAccount } from '@/API/AuthAPI';

const renderActivateCashierAccount = () =>
  renderWithProviders(
    <Routes>
      <Route path="/activate-cashier-account" element={<ActivateCashierAccountView />} />
      <Route path="/login" element={<div>Login Page</div>} />
    </Routes>,
    { route: '/activate-cashier-account' }
  );

describe('ActivateCashierAccountView (LB-115)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(activateCashierAccount).mockResolvedValue('Cuenta activada, ya podés iniciar sesión');
  });

  it('submits the token and password, then navigates to /login on success', async () => {
    const user = userEvent.setup();
    renderActivateCashierAccount();

    await user.type(screen.getByLabelText('CÓDIGO DE 6 DÍGITOS'), '123456');
    await user.type(screen.getByLabelText('CONTRASEÑA'), 'newPassword123');
    await user.type(screen.getByLabelText('REPETIR CONTRASEÑA'), 'newPassword123');

    await user.click(screen.getByRole('button', { name: /activar cuenta/i }));

    await waitFor(() => {
      expect(activateCashierAccount).toHaveBeenCalled();
    });
    // react-query v5 invoca mutationFn con (variables, context) — solo nos
    // interesa el primer argumento (el payload que arma el formulario).
    expect(vi.mocked(activateCashierAccount).mock.calls[0][0]).toEqual({
      token: '123456',
      password: 'newPassword123',
      confirmPassword: 'newPassword123',
    });

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
  });

  it('blocks submission and shows a validation error when the passwords do not match', async () => {
    const user = userEvent.setup();
    renderActivateCashierAccount();

    await user.type(screen.getByLabelText('CÓDIGO DE 6 DÍGITOS'), '123456');
    await user.type(screen.getByLabelText('CONTRASEÑA'), 'newPassword123');
    await user.type(screen.getByLabelText('REPETIR CONTRASEÑA'), 'somethingElse123');

    await user.click(screen.getByRole('button', { name: /activar cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText('Las contraseñas no coinciden')).toBeInTheDocument();
    });

    expect(activateCashierAccount).not.toHaveBeenCalled();
  });

  it('blocks submission and shows a validation error when the token is not 6 digits', async () => {
    const user = userEvent.setup();
    renderActivateCashierAccount();

    await user.type(screen.getByLabelText('CÓDIGO DE 6 DÍGITOS'), '123');
    await user.type(screen.getByLabelText('CONTRASEÑA'), 'newPassword123');
    await user.type(screen.getByLabelText('REPETIR CONTRASEÑA'), 'newPassword123');

    await user.click(screen.getByRole('button', { name: /activar cuenta/i }));

    await waitFor(() => {
      expect(screen.getByText('El código debe tener 6 dígitos')).toBeInTheDocument();
    });

    expect(activateCashierAccount).not.toHaveBeenCalled();
  });
});
