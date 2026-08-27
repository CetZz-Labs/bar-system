import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SegmentedControl } from './SegmentedControl';

const options = [
  { label: 'Usuario', value: 'user' },
  { label: 'Cajero', value: 'cashier' },
];

describe('SegmentedControl', () => {
  it('renders all options as radios in a radiogroup', () => {
    render(
      <SegmentedControl options={options} value="user" onChange={vi.fn()} name="rol" />,
    );
    expect(screen.getByRole('radiogroup')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('marks the active option with aria-checked', () => {
    render(
      <SegmentedControl options={options} value="cashier" onChange={vi.fn()} name="rol" />,
    );
    expect(screen.getByRole('radio', { name: 'Cajero' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Usuario' })).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with the selected value', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl options={options} value="user" onChange={onChange} name="rol" />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Cajero' }));
    expect(onChange).toHaveBeenCalledWith('cashier');
  });

  it('renders a label when provided', () => {
    render(
      <SegmentedControl options={options} value="user" onChange={vi.fn()} name="rol" label="Rol" />,
    );
    expect(screen.getByText('Rol')).toBeInTheDocument();
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl options={options} value="user" onChange={onChange} name="rol" disabled />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Cajero' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shows an inline error message', () => {
    render(
      <SegmentedControl
        options={options}
        value="user"
        onChange={vi.fn()}
        name="rol"
        error="Elegi un rol"
      />,
    );
    expect(screen.getByText('Elegi un rol')).toBeInTheDocument();
  });
});
