import { Repository } from "typeorm";
import { ILeaveRequest, LeaveRequestInsert } from "../interfaces/leaveRequest.interface";
import { LeaveRequest } from "../entities/leaveRequest.entity";

export class LeaveRequestRepository {
    private readonly repo: Repository<LeaveRequest>;

    constructor(repo: Repository<LeaveRequest>) {
        this.repo = repo;
    }

    async createRequest(leaveInfo: LeaveRequestInsert): Promise<ILeaveRequest> {
        const request = this.repo.create({
            ...leaveInfo,
            status: "PENDING",
        });
        return await this.repo.save(request);
    }

    async findById(id: string): Promise<ILeaveRequest | null> {
        return await this.repo.findOne({ where: { id } });
    }

    async findByEmployee(employeeId: string): Promise<ILeaveRequest[]> {
        return await this.repo.find({ where: { employeeId } });
    }

    async updateStatus(
        id: string,
        status: "PENDING" | "APPROVED" | "REJECTED",
    ): Promise<ILeaveRequest | null> {
        await this.repo.update({ id }, { status });
        return await this.findById(id);
    }

    async deleteRequest(id: string): Promise<void> {
        await this.repo.delete({ id });
    }
}
