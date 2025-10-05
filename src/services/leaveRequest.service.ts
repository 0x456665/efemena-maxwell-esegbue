import { DataSource } from "typeorm";
import redisClient from "../config/redis";
import { LeaveRequestRepository } from "../repositories/leaveRequest.repository";
import { EmployeeRepository } from "../repositories/employee.repository";
import { LeaveRequest } from "../entities/leaveRequest.entity";
import { ILeaveRequest, LeaveRequestInsert } from "../interfaces/leaveRequest.interface";
import sendMessageToQueue from "../queue/producer.leaveRequest";
import { BadRequestError, ConflictError, NotFoundError } from "../utils/errors";

export class LeaveRequestService {
    private readonly IDEMPOTENCY_TTL = 86400; // 24 hours

    constructor(
        private dataSource: DataSource,
        private employeeRepo: EmployeeRepository,
        private leaveRepo: LeaveRequestRepository,
    ) {}

    /**
     * Removes cached employee data for a department.
     * Ensures consistency when leave requests affect department data views.
     */
    private async invalidateDepartmentEmployeeCaches(departmentId: string) {
        if (!departmentId) return;
        const keys = await redisClient.keys(`departments:${departmentId}:employees*`);
        if (keys.length) await redisClient.del(keys);
    }

    /**
     * Creates a new leave request within a transaction.
     * Enforces idempotency and invalidates related caches upon success.
     * Publishes short-duration leave requests to the queue for async processing.
     */
    async createLeaveRequest(
        payload: LeaveRequestInsert,
        idempotencyKey: string,
    ): Promise<ILeaveRequest> {
        const idempotencyRedisKey = `idempotency:leaverequest:create:${idempotencyKey}`;

        // Prevent duplicate execution using the same idempotency key
        const existing = await redisClient.get(idempotencyRedisKey);
        if (existing) {
            throw new ConflictError("Duplicate request: operation already performed with this idempotency key");
        }

        // Validate that the employee exists before creating the leave request
        const employee = await this.employeeRepo.getEmployeeById(payload.employeeId);
        if (!employee) {
            throw new NotFoundError(`Employee with ID ${payload.employeeId} not found`);
        }

        // Additional validation: Check if dates are valid
        if (payload.startDate >= payload.endDate) {
            throw new BadRequestError("End date must be after start date");
        }

        // Perform transactional creation
        const created = await this.dataSource.transaction(async (manager) => {
            const transactionalLeaveRepo = new LeaveRequestRepository(manager.getRepository(LeaveRequest));
            return await transactionalLeaveRepo.createRequest(payload);
        });

        // Record idempotency key after success
        await redisClient.setEx(
            idempotencyRedisKey,
            this.IDEMPOTENCY_TTL,
            JSON.stringify({ leaveRequestId: created.id, createdAt: new Date() }),
        );

        // Invalidate caches tied to employee's department
        // We already fetched the employee above, so we can use it directly
        if (employee.departmentId) {
            await this.invalidateDepartmentEmployeeCaches(employee.departmentId);
        }

        // If leave duration < 2 days, send message to processing queue
        const leaveDuration = payload.endDate.getTime() - payload.startDate.getTime();
        if (leaveDuration < 2 * 24 * 60 * 60 * 1000) {
            sendMessageToQueue({ idempotencyKey, leaveId: created.id });
        }

        return created;
    }

    /**
     * Updates the status of an existing leave request (PENDING → APPROVED/REJECTED).
     * Uses idempotency to prevent double updates and clears affected caches after commit.
     */
    async updateStatus(
        id: string,
        status: "PENDING" | "APPROVED" | "REJECTED",
        idempotencyKey: string,
    ) {
        const idempotencyRedisKey = `idempotency:leaverequest:update:${idempotencyKey}`;
        const existing = await redisClient.get(idempotencyRedisKey);
        if (existing) {
            throw new ConflictError("Duplicate request: operation already performed with this idempotency key");
        }

        // Validate that the leave request exists before updating
        const existingRequest = await this.leaveRepo.findById(id);
        if (!existingRequest) {
            throw new Error(`Leave request with ID ${id} not found`);
        }

        // Validate status transition
        if (existingRequest.status !== "PENDING") {
            throw new BadRequestError(
                `Cannot update leave request status from ${existingRequest.status} to ${status}. Only PENDING requests can be updated.`
            );
        }

        const updated = await this.dataSource.transaction(async (manager) => {
            const transactionalLeaveRepo = new LeaveRequestRepository(manager.getRepository(LeaveRequest));
            return await transactionalLeaveRepo.updateStatus(id, status);
        });

        if (!updated) return null;

        await redisClient.setEx(
            idempotencyRedisKey,
            this.IDEMPOTENCY_TTL,
            JSON.stringify({
                leaveRequestId: updated.id,
                updatedAt: new Date(),
                status,
            }),
        );

        const employee = await this.employeeRepo.getEmployeeById(updated.employeeId);
        if (employee?.departmentId) {
            await this.invalidateDepartmentEmployeeCaches(employee.departmentId);
        }

        return updated;
    }

    /**
     * Deletes a leave request transactionally.
     * Ensures idempotency and invalidates caches related to the affected department.
     */
    async deleteLeaveRequest(id: string, idempotencyKey: string) {
        const idempotencyRedisKey = `idempotency:leaverequest:delete:${idempotencyKey}`;

        const existing = await redisClient.get(idempotencyRedisKey);
        if (existing) {
            throw new Error("Duplicate request: operation already performed with this idempotency key");
        }

        // Validate that the leave request exists before deleting
        const existingRequest = await this.leaveRepo.findById(id);
        if (!existingRequest) {
            throw new Error(`Leave request with ID ${id} not found`);
        }

        let employeeId: string | undefined;

        await this.dataSource.transaction(async (manager) => {
            const transactionalLeaveRepo = new LeaveRequestRepository(manager.getRepository(LeaveRequest));
            
            employeeId = existingRequest.employeeId;
            await transactionalLeaveRepo.deleteRequest(id);
        });

        await redisClient.setEx(
            idempotencyRedisKey,
            this.IDEMPOTENCY_TTL,
            JSON.stringify({ leaveRequestId: id, deletedAt: new Date() }),
        );

        if (employeeId) {
            const employee = await this.employeeRepo.getEmployeeById(employeeId);
            if (employee?.departmentId) {
                await this.invalidateDepartmentEmployeeCaches(employee.departmentId);
            }
        }
    }
}