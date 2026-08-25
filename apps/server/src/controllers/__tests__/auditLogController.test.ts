import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import { AuditLogController } from '../AuditLogController'
import AuditLog from '../../models/AuditLog'
import User from '../../models/User'
import { resolveOwnerAccess } from '../../utils/barAccess'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

vi.mock('../../models/AuditLog', () => ({
  default: { find: vi.fn() },
}))

vi.mock('../../models/User', () => ({
  default: { find: vi.fn() },
}))

vi.mock('../../utils/barAccess', () => ({
  resolveOwnerAccess: vi.fn(),
}))

function buildLeanRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    _id: new Types.ObjectId(),
    bar: new Types.ObjectId(),
    actorType: 'CASHIER' as const,
    actorId: new Types.ObjectId(),
    actorName: 'Juan Cajero',
    eventType: 'consumo.registered' as const,
    entityType: 'Consumo',
    entityId: new Types.ObjectId(),
    metadata: { amount: 1000 + i },
    deviceInfo: 'POS-1',
    ip: '127.0.0.1',
    createdAt: new Date(Date.now() - i * 1000),
  }))
}

function mockFindRows(rows: unknown[]) {
  vi.mocked(AuditLog.find).mockReturnValue({
    sort: vi.fn().mockReturnValue({
      limit: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(rows),
      }),
    }),
  } as never)
}

