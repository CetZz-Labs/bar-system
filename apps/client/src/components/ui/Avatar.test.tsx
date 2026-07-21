import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Avatar } from './Avatar';

describe('Avatar', () => {
  it('renders image when src is provided', () => {
    render(<Avatar src="https://example.com/avatar.jpg" alt="John Doe" />);
    const img = screen.getByAltText('John Doe');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/avatar.jpg');
  });

  it('renders initials fallback when src is not provided', () => {
    render(<Avatar alt="John Doe" />);
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders initials fallback when image fails to load', () => {
    render(<Avatar src="https://example.com/broken.jpg" alt="Jane Smith" />);
    const img = screen.getByAltText('Jane Smith');
    fireEvent.error(img);
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  it('renders single initial for one-word name', () => {
    render(<Avatar alt="Madonna" />);
    expect(screen.getByText('MA')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(<Avatar alt="John Doe" fallback={<span data-testid="custom">Custom</span>} />);
    expect(screen.getByTestId('custom')).toBeInTheDocument();
    expect(screen.queryByText('JD')).not.toBeInTheDocument();
  });

  it('applies correct size classes for sm', () => {
    const { container } = render(<Avatar alt="Test" size="sm" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('w-8');
    expect(avatar.className).toContain('h-8');
  });

  it('applies correct size classes for md', () => {
    const { container } = render(<Avatar alt="Test" size="md" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('w-12');
    expect(avatar.className).toContain('h-12');
  });

  it('applies correct size classes for lg', () => {
    const { container } = render(<Avatar alt="Test" size="lg" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('w-24');
    expect(avatar.className).toContain('h-24');
  });

  it('applies custom className', () => {
    const { container } = render(<Avatar alt="Test" className="custom-class" />);
    const avatar = container.firstChild as HTMLElement;
    expect(avatar.className).toContain('custom-class');
  });

  it('forwards ref correctly', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Avatar alt="Test" ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has correct displayName', () => {
    expect(Avatar.displayName).toBe('Avatar');
  });
});
