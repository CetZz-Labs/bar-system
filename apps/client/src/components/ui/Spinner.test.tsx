import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders a status role with default aria-label', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Cargando');
  });

  it('exposes a custom label', () => {
    render(<Spinner label="Cargando bares" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Cargando bares');
  });

  it('animates with the lime accent', () => {
    render(<Spinner />);
    const el = screen.getByRole('status');
    expect(el.getAttribute('class')).toContain('animate-spin');
    expect(el.getAttribute('class')).toContain('text-lime');
  });

  it('wraps in a centering container when center is set', () => {
    const { container } = render(<Spinner center />);
    expect(container.firstElementChild?.className).toContain('items-center');
    expect(container.firstElementChild?.className).toContain('justify-center');
  });

  it('merges custom className onto the icon', () => {
    render(<Spinner className="size-10" />);
    expect(screen.getByRole('status').getAttribute('class')).toContain('size-10');
  });
});
