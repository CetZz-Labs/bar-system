import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders a label when provided', () => {
    render(<Input label="Email" />);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders an input element and forwards typing', () => {
    const onChange = vi.fn();
    render(<Input placeholder="tu@email.com" onChange={onChange} />);
    const input = screen.getByPlaceholderText('tu@email.com');
    fireEvent.change(input, { target: { value: 'a@b.com' } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('shows an inline error message', () => {
    render(<Input label="Email" error="Email invalido" />);
    expect(screen.getByText('Email invalido')).toBeInTheDocument();
  });

  it('applies error border class when error is present', () => {
    render(<Input placeholder="x" error="mal" />);
    expect(screen.getByPlaceholderText('x').className).toContain('border-error');
  });

  it('renders left icon with padding and right icon', () => {
    render(
      <Input
        placeholder="x"
        icon={<svg data-testid="left" />}
        rightIcon={<svg data-testid="right" />}
      />,
    );
    expect(screen.getByTestId('left')).toBeInTheDocument();
    expect(screen.getByTestId('right')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('x').className).toContain('pl-12');
  });

  it('forwards ref to the input element', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('passes through additional props', () => {
    render(<Input placeholder="x" disabled />);
    expect(screen.getByPlaceholderText('x')).toBeDisabled();
  });

  it('has correct displayName', () => {
    expect(Input.displayName).toBe('Input');
  });
});
