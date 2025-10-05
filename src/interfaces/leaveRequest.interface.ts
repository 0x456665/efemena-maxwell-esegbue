export interface ILeaveRequest {
    id: string;
    employeeId: string; // just stores the employee’s UUID
    startDate: Date;
    endDate: Date;
    status: string;
}

export interface LeaveRequestInsert {
    employeeId: string;
    startDate: Date;
    endDate: Date;
}
