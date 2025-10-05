import { Entity, Column, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity()
@Index(["employeeId"])
@Index(["startDate"])
@Index(["endDate"])
export class LeaveRequest {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    employeeId: string; // just stores the employee’s UUID

    @Column({ type: "date" })
    startDate: Date;

    @Column({ type: "date" })
    endDate: Date;

    @Column({ type: "enum", enum: ["PENDING", "APPROVED", "REJECTED"], default: "PENDING" })
    status: string;
}
