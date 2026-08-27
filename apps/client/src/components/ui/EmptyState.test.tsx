import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Inbox } from 'lucide-react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState icon={Inbox} title="Todavia no hay grupos" description="Crea uno para empezar." />);
    expect(screen.getByText('Todavia no hay grupos')).toBeInTheDocument();
    expect(screen.getByText('Crea uno para empezar.')).toBeInTheDocument();
  });

  it('omits description when not provided', () => {
    render(<EmptyState icon={Inbox} title="Vacio" />);
    expect(screen.getByText('Vacio')).toBeInTheDocument();
  });

  it('renders the action slot', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Vacio"
        action={<button type="button">Crear grupo</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Crear grupo' })).toBeInTheDocument();
  });

  it('merges custom className on the wrapper', () => {
    const { container } = render(<EmptyState icon={Inbox} title="Vacio" className="mt-8" />);
    expect(container.firstElementChild?.className).toContain('mt-8');
  });
});