describe('AuditLogController.getAuditLogs (LB-77)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 when the requester is a CASHIER (OWNER-only)', async () => {
    vi.mocked(resolveOwnerAccess).mockResolvedValue({
      ok: false,
      status: 403,
      message: 'Solo el dueño del bar puede gestionar las recompensas',
    })

    const req = buildMockRequest({
      user: { _id: new Types.ObjectId() } as never,
      params: { barId: new Types.ObjectId().toString() },
      query: {},
    })
    const res = buildMockResponse()

    await AuditLogController.getAuditLogs(req, res)

    expect(resolveOwnerAccess).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
    expect(AuditLog.find).not.toHaveBeenCalled()
  })

  it('applies the filters (from/to/eventType/actorType/actorId/entityId/q) to the query', async () => {
    vi.mocked(resolveOwnerAccess).mockResolvedValue({ ok: true })
    mockFindRows([])

    const actorId = new Types.ObjectId().toString()
    const entityId = new Types.ObjectId().toString()
    const req = buildMockRequest({
      user: { _id: new Types.ObjectId() } as never,
      params: { barId: new Types.ObjectId().toString() },
      query: {
        from: '2026-08-01T00:00:00.000Z',
        to: '2026-08-31T00:00:00.000Z',
        eventType: 'consumo.registered',
        actorType: 'CASHIER',
        actorId,
        entityId,
        q: 'chopp',
      },
    })
    const res = buildMockResponse()

    await AuditLogController.getAuditLogs(req, res)

    const filter = vi.mocked(AuditLog.find).mock.calls[0][0] as Record<string, unknown>
    expect(filter.bar).toBeInstanceOf(Types.ObjectId)
    expect((filter.createdAt as Record<string, Date>).$gte).toEqual(new Date('2026-08-01T00:00:00.000Z'))
    expect((filter.createdAt as Record<string, Date>).$lte).toEqual(new Date('2026-08-31T00:00:00.000Z'))
    expect(filter.eventType).toBe('consumo.registered')
    expect(filter.actorType).toBe('CASHIER')
    expect(filter.actorId).toBeInstanceOf(Types.ObjectId)
    expect(filter.entityId).toBeInstanceOf(Types.ObjectId)
    expect(Array.isArray(filter.$or)).toBe(true)
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns items, nextCursor and hasMore when the page is full (cursor pagination)', async () => {
    vi.mocked(resolveOwnerAccess).mockResolvedValue({ ok: true })
    const rows = buildLeanRows(2)
    mockFindRows(rows)

    const req = buildMockRequest({
      user: { _id: new Types.ObjectId() } as never,
      params: { barId: new Types.ObjectId().toString() },
      query: { limit: '2' },
    })
    const res = buildMockResponse()

    await AuditLogController.getAuditLogs(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const body = vi.mocked(res.json).mock.calls[0][0] as {
      items: unknown[];
      nextCursor: string | null;
      hasMore: boolean;
    }
    expect(body.items).toHaveLength(2)
    expect(body.hasMore).toBe(true)
    expect(typeof body.nextCursor).toBe('string')
    expect(body.nextCursor).not.toBeNull()
  })

  it('returns hasMore=false and null nextCursor when the page is not full', async () => {
    vi.mocked(resolveOwnerAccess).mockResolvedValue({ ok: true })
    mockFindRows(buildLeanRows(1))

    const req = buildMockRequest({
      user: { _id: new Types.ObjectId() } as never,
      params: { barId: new Types.ObjectId().toString() },
      query: { limit: '5' },
    })
    const res = buildMockResponse()

    await AuditLogController.getAuditLogs(req, res)

    const body = vi.mocked(res.json).mock.calls[0][0] as {
      nextCursor: string | null;
      hasMore: boolean;
    }
    expect(body.hasMore).toBe(false)
    expect(body.nextCursor).toBeNull()
  })

  it('returns 400 for an invalid cursor', async () => {
    vi.mocked(resolveOwnerAccess).mockResolvedValue({ ok: true })

    const req = buildMockRequest({
      user: { _id: new Types.ObjectId() } as never,
      params: { barId: new Types.ObjectId().toString() },
      query: { cursor: 'not-a-valid-base64url-json' },
    })
    const res = buildMockResponse()

    await AuditLogController.getAuditLogs(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(AuditLog.find).not.toHaveBeenCalled()
  })

  it('renders CSV when format=csv (with headers + attachment)', async () => {
    vi.mocked(resolveOwnerAccess).mockResolvedValue({ ok: true })
    mockFindRows(buildLeanRows(1))

    const req = buildMockRequest({
      user: { _id: new Types.ObjectId() } as never,
      params: { barId: new Types.ObjectId().toString() },
      query: { format: 'csv' },
    })
    const res = buildMockResponse()

    await AuditLogController.getAuditLogs(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8')
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="audit-logs.csv"'
    )
    expect(res.send).toHaveBeenCalledWith(expect.stringContaining('ID,Fecha,Tipo de Actor'))
    expect(res.json).not.toHaveBeenCalled()
  })

  it('resolves actorName from User when snapshot is missing (batch resolve)', async () => {
    vi.mocked(resolveOwnerAccess).mockResolvedValue({ ok: true })

    const userId = new Types.ObjectId()
    const rows = [
      {
        _id: new Types.ObjectId(),
        bar: new Types.ObjectId(),
        actorType: 'CASHIER' as const,
        actorId: userId,
        actorName: null as string | null,
        eventType: 'consumo.registered' as const,
        entityType: 'Consumo',
        entityId: new Types.ObjectId(),
        metadata: { amount: 1000 },
        deviceInfo: 'POS-1',
        ip: '127.0.0.1',
        createdAt: new Date(),
      },
    ]
    mockFindRows(rows)

    vi.mocked(User.find).mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          { _id: userId, name: 'Resolved Name' },
        ]),
      }),
    } as never)

    const req = buildMockRequest({
      user: { _id: new Types.ObjectId() } as never,
      params: { barId: new Types.ObjectId().toString() },
      query: {},
    })
    const res = buildMockResponse()

    await AuditLogController.getAuditLogs(req, res)

    expect(User.find).toHaveBeenCalledWith({
      _id: { $in: [userId] },
    })

    const body = vi.mocked(res.json).mock.calls[0][0] as {
      items: Array<{ actorName: string | null }>;
    }
    expect(body.items[0].actorName).toBe('Resolved Name')
  })
})
