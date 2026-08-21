export type CashierRole = 'OWNER' | 'CASHIER'

export type ShiftEndReason = 'MANUAL' | 'KICKED_OUT' | 'BAR_CLOSED'

export type ShiftSummaryStatus = 'PENDING' | 'VIEWED'

export interface CashierSession {
    role: CashierRole
    bar: {
        id: string
        name: string
        closingTime: string
    }
    shift: {
        startedAt: string
    }
    user: {
        name: string
        lastName: string
    }
}

export interface CashierShiftSummary {
    status: ShiftSummaryStatus
    totalConsumptions: number
    confirmedConsumptions: number
    pendingConsumptions: number
    rejectedConsumptions: number
    disputedConsumptions: number
    totalAmount: number
    pointsAwarded: number
    redemptionCount: number
    redemptionsAvailable: boolean
    generatedAt: string
}

export interface CashierShiftSummaryResponse {
    shiftId: string
    barId: string
    cashierId: string
    role: CashierRole
    deviceInfo: string
    startedAt: string
    endedAt?: string
    endReason?: ShiftEndReason
    summary: CashierShiftSummary
}

export interface CashierCloseShiftResponse {
    message: string
    shiftId: string
    summary: CashierShiftSummary
}

export interface CashierShiftSummaryRecovery {
    shiftId: string
    summary: CashierShiftSummary
}

export type CashierSearchResult = {
    outingId: string
    groupId: string
    name: string
    inviteCode: string
    scheduledFor: string
    status: 'PENDING' | 'ACTIVE' | 'CANCELLED' | 'COMPLETED'
    members: Array<{ id: string; name: string; lastName: string }>
    action: 'check_in' | 'detail'
}

export type CashierSearchExactError = {
    code: 'NO_SALIDA' | 'OTHER_BAR'
    message: string
    otherBarName?: string
}
