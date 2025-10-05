export interface EmployeeInsert {
    name: string;
    email: string;
    departmentId: string;
}
export interface Employee {
    id: string;
    name: string;
    email: string;
    departmentId: string;
    updatedAt: Date;
    createdAt: Date;
}
