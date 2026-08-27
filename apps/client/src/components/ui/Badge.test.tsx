import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';
import { statusBadgeVariant } from './badgeStatus';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Activo</Badge>);
    expect(screen.getByText('Activo')).toBeInTheDocument();
  });

  it('defaults to neutral variant', () => {
    render(<Badge data-testid="b">x</Badge>);
    expect(screen.getByTestId('b').className).toContain('text-text-secondary');
  });

  it('applies variant token classes', () => {
    const cases = [
      ['success', 'text-lime'],
      ['warning', 'text-warning'],
      ['error', 'text-error'],
      ['neutral', 'text-text-secondary'],
    ] as const;
    cases.forEach(([variant, cls]) => {
      const { unmount } = render(<Badge data-testid="b" variant={variant}>x</Badge>);
      expect(screen.getByTestId('b').className).toContain(cls);
      unmount();
    });
  });

  it('renders an icon slot', () => {
    render(<Badge icon={<svg data-testid="icon" />}>x</Badge>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('merges custom className', () => {
    render(<Badge data-testid="b" className="ml-2">x</Badge>);
    expect(screen.getByTestId('b').className).toContain('ml-2');
  });
});

describe('statusBadgeVariant', () => {
  it('maps active-like statuses to success', () => {
    ['active', 'activo', 'activa', 'en_curso', 'aprobado'].forEach((s) =>
      expect(statusBadgeVariant(s)).toBe('success'),
    );
  });

  it('maps pending-like statuses to warning', () => {
    ['pending', 'pendiente', 'reservada'].forEach((s) =>
      expect(statusBadgeVariant(s)).toBe('warning'),
    );
  });

  it('maps rejected / dispute statuses to error', () => {
    ['rejected', 'rechazado', 'disputa', 'cancelada'].forEach((s) =>
      expect(statusBadgeVariant(s)).toBe('error'),
    );
  });

  it('maps finished / inactive statuses to neutral', () => {
    ['finalizada', 'inactiva', 'cerrada'].forEach((s) =>
      expect(statusBadgeVariant(s)).toBe('neutral'),
    );
  });

  it('is case-insensitive and falls back to neutral for unknown', () => {
    expect(statusBadgeVariant('ACTIVE')).toBe('success');
    expect(statusBadgeVariant('quien-sabe')).toBe('neutral');
  });
});
