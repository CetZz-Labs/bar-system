import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Types } from 'mongoose'
import Consumption from '../../models/Consumption'
import Redemption from '../../models/Redemption'
import PointsTransaction from '../../models/PointsTransaction'
import Outing from '../../models/Outing'
import Shift from '../../models/Shift'
import User from '../../models/User'
import Group from '../../models/Group'
import {
    buildReportCsv,
    buildReportPdf,
    formatDateTime,
    getConsolidated,
    getConsumptions,
    getRedemptions,
    getShifts,
    type ConsumptionReportRow,
    type RedemptionReportRow,
    type ShiftReportRow,
    type ConsolidatedReportRow,
} from '../barReports'

vi.mock('../../models/Consumption', () => ({
    default: { find: vi.fn(), aggregate: vi.fn() },
    ConsumptionStatus: {
        PENDING_LEADER_CONFIRMATION: 'PENDING_LEADER_CONFIRMATION',
        CONFIRMED: 'CONFIRMED',
        REJECTED: 'REJECTED',
        DISPUTED: 'DISPUTED',
        ABANDONED: 'ABANDONED',
        RESOLVED_BY_OWNER: 'RESOLVED_BY_OWNER',
    },
}))

vi.mock('../../models/Redemption', () => ({
    default: { find: vi.fn(), aggregate: vi.fn() },
    RedemptionStatus: {
        HELD: 'HELD',
        VALIDATED: 'VALIDATED',
        REJECTED: 'REJECTED',
        CANCELLED: 'CANCELLED',
        EXPIRED: 'EXPIRED',
        ABANDONED: 'ABANDONED',
    },
}))

vi.mock('../../models/PointsTransaction', () => ({
    default: { aggregate: vi.fn() },
    PointsTransactionType: {
        ATTENDANCE: 'ATTENDANCE',
        CONSUMPTION: 'CONSUMPTION',
        REDEMPTION: 'REDEMPTION',
    },
}))

vi.mock('../../models/Outing', () => ({
    default: { find: vi.fn(), aggregate: vi.fn() },
    OutingStatus: {
        PENDING: 'PENDING',
        ACTIVE: 'ACTIVE',
        CANCELLED: 'CANCELLED',
        COMPLETED: 'COMPLETED',
        NO_SHOW: 'NO_SHOW',
    },
}))

vi.mock('../../models/Shift', () => ({
    default: { find: vi.fn() },
    ShiftEndReason: { MANUAL: 'MANUAL', KICKED_OUT: 'KICKED_OUT', BAR_CLOSED: 'BAR_CLOSED' },
    ShiftSummaryStatus: { PENDING: 'PENDING', VIEWED: 'VIEWED' },
}))

vi.mock('../../models/User', () => ({
    default: { find: vi.fn() },
}))

vi.mock('../../models/Group', () => ({
    default: { find: vi.fn() },
}))

const barId = new Types.ObjectId().toString()
const range = { from: new Date('2026-08-01T00:00:00.000Z'), to: new Date('2026-08-31T23:59:59.999Z') }

function mockFindSort(model: { find: ReturnType<typeof vi.fn> }, rows: unknown[]): void {
    vi.mocked(model.find).mockReturnValue({
        sort: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(rows) }),
    } as never)
}

function mockFindSelect(model: { find: ReturnType<typeof vi.fn> }, rows: unknown[]): void {
    vi.mocked(model.find).mockReturnValue({
        select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(rows) }),
    } as never)
}

