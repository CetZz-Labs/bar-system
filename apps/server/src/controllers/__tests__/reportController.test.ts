import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Schema, Types } from 'mongoose'
import { ReportController } from '../ReportController'
import Bar from '../../models/Bar'
import { resolveOwnerAccess } from '../../utils/barAccess'
import * as barReports from '../../utils/barReports'
import { ReportEmail } from '../../emails/ReportEmail'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'
import type { ConsumptionReportRow } from '../../utils/barReports'

vi.mock('../../models/Bar', () => ({
    default: { findById: vi.fn() },
    BarStatus: { PENDING: 'pending', ACTIVE: 'active', REJECTED: 'rejected' },
    attendancePointsByDaySchema: new Schema({
        monday: { type: Number, default: 0 },
        tuesday: { type: Number, default: 0 },
        wednesday: { type: Number, default: 0 },
        thursday: { type: Number, default: 0 },
        friday: { type: Number, default: 0 },
        saturday: { type: Number, default: 0 },
        sunday: { type: Number, default: 0 },
    }, { _id: false }),
}))

vi.mock('../../utils/barAccess', () => ({
    resolveOwnerAccess: vi.fn(),
}))

vi.mock('../../utils/barReports', () => ({
    getConsumptions: vi.fn(),
    getRedemptions: vi.fn(),
    getShifts: vi.fn(),
    getConsolidated: vi.fn(),
    buildReportCsv: vi.fn(),
    buildReportPdf: vi.fn(),
}))

vi.mock('../../emails/ReportEmail', () => ({
    ReportEmail: { sendReportEmail: vi.fn() },
}))

const barId = new Types.ObjectId().toString()
const ownerEmail = 'owner@example.com'
const ownerId = new Types.ObjectId()

function buildReq(overrides: Record<string, unknown> = {}) {
    return buildMockRequest({
        user: { _id: ownerId, email: ownerEmail } as never,
        params: { barId },
        query: { kind: 'consumptions', format: 'csv', from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z' },
        ...overrides,
    })
}

function mockBar() {
    vi.mocked(Bar.findById).mockReturnValue({
        select: vi.fn().mockReturnValue({
            lean: vi.fn().mockResolvedValue({ name: 'Bar La Banda', logoUrl: undefined }),
        }),
    } as never)
}

const sampleRow: ConsumptionReportRow = {
    id: 'c1',
    groupId: 'g1',
    groupName: 'Los Pibes',
    cashierId: 'u1',
    cashierName: 'Juan Cajero',
    amount: 12000,
    pointsAwarded: 12,
    status: 'CONFIRMED',
    createdAt: new Date('2026-08-10T22:00:00.000Z'),
}

describe('ReportController.getReport (LB-78)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(resolveOwnerAccess).mockResolvedValue({ ok: true })
        vi.mocked(barReports.getConsumptions).mockResolvedValue([sampleRow])
        vi.mocked(barReports.buildReportCsv).mockReturnValue('metric,value\nx,1\n')
        vi.mocked(barReports.buildReportPdf).mockResolvedValue(Buffer.from('%PDF-1.4 test pdf'))
        mockBar()
    })

  it('returns 403 when the requester is not the OWNER (CASHIER → 403)', async () => {
    vi.mocked(resolveOwnerAccess).mockResolvedValue({
      ok: false,
      status: 403,
      message: 'Solo el dueño del bar puede gestionar las recompensas',
    })

    const req = buildReq()
    const res = buildMockResponse()

    await ReportController.getReport(req, res)

    expect(resolveOwnerAccess).toHaveBeenCalledWith(ownerId.toString(), barId)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(Bar.findById).not.toHaveBeenCalled()
  })

  it('returns 404 when the bar does not exist', async () => {
    vi.mocked(Bar.findById).mockReturnValue({
      select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    } as never)

    const req = buildReq()
    const res = buildMockResponse()

    await ReportController.getReport(req, res)

    expect(res.status).toHaveBeenCalledWith(404)
    expect(barReports.getConsumptions).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid date range (to < from)', async () => {
    const req = buildReq({
      query: { from: '2026-08-31T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
    })
    const res = buildMockResponse()

    await ReportController.getReport(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(barReports.getConsumptions).not.toHaveBeenCalled()
  })

  it('returns 400 when the range exceeds 3 months', async () => {
    const req = buildReq({
      query: { from: '2026-01-01T00:00:00.000Z', to: '2026-05-01T00:00:00.000Z' },
    })
    const res = buildMockResponse()

    await ReportController.getReport(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ message: 'El rango máximo permitido es de 3 meses' })
    expect(barReports.getConsumptions).not.toHaveBeenCalled()
  })

  it('dispatches to the right getter per kind', async () => {
    const cases: Array<[string, keyof typeof barReports]> = [
      ['consumptions', 'getConsumptions'],
      ['redemptions', 'getRedemptions'],
      ['shifts', 'getShifts'],
      ['consolidated', 'getConsolidated'],
    ]

    for (const [kind, getter] of cases) {
      const req = buildReq({ query: { kind, format: 'csv', from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z' } })
      const res = buildMockResponse()
      await ReportController.getReport(req, res)
      expect(barReports[getter as 'getConsumptions']).toHaveBeenCalledWith(barId, expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) }))
    }
  })

  it('serves the CSV attachment synchronously for short ranges (< 30 days)', async () => {
    const req = buildReq({
      query: { kind: 'consumptions', format: 'csv', from: '2026-08-01T00:00:00.000Z', to: '2026-08-10T00:00:00.000Z' },
    })
    const res = buildMockResponse()

    await ReportController.getReport(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8')
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('reporte-consumos-')
    )
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith('metric,value\nx,1\n')
    expect(ReportEmail.sendReportEmail).not.toHaveBeenCalled()
  })

  it('serves the PDF attachment synchronously for short ranges (< 30 days)', async () => {
    const req = buildReq({
      query: { kind: 'consumptions', format: 'pdf', from: '2026-08-01T00:00:00.000Z', to: '2026-08-10T00:00:00.000Z' },
    })
    const res = buildMockResponse()

    await ReportController.getReport(req, res)

    expect(barReports.buildReportPdf).toHaveBeenCalledWith(
      'consumptions',
      [sampleRow],
      expect.objectContaining({ barName: 'Bar La Banda' })
    )
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer))
    expect(ReportEmail.sendReportEmail).not.toHaveBeenCalled()
  })

  it('sends the report by email and returns 202 for long ranges (>= 30 days)', async () => {
    const req = buildReq({
      query: { kind: 'consumptions', format: 'pdf', from: '2026-06-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
    })
    const res = buildMockResponse()

    await ReportController.getReport(req, res)

    expect(ReportEmail.sendReportEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ownerEmail,
        barName: 'Bar La Banda',
        reportType: 'consumptions',
        attachment: expect.objectContaining({
          filename: expect.stringContaining('.pdf'),
          content: expect.any(Buffer),
        }),
      })
    )
    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.send).not.toHaveBeenCalled()
  })

  it('sends a CSV attachment by email for long ranges when format=csv', async () => {
    const req = buildReq({
      query: { kind: 'consumptions', format: 'csv', from: '2026-06-01T00:00:00.000Z', to: '2026-08-01T00:00:00.000Z' },
    })
    const res = buildMockResponse()

    await ReportController.getReport(req, res)

    const emailCall = vi.mocked(ReportEmail.sendReportEmail).mock.calls[0][0]
    expect(emailCall.attachment.filename).toContain('.csv')
    expect(emailCall.attachment.content).toBeInstanceOf(Buffer)
    expect(res.status).toHaveBeenCalledWith(202)
  })
})
