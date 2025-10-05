import request from "supertest";
import redisClient from "../../src/config/redis";
import sendMessageToQueue from "../../src/queue/producer.leaveRequest";
import { AppDataSource } from "../../src/config/datasource";

// Mock RabbitMQ producer
jest.mock("../../src/queue/producer.leaveRequest", () => jest.fn());

// Mock redis
jest.mock("../../src/config/redis", () => ({
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
}));

// Mock AppDataSource BEFORE importing app
jest.mock("../../src/config/datasource", () => {
    const mockEmployeeRepo = {
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    };

    const mockLeaveRepo = {
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    };

    const mockDepartmentRepo = {
        save: jest.fn(),
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
    };

    return {
        AppDataSource: {
            getRepository: jest.fn((entity: any) => {
                // Return different mocks based on entity type
                if (entity.name === 'Employee') return mockEmployeeRepo;
                if (entity.name === 'LeaveRequest') return mockLeaveRepo;
                if (entity.name === 'Department') return mockDepartmentRepo;
                return mockEmployeeRepo; // default
            }),
            transaction: jest.fn(),
            isInitialized: true,
        },
        // Export the mocks so tests can access them
        __mockEmployeeRepo: mockEmployeeRepo,
        __mockLeaveRepo: mockLeaveRepo,
        __mockDepartmentRepo: mockDepartmentRepo,
    };
});

// Import app AFTER mocks are set up
import app from "../../src/app";
import { Employee } from "../../src/entities/employee.entity";
import { LeaveRequest } from "../../src/entities/leaveRequest.entity";

