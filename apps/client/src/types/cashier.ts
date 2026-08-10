export type CashierRole = 'OWNER' | 'CASHIER'

export interface CashierLoginForm {
    email: string
    password: string
    barId: string
    deviceInfo: string
}

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
