import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from './Select';

describe('Select', () => {
  it('associates the label with the control via htmlFor/id', () => {
    render(
      <Select label="Estado">
        <option value="a">A</option>
      </Select>,
    );
    const select = screen.getByLabelText('Estado');
    expect(select.tagName).toBe('SELECT');
  });

  it('renders options and reflects value changes', () => {
    const onChange = vi.fn();
    render(
      <Select label="Estado" value="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('applies themed classes', () => {
    render(
      <Select label="Estado">
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByLabelText('Estado').className).toContain('bg-surface-2');
  });

  it('shows an inline error and sets aria-invalid', () => {
    render(
      <Select label="Estado" error="Requerido">
        <option value="a">A</option>
      </Select>,
    );
    expect(screen.getByText('Requerido')).toBeInTheDocument();
    expect(screen.getByLabelText('Estado')).toHaveAttribute('aria-invalid', 'true');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLSelectElement | null };
    render(
      <Select ref={ref}>
        <option value="a">A</option>
      </Select>,
    );
    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});
