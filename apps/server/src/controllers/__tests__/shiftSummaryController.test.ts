import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Types } from 'mongoose'
import { ShiftSummaryController } from '../ShiftSummaryController'
import Shift, { ShiftEndReason, ShiftSummaryStatus } from '../../models/Shift'
import BarUser, { BarUserRole } from '../../models/BarUser'
import { generateShiftSummary } from '../../utils/shiftSummary'
import { buildMockRequest, buildMockResponse } from '../../__tests__/helpers/mockHelpers'

vi.mock('../../models/Shift', () => ({
  default: { findById: vi.fn(), find: vi.fn(), findOne: vi.fn() },
  ShiftEndReason: { BAR_CLOSED: 'BAR_CLOSED' },
  ShiftSummaryStatus: { PENDING: 'PENDING', VIEWED: 'VIEWED' },
}))

vi.mock('../../models/BarUser', () => ({
  default: { findOne: vi.fn() },
  BarUserRole: { OWNER: 'OWNER', CASHIER: 'CASHIER' },
}))

vi.mock('../../utils/shiftSummary', () => ({
  generateShiftSummary: vi.fn(),
}))

const summary = {
  status: ShiftSummaryStatus.PENDING,
  totalConsumptions: 1,
  confirmedConsumptions: 1,
  pendingConsumptions: 0,
  rejectedConsumptions: 0,
  disputedConsumptions: 0,
  totalAmount: 5000,
  pointsAwarded: 3,
  redemptionCount: 0,
  redemptionsAvailable: false,
  generatedAt: new Date('2026-08-19T04:01:00.000Z'),
}

describe('ShiftSummaryController', () => {
  const userId = new Types.ObjectId()
  const shiftId = new Types.ObjectId()
  const shift = {
    _id: shiftId,
    bar: new Types.ObjectId(),
    user: new Types.ObjectId(),
    role: 'CASHIER',
    deviceInfo: 'POS-1',
    startedAt: new Date('2026-08-18T20:00:00.000Z'),
    endedAt: new Date('2026-08-19T04:00:00.000Z'),
    endReason: 'MANUAL',
    summary,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(Shift.findById).mockResolvedValue(shift as any)
    vi.mocked(BarUser.findOne).mockResolvedValue({
      role: BarUserRole.OWNER,
      isActive: true,
    } as any)
  })

  it('returns an owner summary', async () => {
    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { shiftId: shiftId.toString() },
    })
    const res = buildMockResponse()

    await ShiftSummaryController.getSummary(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      shiftId,
      summary,
    }))
    expect(generateShiftSummary).not.toHaveBeenCalled()
  })

  it('rejects a non-owner', async () => {
    vi.mocked(BarUser.findOne).mockResolvedValue({
      role: BarUserRole.CASHIER,
      isActive: true,
    } as any)
    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { shiftId: shiftId.toString() },
    })
    const res = buildMockResponse()

    await ShiftSummaryController.getSummary(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('allows a CASHIER to access their own summary, CSV and PDF', async () => {
    const cashierId = new Types.ObjectId()
    const cashierBarId = new Types.ObjectId()
    const cashierShift = {
      ...shift,
      bar: cashierBarId,
      user: cashierId,
    }
    vi.mocked(Shift.findById).mockResolvedValue(cashierShift as any)
    vi.mocked(BarUser.findOne).mockResolvedValue({
      role: BarUserRole.CASHIER,
      isActive: true,
    } as any)

    const req = buildMockRequest({
      cashierSummaryContext: {
        user: { _id: cashierId } as any,
        bar: cashierBarId,
        barUser: { role: BarUserRole.CASHIER, isActive: true } as any,
      },
      params: { shiftId: shift._id.toString() },
    })
    const summaryResponse = buildMockResponse()
    const csvResponse = buildMockResponse()
    const pdfResponse = buildMockResponse()

    await ShiftSummaryController.getSummary(req, summaryResponse)
    await ShiftSummaryController.downloadCsv(req, csvResponse)
    await ShiftSummaryController.downloadPdf(req, pdfResponse)

    expect(summaryResponse.status).toHaveBeenCalledWith(200)
    expect(csvResponse.status).not.toHaveBeenCalledWith(403)
    expect(pdfResponse.status).not.toHaveBeenCalledWith(403)
  })

  it('rejects a CASHIER attempting to access another cashier\'s shift in every format', async () => {
    const cashierId = new Types.ObjectId()
    const cashierBarId = shift.bar
    vi.mocked(BarUser.findOne).mockResolvedValue({
      role: BarUserRole.CASHIER,
      isActive: true,
    } as any)

    const req = buildMockRequest({
      cashierSummaryContext: {
        user: { _id: cashierId } as any,
        bar: cashierBarId,
        barUser: { role: BarUserRole.CASHIER, isActive: true } as any,
      },
      params: { shiftId: shift._id.toString() },
    })
    const responses = [buildMockResponse(), buildMockResponse(), buildMockResponse()]

    await ShiftSummaryController.getSummary(req, responses[0])
    await ShiftSummaryController.downloadCsv(req, responses[1])
    await ShiftSummaryController.downloadPdf(req, responses[2])

    for (const response of responses) {
      expect(response.status).toHaveBeenCalledWith(403)
    }
  })

  it('rejects a generic authenticated user without OWNER membership', async () => {
    vi.mocked(BarUser.findOne).mockResolvedValue({
      role: BarUserRole.CASHIER,
      isActive: true,
    } as any)
    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { shiftId: shiftId.toString() },
    })
    const res = buildMockResponse()

    await ShiftSummaryController.getSummary(req, res)

    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('serves CSV and PDF through separate download handlers', async () => {
    const req = buildMockRequest({
      user: { _id: userId } as any,
      params: { shiftId: shiftId.toString() },
    })
    const csvResponse = buildMockResponse()
    const pdfResponse = buildMockResponse()

    await ShiftSummaryController.downloadCsv(req, csvResponse)
    await ShiftSummaryController.downloadPdf(req, pdfResponse)

    expect(csvResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8')
    expect(csvResponse.send).toHaveBeenCalledWith(expect.stringContaining('field,value'))
    expect(pdfResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf')
    expect(pdfResponse.send).toHaveBeenCalledWith(expect.any(Buffer))
  })

  it('returns the latest pending auto-closed summary only for the authenticated cashier', async () => {
    const cashierId = new Types.ObjectId()
    const cashierBarId = new Types.ObjectId()
    const cashierShift = {
      ...shift,
      bar: cashierBarId,
      user: cashierId,
      endReason: ShiftEndReason.BAR_CLOSED,
    }
    vi.mocked(Shift.findOne).mockReturnValue({
      sort: vi.fn().mockResolvedValue(cashierShift),
    } as any)
    const req = buildMockRequest({
      cashierSummaryContext: {
        user: { _id: cashierId } as any,
        bar: cashierBarId,
        barUser: { role: BarUserRole.CASHIER, isActive: true } as any,
      },
    })
    const res = buildMockResponse()

    await ShiftSummaryController.pendingSummary(req, res)

    expect(Shift.findOne).toHaveBeenCalledWith(expect.objectContaining({
      bar: cashierBarId,
      user: cashierId,
      endReason: ShiftEndReason.BAR_CLOSED,
    }))
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ shiftId: cashierShift._id }))
  })
})
