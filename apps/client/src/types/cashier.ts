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
