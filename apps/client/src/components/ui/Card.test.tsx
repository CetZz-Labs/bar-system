import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from './Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Contenido</Card>);
    expect(screen.getByText('Contenido')).toBeInTheDocument();
  });

  it('applies unified radius and surface tokens', () => {
    render(<Card data-testid="card">x</Card>);
    const card = screen.getByTestId('card');
    expect(card.className).toContain('rounded-xl');
    expect(card.className).toContain('bg-surface-2');
    expect(card.className).toContain('border-border');
  });

  it('applies medium padding by default and lg when requested', () => {
    const { rerender } = render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).toContain('p-4');
    rerender(<Card data-testid="card" padding="lg">x</Card>);
    expect(screen.getByTestId('card').className).toContain('p-5');
    rerender(<Card data-testid="card" padding="none">x</Card>);
    expect(screen.getByTestId('card').className).not.toContain('p-4');
  });

  it('adds hover border only when interactive', () => {
    const { rerender } = render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId('card').className).not.toContain('hover:border-border-hover');
    rerender(<Card data-testid="card" interactive>x</Card>);
    expect(screen.getByTestId('card').className).toContain('hover:border-border-hover');
  });

  it('merges custom className', () => {
    render(<Card data-testid="card" className="mt-4">x</Card>);
    expect(screen.getByTestId('card').className).toContain('mt-4');
  });

  it('forwards ref and DOM props', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Card ref={ref} onClick={vi.fn()}>x</Card>);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('handles click when used as interactive container', () => {
    const onClick = vi.fn();
    render(<Card data-testid="card" onClick={onClick}>x</Card>);
    fireEvent.click(screen.getByTestId('card'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
