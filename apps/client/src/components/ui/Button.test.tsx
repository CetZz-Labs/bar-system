import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

// Mock motion/react — import inside factory to avoid hoisting issues
vi.mock('motion/react', async () => {
  const { mockMotion } = await import('../../test/mocks/motion');
  return mockMotion();
});

describe('Button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('applies primary variant by default', () => {
    render(<Button>Primary</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-lime');
  });

  it('applies different variants', () => {
    const variants = ['primary', 'ghost', 'outline', 'danger', 'apple', 'google', 'surface'] as const;
    variants.forEach((variant) => {
      const { unmount } = render(<Button variant={variant}>Test</Button>);
      const button = screen.getByRole('button');
      // Each variant should have specific classes (we just check they're applied)
      expect(button.className).toBeTruthy();
      unmount();
    });
  });

  it('applies different sizes', () => {
    const sizes = ['sm', 'md', 'lg'] as const;
    sizes.forEach((size) => {
      const { unmount } = render(<Button size={size}>Test</Button>);
      const button = screen.getByRole('button');
      expect(button.className).toContain('px-');
      unmount();
    });
  });

  it('applies fullWidth class when fullWidth is true', () => {
    render(<Button fullWidth>Full width</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('w-full');
  });

  it('does not apply fullWidth class when fullWidth is false', () => {
    render(<Button>Auto width</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('w-auto');
  });

  it('calls onClick when clicked', () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click me</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to button element', () => {
    const ref = { current: null };
    render(<Button ref={ref}>Ref button</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('passes additional props to button', () => {
    render(<Button data-testid="custom-button" disabled>Disabled</Button>);
    const button = screen.getByTestId('custom-button');
    expect(button).toBeDisabled();
  });

  it('applies custom className', () => {
    render(<Button className="custom-class">Custom</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('custom-class');
  });

  it('has correct displayName', () => {
    expect(Button.displayName).toBe('Button');
  });
});