describe("Integration Test: Employee & Leave Request", () => {
    const mockDataSource = require("../../src/config/datasource");
    const mockEmployeeRepo = mockDataSource.__mockEmployeeRepo;
    const mockLeaveRepo = mockDataSource.__mockLeaveRepo;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("POST /employees", () => {
        it("should create an employee and return 201", async () => {
            const mockEmployee = {
                id: "123e4567-e89b-12d3-a456-426614174001",
                name: "John Doe",
                email: "john.doe@example.com",
                updatedAt: new Date(),
                createdAt: new Date(),
                departmentId: "123e4567-e89b-12d3-a456-426614174000",
            };

            // Mock redis idempotency check
            (redisClient.get as jest.Mock).mockResolvedValueOnce(null);
            (redisClient.setEx as jest.Mock).mockResolvedValueOnce("OK");

            // Mock transaction to return the employee
            (AppDataSource.transaction as jest.Mock).mockImplementationOnce(async (callback) => {
                const mockManager = {
                    getRepository: jest.fn().mockReturnValue({
                        save: jest.fn().mockResolvedValue(mockEmployee),
                        create: jest.fn().mockReturnValue(mockEmployee),
                    }),
                };
                return await callback(mockManager);
            });

            const response = await request(app)
                .post("/employees")
                .send({
                    name: "John Doe",
                    email: "john.doe@example.com",
                    departmentId: "123e4567-e89b-12d3-a456-426614174000",
                })
                .set("Idempotency-Key", "unique-key-001");

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("id", mockEmployee.id);
            expect(redisClient.setEx).toHaveBeenCalled();
        });

        it("should reject duplicate idempotency key with 409", async () => {
            (redisClient.get as jest.Mock).mockResolvedValueOnce(
                JSON.stringify({ employeeId: "123e4567-e89b-12d3-a456-426614174001", createdAt: new Date() })
            );

            const response = await request(app)
                .post("/employees")
                .send({
                    name: "Jane Smith",
                    email: "jane.smith@example.com",
                    departmentId: "123e4567-e89b-12d3-a456-426614174000",
                })
                .set("Idempotency-Key", "dup-key-001");

            expect(response.status).toBe(409);
            expect(response.body.message).toMatch(/Duplicate request/i);
        });
    });

    describe("POST /leave-requests", () => {
        it("should create leave request and send to queue if < 2 days", async () => {
            const startDate = new Date("2025-10-05T00:00:00.000Z");
            const endDate = new Date("2025-10-06T00:00:00.000Z");

            const mockLeaveRequest = {
                id: "123e4567-e89b-12d3-a456-426614174002",
                employeeId: "123e4567-e89b-12d3-a456-426614174001",
                startDate,
                endDate,
                status: "PENDING",
            };

            const mockEmployee = {
                id: "123e4567-e89b-12d3-a456-426614174001",
                departmentId: "123e4567-e89b-12d3-a456-426614174000",
                name: "John Doe",
                email: "john.doe@example.com",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Mock redis
            (redisClient.get as jest.Mock).mockResolvedValueOnce(null);
            (redisClient.setEx as jest.Mock).mockResolvedValueOnce("OK");
            (redisClient.keys as jest.Mock).mockResolvedValueOnce([
                "departments:123e4567-e89b-12d3-a456-426614174000:employees:page1",
            ]);
            (redisClient.del as jest.Mock).mockResolvedValueOnce(1);

            // Mock employee lookup - findOne is called by EmployeeRepository.getEmployeeById
            mockEmployeeRepo.findOne.mockResolvedValueOnce(mockEmployee);

            // Mock transaction for leave request creation
            (AppDataSource.transaction as jest.Mock).mockImplementationOnce(async (callback) => {
                const mockManager = {
                    getRepository: jest.fn().mockReturnValue({
                        save: jest.fn().mockResolvedValue(mockLeaveRequest),
                        create: jest.fn().mockReturnValue(mockLeaveRequest),
                    }),
                };
                return await callback(mockManager);
            });

            const response = await request(app)
                .post("/leave-requests")
                .send({
                    employeeId: "123e4567-e89b-12d3-a456-426614174001",
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                })
                .set("Idempotency-Key", "unique-key-002");

            if (response.status !== 201) {
                console.log("Response:", response.status, response.body);
            }

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("id", mockLeaveRequest.id);
            expect(sendMessageToQueue).toHaveBeenCalledTimes(1);
            expect(sendMessageToQueue).toHaveBeenCalledWith({
                idempotencyKey: "unique-key-002",
                leaveId: mockLeaveRequest.id,
            });
        });

        it("should not call queue if leave duration >= 2 days", async () => {
            const startDate = new Date("2025-10-05T00:00:00.000Z");
            const endDate = new Date("2025-10-08T00:00:00.000Z");

            const mockLeaveRequest = {
                id: "123e4567-e89b-12d3-a456-426614174003",
                employeeId: "123e4567-e89b-12d3-a456-426614174001",
                startDate,
                endDate,
                status: "PENDING",
            };

            const mockEmployee = {
                id: "123e4567-e89b-12d3-a456-426614174001",
                departmentId: "123e4567-e89b-12d3-a456-426614174000",
                name: "John Doe",
                email: "john.doe@example.com",
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            // Mock redis
            (redisClient.get as jest.Mock).mockResolvedValueOnce(null);
            (redisClient.setEx as jest.Mock).mockResolvedValueOnce("OK");
            (redisClient.keys as jest.Mock).mockResolvedValueOnce([]);

            // Mock employee lookup
            mockEmployeeRepo.findOne.mockResolvedValueOnce(mockEmployee);

            // Mock transaction
            (AppDataSource.transaction as jest.Mock).mockImplementationOnce(async (callback) => {
                const mockManager = {
                    getRepository: jest.fn().mockReturnValue({
                        save: jest.fn().mockResolvedValue(mockLeaveRequest),
                        create: jest.fn().mockReturnValue(mockLeaveRequest),
                    }),
                };
                return await callback(mockManager);
            });

            const response = await request(app)
                .post("/leave-requests")
                .send({
                    employeeId: "123e4567-e89b-12d3-a456-426614174001",
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                })
                .set("Idempotency-Key", "unique-key-003");

            if (response.status !== 201) {
                console.log("Response:", response.status, response.body);
            }

            expect(response.status).toBe(201);
            expect(sendMessageToQueue).not.toHaveBeenCalled();
        });
    });
});