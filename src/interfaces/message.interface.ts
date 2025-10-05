export interface LeaveRequesMessage {
    leaveId: string;
    idempotencyKey: string;
}

export interface LeaveResponseDLQMessage {
    leaveId: string;
    reason: string;
}
