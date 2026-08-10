export type CashierRole = 'OWNER' | 'CASHIER';

export type CashierSession = {
  user: {
    id: string;
    name: string;
    lastName: string;
    email: string;
  };
  bar: {
    id: string;
    name: string;
    closingHour: string;
  };
  role: CashierRole;
  shiftId: string;
};

export type CashierSearchResult = {
  outingId: string;
  groupId: string;
  name: string;
  inviteCode: string;
  scheduledFor: string;
  status: 'ACTIVE' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  members: Array<{ id: string; name: string; lastName: string }>;
  action: 'check_in' | 'detail';
};

export type CashierSearchExactError = {
  code: 'NO_SALIDA' | 'OTHER_BAR';
  message: string;
  otherBarName?: string;
};
