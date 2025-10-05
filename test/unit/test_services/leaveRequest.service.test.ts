import { DataSource } from "typeorm";
import { LeaveRequestService } from "../../../src/services/leaveRequest.service";
import redisClient from "../../../src/config/redis";
import { EmployeeRepository } from "../../../src/repositories/employee.repository";
import { LeaveRequestRepository } from "../../../src/repositories/leaveRequest.repository";
import { LeaveRequest } from "../../../src/entities/leaveRequest.entity";
import { LeaveRequestInsert } from "../../../src/interfaces/leaveRequest.interface";
import { Employee } from "../../../src/entities/employee.entity";

// Mock Redis
jest.mock("../../../src/config/redis", () => ({
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
}));

// Mock the LeaveRequestRepository constructor
jest.mock("../../../src/repositories/leaveRequest.repository");

// Mock the queue producer
jest.mock("../../../src/queue/producer.leaveRequest", () => ({
    __esModule: true,
    default: jest.fn(),
}));

describe("LeaveRequestService", () => {
    let service: LeaveRequestService;
    let dataSource: jest.Mocked<DataSource>;
    let employeeRepo: jest.Mocked<EmployeeRepository>;
    let leaveRepo: jest.Mocked<LeaveRequestRepository>;

    beforeEach(() => {
        dataSource = {
            transaction: jest.fn(),
        } as any;

        employeeRepo = {
            getEmployeeById: jest.fn(),
        } as any;

        leaveRepo = {
            createRequest: jest.fn(),
            updateStatus: jest.fn(),
            findById: jest.fn(),
            deleteRequest: jest.fn(),
        } as any;

        service = new LeaveRequestService(dataSource, employeeRepo, leaveRepo);
        jest.clearAllMocks();
    });

    describe("createLeaveRequest", () => {
        it("should create leave request in transaction and invalidate cache", async () => {
            const payload: LeaveRequestInsert = {
                employeeId: "emp-1",
                startDate: new Date("2025-01-01"),
                endDate: new Date("2025-01-05"),
            };

            const idempotencyKey = "unique-leave-key-123";

            const createdLeaveRequest = {
                id: "leave-1",
                employeeId: "emp-1",
                startDate: new Date("2025-01-01"),
                endDate: new Date("2025-01-05"),
                status: "PENDING",
            } as LeaveRequest;

            const mockEmployee = {
                id: "emp-1",
                name: "John",
                email: "john@test.com",
                departmentId: "dep-1",
            } as Employee;

            // Mock LeaveRequestRepository instance
            const mockRepoInstance = {
                createRequest: jest.fn().mockResolvedValue(createdLeaveRequest),
            };
            (
                LeaveRequestRepository as jest.MockedClass<typeof LeaveRequestRepository>
            ).mockImplementation(() => mockRepoInstance as any);

            // Mock transaction
            (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
                const mockManager = {
                    getRepository: jest.fn().mockReturnValue({}),
                };
                return await callback(mockManager);
            });

            // Mock idempotency check and storage
            (redisClient.get as jest.Mock).mockResolvedValue(null);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            // Mock employee lookup and cache invalidation
            employeeRepo.getEmployeeById.mockResolvedValue(mockEmployee);
            (redisClient.keys as jest.Mock).mockResolvedValue([
                "departments:dep-1:employees:page=1&limit=10",
                "departments:dep-1:employeesWithLeaves:page=1&limit=10",
            ]);
            (redisClient.del as jest.Mock).mockResolvedValue(2);

            const result = await service.createLeaveRequest(payload, idempotencyKey);

            expect(result).toEqual(createdLeaveRequest);
            expect(redisClient.get).toHaveBeenCalledWith(
                `idempotency:leaverequest:create:${idempotencyKey}`
            );
            expect(dataSource.transaction).toHaveBeenCalled();
            expect(mockRepoInstance.createRequest).toHaveBeenCalledWith(payload);
            expect(redisClient.setEx).toHaveBeenCalledWith(
                `idempotency:leaverequest:create:${idempotencyKey}`,
                86400,
                expect.stringContaining("leave-1")
            );
            expect(employeeRepo.getEmployeeById).toHaveBeenCalledWith("emp-1");
            expect(redisClient.keys).toHaveBeenCalledWith("departments:dep-1:employees*");
            expect(redisClient.del).toHaveBeenCalledWith([
                "departments:dep-1:employees:page=1&limit=10",
                "departments:dep-1:employeesWithLeaves:page=1&limit=10",
            ]);
        });

        it("should throw error if idempotency key already exists", async () => {
            const payload: LeaveRequestInsert = {
                employeeId: "emp-1",
                startDate: new Date("2025-01-01"),
                endDate: new Date("2025-01-05"),
            };

            const idempotencyKey = "duplicate-leave-key";
            const existingData = JSON.stringify({
                leaveRequestId: "leave-1",
                createdAt: new Date(),
            });

            (redisClient.get as jest.Mock).mockResolvedValue(existingData);

            await expect(
                service.createLeaveRequest(payload, idempotencyKey)
            ).rejects.toThrow(
                "Duplicate request: operation already performed with this idempotency key"
            );

            expect(redisClient.get).toHaveBeenCalledWith(
                `idempotency:leaverequest:create:${idempotencyKey}`
            );
            expect(dataSource.transaction).not.toHaveBeenCalled();
            expect(redisClient.setEx).not.toHaveBeenCalled();
        });

        it("should throw error if employee not found", async () => {
            const payload: LeaveRequestInsert = {
                employeeId: "emp-999",
                startDate: new Date("2025-01-01"),
                endDate: new Date("2025-01-05"),
            };

            const idempotencyKey = "key-emp-not-found";

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            employeeRepo.getEmployeeById.mockResolvedValue(null);

            await expect(
                service.createLeaveRequest(payload, idempotencyKey)
            ).rejects.toThrow("Employee with ID emp-999 not found");

            expect(employeeRepo.getEmployeeById).toHaveBeenCalledWith("emp-999");
            expect(dataSource.transaction).not.toHaveBeenCalled();
            expect(redisClient.setEx).not.toHaveBeenCalled();
        });

        it("should throw error if end date is before start date", async () => {
            const payload: LeaveRequestInsert = {
                employeeId: "emp-1",
                startDate: new Date("2025-01-05"),
                endDate: new Date("2025-01-01"),
            };

            const idempotencyKey = "key-invalid-dates";
            const mockEmployee = {
                id: "emp-1",
                name: "John",
                departmentId: "dep-1",
            } as Employee;

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            employeeRepo.getEmployeeById.mockResolvedValue(mockEmployee);

            await expect(
                service.createLeaveRequest(payload, idempotencyKey)
            ).rejects.toThrow("End date must be after start date");

            expect(dataSource.transaction).not.toHaveBeenCalled();
        });

        it("should rollback transaction if creation fails", async () => {
            const payload: LeaveRequestInsert = {
                employeeId: "emp-1",
                startDate: new Date("2025-01-01"),
                endDate: new Date("2025-01-05"),
            };

            const idempotencyKey = "key-transaction-fail";
            const mockEmployee = {
                id: "emp-1",
                departmentId: "dep-1",
            } as Employee;
            const error = new Error("Database error");

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            employeeRepo.getEmployeeById.mockResolvedValue(mockEmployee);
            (dataSource.transaction as jest.Mock).mockRejectedValue(error);

            await expect(
                service.createLeaveRequest(payload, idempotencyKey)
            ).rejects.toThrow("Database error");
            
            expect(employeeRepo.getEmployeeById).toHaveBeenCalledWith("emp-1");
            expect(redisClient.setEx).not.toHaveBeenCalled();
            expect(redisClient.del).not.toHaveBeenCalled();
        });

    });

    describe("updateStatus", () => {
        it("should update status in transaction and invalidate cache", async () => {
            const idempotencyKey = "update-status-key-123";
            const existingRequest = {
                id: "leave-1",
                employeeId: "emp-1",
                status: "PENDING",
                startDate: new Date("2025-01-01"),
                endDate: new Date("2025-01-05"),
            } as LeaveRequest;

            const updatedLeaveRequest = {
                ...existingRequest,
                status: "APPROVED",
            } as LeaveRequest;

            const mockEmployee = {
                id: "emp-1",
                name: "John",
                departmentId: "dep-1",
            } as Employee;

            const mockRepoInstance = {
                updateStatus: jest.fn().mockResolvedValue(updatedLeaveRequest),
            };
            (LeaveRequestRepository as jest.MockedClass<typeof LeaveRequestRepository>)
                .mockImplementation(() => mockRepoInstance as any);

            (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
                const mockManager = { getRepository: jest.fn().mockReturnValue({}) };
                return await callback(mockManager);
            });

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");
            leaveRepo.findById.mockResolvedValue(existingRequest);
            employeeRepo.getEmployeeById.mockResolvedValue(mockEmployee);
            (redisClient.keys as jest.Mock).mockResolvedValue([
                "departments:dep-1:employeesWithLeaves:page=1&limit=10",
            ]);
            (redisClient.del as jest.Mock).mockResolvedValue(1);

            const result = await service.updateStatus("leave-1", "APPROVED", idempotencyKey);

            expect(result).toEqual(updatedLeaveRequest);
            expect(leaveRepo.findById).toHaveBeenCalledWith("leave-1");
            expect(redisClient.get).toHaveBeenCalledWith(
                `idempotency:leaverequest:update:${idempotencyKey}`
            );
            expect(dataSource.transaction).toHaveBeenCalled();
            expect(mockRepoInstance.updateStatus).toHaveBeenCalledWith("leave-1", "APPROVED");
            expect(redisClient.setEx).toHaveBeenCalledWith(
                `idempotency:leaverequest:update:${idempotencyKey}`,
                86400,
                expect.stringContaining("APPROVED")
            );
            expect(employeeRepo.getEmployeeById).toHaveBeenCalledWith("emp-1");
            expect(redisClient.keys).toHaveBeenCalledWith("departments:dep-1:employees*");
            expect(redisClient.del).toHaveBeenCalled();
        });

        it("should throw error if idempotency key already exists", async () => {
            const idempotencyKey = "duplicate-update-key";
            const existingData = JSON.stringify({
                leaveRequestId: "leave-1",
                updatedAt: new Date(),
                status: "APPROVED",
            });

            (redisClient.get as jest.Mock).mockResolvedValue(existingData);

            await expect(
                service.updateStatus("leave-1", "APPROVED", idempotencyKey)
            ).rejects.toThrow(
                "Duplicate request: operation already performed with this idempotency key"
            );

            expect(redisClient.get).toHaveBeenCalledWith(
                `idempotency:leaverequest:update:${idempotencyKey}`
            );
            expect(leaveRepo.findById).not.toHaveBeenCalled();
            expect(dataSource.transaction).not.toHaveBeenCalled();
        });

        it("should throw error if leave request not found", async () => {
            const idempotencyKey = "key-not-found";

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            leaveRepo.findById.mockResolvedValue(null);

            await expect(
                service.updateStatus("leave-999", "APPROVED", idempotencyKey)
            ).rejects.toThrow("Leave request with ID leave-999 not found");

            expect(leaveRepo.findById).toHaveBeenCalledWith("leave-999");
            expect(dataSource.transaction).not.toHaveBeenCalled();
            expect(employeeRepo.getEmployeeById).not.toHaveBeenCalled();
            expect(redisClient.setEx).not.toHaveBeenCalled();
        });

        it("should throw error if status is not PENDING", async () => {
            const idempotencyKey = "key-wrong-status";
            const existingRequest = {
                id: "leave-1",
                employeeId: "emp-1",
                status: "APPROVED",
            } as LeaveRequest;

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            leaveRepo.findById.mockResolvedValue(existingRequest);

            await expect(
                service.updateStatus("leave-1", "REJECTED", idempotencyKey)
            ).rejects.toThrow(
                "Cannot update leave request status from APPROVED to REJECTED. Only PENDING requests can be updated."
            );

            expect(leaveRepo.findById).toHaveBeenCalledWith("leave-1");
            expect(dataSource.transaction).not.toHaveBeenCalled();
        });

        it("should handle REJECTED status", async () => {
            const idempotencyKey = "reject-key-123";
            const existingRequest = {
                id: "leave-1",
                employeeId: "emp-1",
                status: "PENDING",
            } as LeaveRequest;

            const updatedLeaveRequest = {
                ...existingRequest,
                status: "REJECTED",
            } as LeaveRequest;

            const mockEmployee = {
                id: "emp-1",
                departmentId: "dep-1",
            } as Employee;

            const mockRepoInstance = {
                updateStatus: jest.fn().mockResolvedValue(updatedLeaveRequest),
            };
            (LeaveRequestRepository as jest.MockedClass<typeof LeaveRequestRepository>)
                .mockImplementation(() => mockRepoInstance as any);

            (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
                const mockManager = { getRepository: jest.fn().mockReturnValue({}) };
                return await callback(mockManager);
            });

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");
            leaveRepo.findById.mockResolvedValue(existingRequest);
            employeeRepo.getEmployeeById.mockResolvedValue(mockEmployee);
            (redisClient.keys as jest.Mock).mockResolvedValue([]);

            const result = await service.updateStatus("leave-1", "REJECTED", idempotencyKey);

            expect(result).toEqual(updatedLeaveRequest);
            expect(leaveRepo.findById).toHaveBeenCalledWith("leave-1");
            expect(mockRepoInstance.updateStatus).toHaveBeenCalledWith("leave-1", "REJECTED");
            expect(redisClient.setEx).toHaveBeenCalled();
            expect(redisClient.del).not.toHaveBeenCalled();
        });

        it("should return null if transaction returns null", async () => {
            const idempotencyKey = "key-transaction-null";
            const existingRequest = {
                id: "leave-1",
                employeeId: "emp-1",
                status: "PENDING",
            } as LeaveRequest;

            const mockRepoInstance = {
                updateStatus: jest.fn().mockResolvedValue(null),
            };
            (LeaveRequestRepository as jest.MockedClass<typeof LeaveRequestRepository>)
                .mockImplementation(() => mockRepoInstance as any);

            (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
                const mockManager = { getRepository: jest.fn().mockReturnValue({}) };
                return await callback(mockManager);
            });

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            leaveRepo.findById.mockResolvedValue(existingRequest);

            const result = await service.updateStatus("leave-1", "APPROVED", idempotencyKey);

            expect(result).toBeNull();
            expect(employeeRepo.getEmployeeById).not.toHaveBeenCalled();
            expect(redisClient.setEx).not.toHaveBeenCalled();
        });
    });
});