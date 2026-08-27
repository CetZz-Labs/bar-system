import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { IconButton } from './IconButton';

vi.mock('motion/react', async () => {
  const { mockMotion } = await import('../../test/mocks/motion');
  return mockMotion();
});

describe('IconButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with an accessible name from aria-label', () => {
    render(<IconButton aria-label="Volver"><svg /></IconButton>);
    expect(screen.getByRole('button', { name: 'Volver' })).toBeInTheDocument();
  });

  it('defaults to type=button', () => {
    render(<IconButton aria-label="Volver"><svg /></IconButton>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('is circular and applies surface variant by default', () => {
    render(<IconButton aria-label="Volver"><svg /></IconButton>);
    const btn = screen.getByRole('button');
    expect(btn.className).toContain('rounded-full');
    expect(btn.className).toContain('bg-surface-2');
    expect(btn.className).toContain('w-10');
  });

  it('applies sm size and ghost/outline variants', () => {
    const { rerender } = render(<IconButton aria-label="x" size="sm"><svg /></IconButton>);
    expect(screen.getByRole('button').className).toContain('w-9');
    rerender(<IconButton aria-label="x" variant="ghost"><svg /></IconButton>);
    expect(screen.getByRole('button').className).toContain('bg-transparent');
    rerender(<IconButton aria-label="x" variant="outline"><svg /></IconButton>);
    expect(screen.getByRole('button').className).toContain('border-border');
  });

  it('calls onClick', () => {
    const onClick = vi.fn();
    render(<IconButton aria-label="Volver" onClick={onClick}><svg /></IconButton>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('forwards ref and respects disabled', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<IconButton aria-label="Volver" ref={ref} disabled><svg /></IconButton>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('merges custom className', () => {
    render(<IconButton aria-label="Volver" className="absolute"><svg /></IconButton>);
    expect(screen.getByRole('button').className).toContain('absolute');
  });
});
