import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from './ErrorState';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('../../test/mocks/motion');
  return mockMotion();
});

describe('ErrorState', () => {
  it('renders a default title inside an alert region', () => {
    render(<ErrorState />);
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText('No pudimos cargar la informacion.')).toBeInTheDocument();
  });

  it('renders a custom title and description', () => {
    render(<ErrorState title="No pudimos cargar los grupos." description="Reintenta en un momento." />);
    expect(screen.getByText('No pudimos cargar los grupos.')).toBeInTheDocument();
    expect(screen.getByText('Reintenta en un momento.')).toBeInTheDocument();
  });

  it('shows the retry button only when onRetry is provided', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState />);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    rerender(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('shows the back button and calls onBack', () => {
    const onBack = vi.fn();
    render(<ErrorState onBack={onBack} backLabel="Volver" />);
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('has no entry animation classes (instant render)', () => {
    render(<ErrorState />);
    expect(screen.getByRole('alert').className).not.toContain('animate-');
  });
});
