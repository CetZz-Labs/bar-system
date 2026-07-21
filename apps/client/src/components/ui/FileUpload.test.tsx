import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUpload } from './FileUpload';

describe('FileUpload', () => {
  it('should render the upload button with instructions', () => {
    render(
      <FileUpload onFileSelect={vi.fn()} previewUrl={null} />
    );

    expect(screen.getByText('FOTO DE PERFIL (OPCIONAL)')).toBeInTheDocument();
    expect(screen.getByText(/Arrastrá una foto/)).toBeInTheDocument();
    expect(screen.getByText(/JPG, PNG · Máx. 2MB/)).toBeInTheDocument();
  });

  it('should call onFileSelect with the file when a valid image is selected', async () => {
    const onFileSelect = vi.fn();
    render(<FileUpload onFileSelect={onFileSelect} previewUrl={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['(binary)'], 'avatar.png', { type: 'image/png' });

    await userEvent.upload(input, file);

    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('should call onFileSelect with null for oversized files (>2MB)', async () => {
    const onFileSelect = vi.fn();
    render(<FileUpload onFileSelect={onFileSelect} previewUrl={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    // Create a 3MB file
    const largeContent = new ArrayBuffer(3 * 1024 * 1024);
    const file = new File([largeContent], 'large.png', { type: 'image/png' });

    await userEvent.upload(input, file);

    expect(onFileSelect).toHaveBeenCalledWith(null);
  });

  it('should show preview image when previewUrl is provided', () => {
    render(
      <FileUpload
        onFileSelect={vi.fn()}
        previewUrl="https://example.com/preview.jpg"
      />
    );

    const img = screen.getByRole('img', { name: 'Preview' });
    expect(img).toHaveAttribute('src', 'https://example.com/preview.jpg');
  });

  it('should show remove button when preview is displayed', () => {
    render(
      <FileUpload
        onFileSelect={vi.fn()}
        previewUrl="https://example.com/preview.jpg"
      />
    );

    const removeButton = screen.getByRole('button', { name: '' });
    expect(removeButton).toBeInTheDocument();
  });

  it('should call onFileSelect with null when remove button is clicked', async () => {
    const onFileSelect = vi.fn();
    render(
      <FileUpload
        onFileSelect={onFileSelect}
        previewUrl="https://example.com/preview.jpg"
      />
    );

    const removeButton = screen.getByRole('button', { name: '' });
    await userEvent.click(removeButton);

    expect(onFileSelect).toHaveBeenCalledWith(null);
  });

  it('should display error message when error prop is provided', () => {
    render(
      <FileUpload
        onFileSelect={vi.fn()}
        previewUrl={null}
        error="File too large"
      />
    );

    expect(screen.getByText('File too large')).toBeInTheDocument();
  });

  it('should call onFileSelect with null when dragging non-image file', () => {
    const onFileSelect = vi.fn();
    render(<FileUpload onFileSelect={onFileSelect} previewUrl={null} />);

    const dropZone = screen.getByRole('button', { name: /Arrastrá una foto/ });
    const nonImageFile = new File(['data'], 'doc.pdf', { type: 'application/pdf' });

    // Simulate drop event with non-image file
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [nonImageFile] },
    });

    expect(onFileSelect).toHaveBeenCalledWith(null);
  });
});
