import fs from 'fs/promises';
import path from 'path';

export async function saveGroupAvatar(buffer: Buffer, filename: string): Promise<string> {
    const filepath = path.join('uploads', 'group-avatars', filename);

    // Ensure the uploads/group-avatars directory exists
    await fs.mkdir(path.dirname(filepath), { recursive: true });

    await fs.writeFile(filepath, buffer);

    return `/uploads/group-avatars/${filename}`;
}

export async function saveBarLogo(buffer: Buffer, filename: string): Promise<string> {
    const filepath = path.join('uploads', 'bar-logos', filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, buffer);

    return `/uploads/bar-logos/${filename}`;
}

export async function saveBarCover(buffer: Buffer, filename: string): Promise<string> {
    const filepath = path.join('uploads', 'bar-covers', filename);

    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, buffer);

    return `/uploads/bar-covers/${filename}`;
}