describe('barReports getters (LB-78)', () => {
    beforeEach(() => vi.clearAllMocks())

    describe('getConsumptions', () => {
        it('returns one row per consumption with group/cashier names resolved', async () => {
            const groupId = new Types.ObjectId()
            const outingId = new Types.ObjectId()
            const cashierId = new Types.ObjectId()

            mockFindSort(Consumption, [
                {
                    _id: new Types.ObjectId(),
                    outing: outingId,
                    cashier: cashierId,
                    amount: 12000,
                    pointsAwarded: 12,
                    status: 'CONFIRMED',
                    createdAt: new Date('2026-08-10T22:00:00.000Z'),
                },
            ])
            mockFindSelect(Outing, [{ _id: outingId, group: groupId }])
            mockFindSelect(Group, [{ _id: groupId, name: 'Los Pibes' }])
            mockFindSelect(User, [{ _id: cashierId, name: 'Juan', lastName: 'Cajero' }])

            const rows = await getConsumptions(barId, range)

            expect(vi.mocked(Consumption.find)).toHaveBeenCalledWith({
                bar: barId,
                createdAt: { $gte: range.from, $lte: range.to },
            })
            expect(rows).toHaveLength(1)
            expect(rows[0].groupName).toBe('Los Pibes')
            expect(rows[0].cashierName).toBe('Juan Cajero')
            expect(rows[0].amount).toBe(12000)
            expect(rows[0].pointsAwarded).toBe(12)
            expect(rows[0].status).toBe('CONFIRMED')
        })

        it('renders empty names when group/cashier references are missing', async () => {
            const outingId = new Types.ObjectId()
            const cashierId = new Types.ObjectId()

            mockFindSort(Consumption, [
                {
                    _id: new Types.ObjectId(),
                    outing: outingId,
                    cashier: cashierId,
                    amount: 5000,
                    status: 'DISPUTED',
                    createdAt: new Date('2026-08-11T21:00:00.000Z'),
                },
            ])
            // Outing sin grupo referenciable y usuario inexistente → nombres vacíos.
            mockFindSelect(Outing, [])
            mockFindSelect(Group, [])
            mockFindSelect(User, [])

            const rows = await getConsumptions(barId, range)

            expect(rows[0].groupName).toBe('')
            expect(rows[0].cashierName).toBeNull()
            expect(rows[0].pointsAwarded).toBe(0)
        })

        it('skips resolution queries when there are no consumptions', async () => {
            mockFindSort(Consumption, [])

            const rows = await getConsumptions(barId, range)

            expect(rows).toEqual([])
            expect(Outing.find).not.toHaveBeenCalled()
            expect(User.find).not.toHaveBeenCalled()
            expect(Group.find).not.toHaveBeenCalled()
        })
    })

    describe('getRedemptions', () => {
        it('returns validated/rejected redemptions with ARS equivalent at POINTS_TO_ARS_RATE', async () => {
            const groupId = new Types.ObjectId()
            const cashierId = new Types.ObjectId()

            mockFindSort(Redemption, [
                {
                    _id: new Types.ObjectId(),
                    group: groupId,
                    reward: new Types.ObjectId(),
                    rewardNameSnapshot: '1L de chopp',
                    pointsRequiredSnapshot: 4,
                    status: 'VALIDATED',
                    cashier: cashierId,
                    validatedAt: new Date('2026-08-12T20:30:00.000Z'),
                },
            ])
            mockFindSelect(Group, [{ _id: groupId, name: 'Las Chicas' }])
            mockFindSelect(User, [{ _id: cashierId, name: 'Ana', lastName: 'Cajera' }])

            const rows = await getRedemptions(barId, range)

            expect(vi.mocked(Redemption.find)).toHaveBeenCalledWith({
                bar: barId,
                status: { $in: ['VALIDATED', 'REJECTED'] },
                validatedAt: { $gte: range.from, $lte: range.to },
            })
            expect(rows).toHaveLength(1)
            expect(rows[0].groupName).toBe('Las Chicas')
            expect(rows[0].rewardName).toBe('1L de chopp')
            expect(rows[0].pointsRequired).toBe(4)
            expect(rows[0].arsEquivalent).toBe(4000)
            expect(rows[0].cashierName).toBe('Ana Cajera')
            expect(rows[0].validatedAt).toBeInstanceOf(Date)
        })

        it('handles redemptions without cashier (null cashierName)', async () => {
            const groupId = new Types.ObjectId()

            mockFindSort(Redemption, [
                {
                    _id: new Types.ObjectId(),
                    group: groupId,
                    reward: new Types.ObjectId(),
                    rewardNameSnapshot: 'X',
                    pointsRequiredSnapshot: 2,
                    status: 'REJECTED',
                    cashier: null,
                    validatedAt: new Date('2026-08-13T20:30:00.000Z'),
                },
            ])
            mockFindSelect(Group, [{ _id: groupId, name: 'Grupo Sin Cajero' }])
            mockFindSelect(User, [])

            const rows = await getRedemptions(barId, range)

            expect(rows[0].cashierId).toBeNull()
            expect(rows[0].cashierName).toBeNull()
            expect(rows[0].status).toBe('REJECTED')
        })
    })

    describe('getShifts', () => {
        it('returns one row per closed shift with the persisted summary fields', async () => {
            const cashierId = new Types.ObjectId()

            mockFindSort(Shift, [
                {
                    _id: new Types.ObjectId(),
                    user: cashierId,
                    role: 'CASHIER',
                    startedAt: new Date('2026-08-15T20:00:00.000Z'),
                    endedAt: new Date('2026-08-16T06:00:00.000Z'),
                    endReason: 'MANUAL',
                    summary: {
                        totalConsumptions: 10,
                        confirmedConsumptions: 8,
                        rejectedConsumptions: 1,
                        disputedConsumptions: 1,
                        totalAmount: 35000,
                        pointsAwarded: 30,
                        redemptionCount: 2,
                    },
                },
            ])
            mockFindSelect(User, [{ _id: cashierId, name: 'Juan', lastName: 'Cajero' }])

            const rows = await getShifts(barId, range)

            expect(vi.mocked(Shift.find)).toHaveBeenCalledWith({
                bar: barId,
                endedAt: { $ne: null },
                startedAt: { $gte: range.from, $lte: range.to },
            })
            expect(rows).toHaveLength(1)
            expect(rows[0].cashierName).toBe('Juan Cajero')
            expect(rows[0].confirmedConsumptions).toBe(8)
            expect(rows[0].totalAmount).toBe(35000)
            expect(rows[0].redemptionCount).toBe(2)
        })

        it('emits zeros for shifts without a persisted summary (no on-the-fly generation)', async () => {
            mockFindSort(Shift, [
                {
                    _id: new Types.ObjectId(),
                    user: new Types.ObjectId(),
                    role: 'CASHIER',
                    startedAt: new Date('2026-08-15T20:00:00.000Z'),
                    endedAt: new Date('2026-08-16T06:00:00.000Z'),
                    endReason: null,
                    summary: undefined,
                },
            ])
            mockFindSelect(User, [])

            const rows = await getShifts(barId, range)

            expect(rows[0].endReason).toBeNull()
            expect(rows[0].totalConsumptions).toBe(0)
            expect(rows[0].totalAmount).toBe(0)
            expect(rows[0].pointsAwarded).toBe(0)
        })
    })

    describe('getConsolidated', () => {
        it('reuses the dashboard stat cards and subtracts REDEMPTION points from PointsTransaction', async () => {
            // getDashboardStatCards → Promise.all([Outing.aggregate, Consumption.aggregate,
            // PointsTransaction.aggregate (stat), Redemption.aggregate])
            vi.mocked(Outing.aggregate).mockResolvedValue([{ count: 3 }])
            vi.mocked(Consumption.aggregate).mockResolvedValue([{ _id: null, total: 50000 }])
            vi.mocked(PointsTransaction.aggregate)
                .mockResolvedValueOnce([
                    { _id: 'CONSUMPTION', total: 45 },
                    { _id: 'ATTENDANCE', total: 10 },
                ])
                .mockResolvedValueOnce([{ _id: null, total: -4000 }])
            vi.mocked(Redemption.aggregate).mockResolvedValue([{ _id: null, count: 2, pointsTotal: 4000 }])

            const row = await getConsolidated(barId, range)

            expect(row.groupsCount).toBe(3)
            expect(row.consumptionTotalArs).toBe(50000)
            expect(row.pointsAwarded.total).toBe(55)
            expect(row.redemptions.count).toBe(2)
            expect(row.redemptions.arsEquivalent).toBe(4000000)
            expect(row.redemptions.pointsDebited).toBe(4000)
            expect(row.netPoints).toBe(55 - 4000)
            // La segunda llamada a PointsTransaction.aggregate filtra type=REDEMPTION.
            const debitCall = vi.mocked(PointsTransaction.aggregate).mock.calls[1]
            expect(debitCall[0]).toContainEqual({ $group: { _id: null, total: { $sum: '$amount' } } })
        })

        it('handles empty aggregates as zeroes', async () => {
            vi.mocked(Outing.aggregate).mockResolvedValue([])
            vi.mocked(Consumption.aggregate).mockResolvedValue([])
            vi.mocked(PointsTransaction.aggregate).mockResolvedValueOnce([]).mockResolvedValueOnce([])
            vi.mocked(Redemption.aggregate).mockResolvedValue([])

            const row = await getConsolidated(barId, range)

            expect(row.consumptionTotalArs).toBe(0)
            expect(row.redemptions.count).toBe(0)
            expect(row.netPoints).toBe(0)
            expect(row.redemptions.pointsDebited).toBe(0)
        })
    })
})

