import { describe, expect, it } from 'vitest'
import { buildCsv, buildPdf } from '../shiftSummaryExport'
import { ShiftSummaryStatus } from '../../models/Shift'

const data = {
  shiftId: 'shift-1',
  barId: 'bar-1',
  cashierId: 'cashier-1',
  role: 'CASHIER',
  deviceInfo: 'POS, 1',
  startedAt: new Date('2026-08-18T20:00:00.000Z'),
  endedAt: new Date('2026-08-19T04:00:00.000Z'),
  endReason: 'MANUAL',
  summary: {
    status: ShiftSummaryStatus.PENDING,
    totalConsumptions: 2,
    confirmedConsumptions: 1,
    pendingConsumptions: 1,
    rejectedConsumptions: 0,
    disputedConsumptions: 0,
    totalAmount: 5000,
    pointsAwarded: 3,
    redemptionCount: 0,
    redemptionsAvailable: false,
    generatedAt: new Date('2026-08-19T04:01:00.000Z'),
  },
}

describe('shift summary exports', () => {
  it('builds an escaped CSV with all summary fields', () => {
    const csv = buildCsv(data)

    expect(csv).toContain('field,value')
    expect(csv).toContain('deviceInfo,"POS, 1"')
    expect(csv).toContain('redemptionsAvailable,false')
    expect(csv).toContain('pointsAwarded,3')
  })

  it('builds a PDF buffer with a valid header and trailer', () => {
    const pdf = buildPdf(data)
    const content = pdf.toString('utf8')

    expect(Buffer.isBuffer(pdf)).toBe(true)
    expect(content.startsWith('%PDF-1.4')).toBe(true)
    expect(content).toContain('%%EOF')
  })
})
