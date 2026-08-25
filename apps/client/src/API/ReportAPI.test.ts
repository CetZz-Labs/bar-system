import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadReport } from './ReportAPI';

vi.mock('@/libs/axios', () => ({
  __esModule: true,
  default: {
    get: vi.fn(),
  },
}));

vi.mock('@/utils/apiError', () => ({
  throwStandardError: vi.fn((error: unknown) => {
    throw error;
  }),
}));

import api from '@/libs/axios';

const mockApi = vi.mocked(api);

function blobFromString(text: string): Blob {
  return new Blob([text], { type: 'text/csv' });
}

describe('ReportAPI (LB-78)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds the Spanish file name for short ranges (file mode, LB-78 fixup)', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 200,
      data: blobFromString('a,b\n1,2\n'),
    });

    const result = await downloadReport('bar-1', {
      kind: 'consumptions',
      format: 'csv',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-10T23:59:59.999Z',
    });

    expect(mockApi.get).toHaveBeenCalledWith('/bars/bar-1/reports', {
      params: {
        kind: 'consumptions',
        format: 'csv',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-10T23:59:59.999Z',
      },
      responseType: 'blob',
    });
    expect(result).toMatchObject({
      mode: 'file',
      fileName: 'reporte-consumos-bar-1-2026-08-01-2026-08-10.csv',
    });
  });

  it('uses the Spanish slug for every report kind', async () => {
    const cases: Array<[Parameters<typeof downloadReport>[1]['kind'], string]> = [
      ['consumptions', 'reporte-consumos-bar-1-2026-08-01-2026-08-10.csv'],
      ['redemptions', 'reporte-canjes-bar-1-2026-08-01-2026-08-10.csv'],
      ['shifts', 'reporte-turnos-bar-1-2026-08-01-2026-08-10.csv'],
      ['consolidated', 'reporte-consolidado-bar-1-2026-08-01-2026-08-10.csv'],
    ];

    for (const [kind, expectedFileName] of cases) {
      mockApi.get.mockResolvedValueOnce({
        status: 200,
        data: blobFromString('a,b\n1,2\n'),
      });

      const result = await downloadReport('bar-1', {
        kind,
        format: 'csv',
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-10T23:59:59.999Z',
      });

      expect(result).toMatchObject({ mode: 'file', fileName: expectedFileName });
    }
  });

  it('returns the email mode with the server message for long ranges (202)', async () => {
    mockApi.get.mockResolvedValueOnce({
      status: 202,
      data: blobFromString(JSON.stringify({ message: 'El reporte se enviará por email' })),
    });

    const result = await downloadReport('bar-1', {
      kind: 'redemptions',
      format: 'pdf',
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-08-01T00:00:00.000Z',
    });

    expect(result).toEqual({ mode: 'email', message: 'El reporte se enviará por email' });
  });
});