describe('barReports CSV/PDF builders (LB-78)', () => {
    beforeEach(() => vi.clearAllMocks())

    const consumptionRow: ConsumptionReportRow = {
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

    const redemptionRow: RedemptionReportRow = {
        id: 'r1',
        groupId: 'g1',
        groupName: 'Las Chicas',
        rewardId: 'rw1',
        rewardName: '1L de chopp',
        pointsRequired: 4,
        arsEquivalent: 4000,
        status: 'VALIDATED',
        cashierId: 'u2',
        cashierName: 'Ana Cajera',
        validatedAt: new Date('2026-08-12T20:30:00.000Z'),
    }

    const shiftRow: ShiftReportRow = {
        shiftId: 's1',
        cashierId: 'u1',
        cashierName: 'Juan Cajero',
        role: 'CASHIER',
        startedAt: new Date('2026-08-15T20:00:00.000Z'),
        endedAt: new Date('2026-08-16T06:00:00.000Z'),
        endReason: 'MANUAL',
        totalConsumptions: 10,
        confirmedConsumptions: 8,
        rejectedConsumptions: 1,
        disputedConsumptions: 1,
        totalAmount: 35000,
        pointsAwarded: 30,
        redemptionCount: 2,
    }

    const consolidatedRow: ConsolidatedReportRow = {
        groupsCount: 3,
        consumptionTotalArs: 50000,
        pointsAwarded: { consumption: 45, attendance: 10, total: 55 },
        redemptions: { count: 2, arsEquivalent: 4000000, pointsDebited: 4000 },
        netPoints: 51,
    }

    it('builds the consumptions CSV with header and one row per consumption', () => {
        const csv = buildReportCsv('consumptions', [consumptionRow])
        const lines = csv.trim().split('\n')
        expect(lines[0]).toContain('id,createdAt,groupId,groupName')
        expect(lines[1]).toContain('Los Pibes')
        expect(lines[1]).toContain('Juan Cajero')
        expect(lines[1]).toContain('12000')
        expect(csv.endsWith('\n')).toBe(true)
    })

    it('escapes commas and quotes in CSV cells', () => {
        const row = { ...consumptionRow, groupName: 'Grupo "VIP", el de los viernes' }
        const csv = buildReportCsv('consumptions', [row])
        expect(csv).toContain('"Grupo ""VIP"", el de los viernes"')
    })

    it('builds the redemptions CSV with ARS equivalent', () => {
        const csv = buildReportCsv('redemptions', [redemptionRow])
        expect(csv).toContain('rewardName,pointsRequired,arsEquivalent')
        expect(csv).toContain('1L de chopp')
        expect(csv).toContain('4000')
    })

    it('renders the Spanish status label in the consumptions CSV (LB-78 fixup)', () => {
        const csv = buildReportCsv('consumptions', [consumptionRow])
        // consumptionRow.status = 'CONFIRMED' → label 'Confirmado'
        expect(csv).toContain('Confirmado')
        expect(csv).not.toContain('CONFIRMED')
    })

    it('renders the Spanish status label in the redemptions CSV (LB-78 fixup)', () => {
        const csv = buildReportCsv('redemptions', [redemptionRow])
        // redemptionRow.status = 'VALIDATED' → label 'Entregado'
        expect(csv).toContain('Entregado')
        expect(csv).not.toContain('VALIDATED')
    })

    it('falls back to the raw status when no Spanish label exists', () => {
        const csv = buildReportCsv('redemptions', [{ ...redemptionRow, status: 'HELD' as RedemptionReportRow['status'] }])
        expect(csv).toContain('HELD')
    })

    it('builds the shifts CSV with summary fields', () => {
        const csv = buildReportCsv('shifts', [shiftRow])
        expect(csv).toContain('shiftId,startedAt,endedAt,endReason')
        expect(csv).toContain('35000')
        expect(csv).toContain('MANUAL')
    })

    it('builds the consolidated CSV as metric/value pairs', () => {
        const csv = buildReportCsv('consolidated', consolidatedRow)
        expect(csv).toContain('metric,value')
        expect(csv).toContain('netPoints,51')
        expect(csv).toContain('redemptionsPointsDebited,4000')
    })

    it('generates a real PDF buffer (pdfmake) starting with the %PDF header', async () => {
        const pdf = await buildReportPdf('consumptions', [consumptionRow], {
            barName: 'Bar La Banda',
            periodLabel: '2026-08-01 → 2026-08-31',
        })
        expect(Buffer.isBuffer(pdf)).toBe(true)
        expect(pdf.length).toBeGreaterThan(500)
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('generates PDFs for every report kind', async () => {
        const opts = { barName: 'Bar X', periodLabel: 'período' }
        const cases: Array<[Parameters<typeof buildReportPdf>[0], Parameters<typeof buildReportPdf>[1]]> = [
            ['redemptions', [redemptionRow]],
            ['shifts', [shiftRow]],
            ['consolidated', consolidatedRow],
        ]
        for (const [kind, rows] of cases) {
            const pdf = await buildReportPdf(kind, rows, opts)
            expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
        }
    })

    it('generates a valid PDF for redemptions with Spanish status labels (LB-78 fixup)', async () => {
        const pdf = await buildReportPdf('redemptions', [{ ...redemptionRow, status: 'REJECTED' }], {
            barName: 'Bar La Banda',
            periodLabel: '2026-08-01 → 2026-08-31',
        })
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    })

    it('generates a valid shifts PDF with Inicio/Fin columns, even when endedAt is null (LB-78 fixup)', async () => {
        const pdf = await buildReportPdf('shifts', [{ ...shiftRow, endedAt: null }], {
            barName: 'Bar La Banda',
            periodLabel: '2026-08-01 → 2026-08-31',
        })
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    })

    describe('formatDateTime (LB-78 fixup)', () => {
        it('formats a Date as DD/MM/YYYY HH:mm using LOCAL getters', () => {
            // Fecha construida con componentes locales → getters locales
            // devuelven exactamente los mismos valores en cualquier TZ.
            const d = new Date(2026, 7, 15, 20, 5)
            expect(formatDateTime(d)).toBe('15/08/2026 20:05')
        })

        it('formats a ISO string with local components (not UTC)', () => {
            // 2026-08-15T20:00:00Z renderizado local: la hora NUNCA puede ser
            // 20:00 como UTC (a menos que la máquina esté en UTC+0); con
            // getHours() local el offset se aplica. El formato DD/MM/YYYY HH:mm
            // se verifica con un Date local para no depender de la TZ del runner.
            const d = new Date(2026, 11, 31, 23, 59)
            expect(formatDateTime(d)).toBe('31/12/2026 23:59')
        })

        it('returns an empty string for null/undefined', () => {
            expect(formatDateTime(null)).toBe('')
            expect(formatDateTime(undefined)).toBe('')
        })
    })

    it('embeds the logo in the PDF header when it is a data URL', async () => {
        // 1x1 PNG rojo en base64 — suficiente para que pdfmake lo acepte.
        const logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        const pdf = await buildReportPdf('consumptions', [consumptionRow], {
            barName: 'Bar La Banda',
            periodLabel: '2026-08-01 → 2026-08-31',
            logoUrl: logo,
        })
        expect(pdf.subarray(0, 5).toString()).toBe('%PDF-')
    })
})
