import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import OutingFormModal from './OutingFormModal';
import * as OutingAPI from '@/API/OutingAPI';
import * as BarAPI from '@/API/BarAPI';
import type { GroupMember } from '@/types/group';
import type { ActiveBar } from '@/types/bar';
import { isoToDatetimeLocal } from '@/types/outing';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('@/test/mocks/motion');
  return mockMotion();
});

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/API/OutingAPI');
vi.mock('@/API/BarAPI');

const mockMembers: GroupMember[] = [
  { id: 'u1', name: 'Juan Pérez', avatarUrl: null, role: 'LEADER' },
  { id: 'u2', name: 'Ana García', avatarUrl: null, role: 'MEMBER' },
];

const mockBars: ActiveBar[] = [
  {
    id: 'bar-1',
    name: 'Bar Uno',
    slug: 'bar-uno',
    address: { street: 'Calle Falsa', number: '123', city: 'CABA' },
    schedule: [],
  },
];

const validDatetime = () =>
  isoToDatetimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());

const outOfRangeDatetime = () =>
  isoToDatetimeLocal(new Date(Date.now() + 40 * 24 * 60 * 60 * 1000).toISOString());

describe('OutingFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(BarAPI.getActiveBars).mockResolvedValue(mockBars);
  });

  const renderModal = (props: Partial<React.ComponentProps<typeof OutingFormModal>> = {}) =>
    renderWithProviders(
      <OutingFormModal
        isOpen
        onClose={vi.fn()}
        groupId="group-1"
        members={mockMembers}
        outing={null}
        {...props}
      />
    );

  it('shows a validation error when the note exceeds 200 characters', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Bar Uno')).toBeInTheDocument();
    });

    const textarea = screen.getByLabelText(/NOTA/i);
    fireEvent.change(textarea, { target: { value: 'a'.repeat(201) } });
    fireEvent.blur(textarea);

    await waitFor(() => {
      expect(screen.getByText('Máximo 200 caracteres')).toBeInTheDocument();
    });
  });

  it('shows a validation error when the date is more than 30 days in the future', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Bar Uno')).toBeInTheDocument();
    });

    const dateInput = screen.getByLabelText(/FECHA Y HORA/i);
    fireEvent.change(dateInput, { target: { value: outOfRangeDatetime() } });
    fireEvent.blur(dateInput);

    await waitFor(() => {
      expect(
        screen.getByText('La fecha no puede superar los 30 días desde hoy')
      ).toBeInTheDocument();
    });
  });

  it('submits the create mutation with the correct payload', async () => {
    const user = userEvent.setup();
    vi.mocked(OutingAPI.createOuting).mockResolvedValue({
      _id: 'outing-1',
      group: 'group-1',
      bar: { _id: 'bar-1', name: 'Bar Uno', slug: 'bar-uno' },
      createdBy: { _id: 'u1', name: 'Juan', lastName: 'Pérez' },
      scheduledFor: new Date().toISOString(),
      status: 'PENDING',
      invitees: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Bar Uno')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/^BAR$/i), 'bar-1');

    const dateInput = screen.getByLabelText(/FECHA Y HORA/i);
    fireEvent.change(dateInput, { target: { value: validDatetime() } });

    const textarea = screen.getByLabelText(/NOTA/i);
    await user.type(textarea, 'Vamos todos');

    await user.click(screen.getByRole('button', { name: /crear salida/i }));

    await waitFor(() => {
      expect(OutingAPI.createOuting).toHaveBeenCalledTimes(1);
    });

    const [groupIdArg, payload] = vi.mocked(OutingAPI.createOuting).mock.calls[0];
    expect(groupIdArg).toBe('group-1');
    expect(payload.barId).toBe('bar-1');
    expect(payload.note).toBe('Vamos todos');
    expect(payload.inviteeIds).toEqual(['u1', 'u2']);
    expect(typeof payload.scheduledFor).toBe('string');
    expect(() => new Date(payload.scheduledFor as string).toISOString()).not.toThrow();
  });

  it('shows a clear message when the backend responds with 409 (existing active outing)', async () => {
    const user = userEvent.setup();
    vi.mocked(OutingAPI.createOuting).mockRejectedValue({
      type: 'server',
      message: 'El grupo ya tiene una salida activa.',
      status: 409,
      existingOutingId: 'existing-outing-id',
    });

    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Bar Uno')).toBeInTheDocument();
    });

    await user.selectOptions(screen.getByLabelText(/^BAR$/i), 'bar-1');
    fireEvent.change(screen.getByLabelText(/FECHA Y HORA/i), {
      target: { value: validDatetime() },
    });

    await user.click(screen.getByRole('button', { name: /crear salida/i }));

    await waitFor(() => {
      expect(
        screen.getByText('Este grupo ya tiene una salida activa. Cerrá este formulario para verla.')
      ).toBeInTheDocument();
    });

    expect(screen.getByRole('button', { name: /ver salida activa/i })).toBeInTheDocument();
  });

  it('renders the leader checkbox as disabled and always checked', async () => {
    renderModal();

    await waitFor(() => {
      expect(screen.getByText('Bar Uno')).toBeInTheDocument();
    });

    const leaderCheckbox = screen.getByLabelText('Invitar a Juan Pérez') as HTMLInputElement;
    expect(leaderCheckbox.checked).toBe(true);
    expect(leaderCheckbox.disabled).toBe(true);
  });
});
