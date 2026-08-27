import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Textarea } from './Textarea';

describe('Textarea', () => {
  it('associates the label with the control', () => {
    render(<Textarea label="Motivo" />);
    expect(screen.getByLabelText('Motivo').tagName).toBe('TEXTAREA');
  });

  it('forwards typing to onChange', () => {
    const onChange = vi.fn();
    render(<Textarea label="Motivo" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'hola' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('applies themed classes and disables resize', () => {
    render(<Textarea label="Motivo" />);
    const el = screen.getByLabelText('Motivo');
    expect(el.className).toContain('bg-surface-2');
    expect(el.className).toContain('resize-none');
  });

  it('shows an inline error and sets aria-invalid', () => {
    render(<Textarea label="Motivo" error="Requerido" />);
    expect(screen.getByText('Requerido')).toBeInTheDocument();
    expect(screen.getByLabelText('Motivo')).toHaveAttribute('aria-invalid', 'true');
  });

  it('defaults rows to 3 and honors an override', () => {
    const { rerender } = render(<Textarea label="Motivo" />);
    expect(screen.getByLabelText('Motivo')).toHaveAttribute('rows', '3');
    rerender(<Textarea label="Motivo" rows={6} />);
    expect(screen.getByLabelText('Motivo')).toHaveAttribute('rows', '6');
  });

  it('forwards ref', () => {
    const ref = { current: null as HTMLTextAreaElement | null };
    render(<Textarea ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });
});
