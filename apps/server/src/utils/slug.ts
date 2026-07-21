export function generateSlug(name: string): string {
    const base = name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

    const suffix = Array.from({ length: 4 }, () =>
        Math.random().toString(36).charAt(2)
    ).join('');

    return `${base}-${suffix}`;
}
