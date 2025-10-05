import { DataSource } from "typeorm";
import { DepartmentService } from "../../../src/services/department.service";
import redisClient from "../../../src/config/redis";
import { EmployeeRepository } from "../../../src/repositories/employee.repository";
import { DepartmentRepository } from "../../../src/repositories/department.repository";
import { Department } from "../../../src/entities/departement.entity";
import { Employee } from "../../../src/interfaces/employee.interface";

jest.mock("../../../src/config/redis", () => ({
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
}));

// Mock the DepartmentRepository constructor
jest.mock("../../../src/repositories/department.repository");

describe("DepartmentService", () => {
    let service: DepartmentService;
    let departmentRepo: jest.Mocked<DepartmentRepository>;
    let employeeRepo: jest.Mocked<EmployeeRepository>;
    let dataSource: jest.Mocked<DataSource>;

    beforeEach(() => {
        departmentRepo = {
            createDepartment: jest.fn(),
            getAllDepartments: jest.fn(),
            db: { target: Department }, // Add db property with target
        } as any;

        employeeRepo = {
            getAllEmployees: jest.fn(),
        } as any;

        dataSource = {
            transaction: jest.fn(),
        } as any;

        service = new DepartmentService(dataSource, departmentRepo, employeeRepo);
        jest.clearAllMocks();
    });

    describe("createDepartment", () => {
        it("should create department with idempotency key and invalidate cache", async () => {
            const mockDepartment = {
                id: "dep-1",
                name: "HR",
                createdAt: new Date(),
            };
            const idempotencyKey = "unique-key-123";

            // Mock DepartmentRepository constructor to return a mock instance
            const mockRepoInstance = {
                createDepartment: jest.fn().mockResolvedValue(mockDepartment),
            };
            (
                DepartmentRepository as jest.MockedClass<typeof DepartmentRepository>
            ).mockImplementation(() => mockRepoInstance as any);

            // Mock transaction to execute the callback
            (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
                const mockManager = {
                    getRepository: jest.fn().mockReturnValue({}),
                };
                return await callback(mockManager);
            });

            // Mock Redis operations
            (redisClient.get as jest.Mock).mockResolvedValue(null); // No existing idempotency key
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");
            (redisClient.del as jest.Mock).mockResolvedValue(1);

            const result = await service.createDepartment("HR", idempotencyKey);

            expect(result).toEqual(mockDepartment);
            expect(redisClient.get).toHaveBeenCalledWith(
                `idempotency:department:${idempotencyKey}`,
            );
            expect(mockRepoInstance.createDepartment).toHaveBeenCalledWith("HR");
            expect(redisClient.setEx).toHaveBeenCalledWith(
                `idempotency:department:${idempotencyKey}`,
                86400,
                expect.stringContaining("dep-1"),
            );
            expect(redisClient.del).toHaveBeenCalledWith("departments:all");
            expect(dataSource.transaction).toHaveBeenCalled();
        });

        it("should throw error if idempotency key already exists", async () => {
            const idempotencyKey = "duplicate-key-456";
            const existingData = JSON.stringify({ departmentId: "dep-1", createdAt: new Date() });

            (redisClient.get as jest.Mock).mockResolvedValue(existingData);

            await expect(service.createDepartment("HR", idempotencyKey)).rejects.toThrow(
                "Duplicate request: operation already performed with this idempotency key",
            );

            expect(redisClient.get).toHaveBeenCalledWith(
                `idempotency:department:${idempotencyKey}`,
            );
            expect(dataSource.transaction).not.toHaveBeenCalled();
            expect(redisClient.del).not.toHaveBeenCalled();
        });

        it("should not invalidate cache if transaction fails", async () => {
            const idempotencyKey = "unique-key-789";
            const error = new Error("Database error");

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            (dataSource.transaction as jest.Mock).mockRejectedValue(error);

            await expect(service.createDepartment("HR", idempotencyKey)).rejects.toThrow(
                "Database error",
            );
            expect(redisClient.setEx).not.toHaveBeenCalled(); // Should not save idempotency key
            expect(redisClient.del).not.toHaveBeenCalled();
        });

        it("should handle different idempotency keys for same department name", async () => {
            const mockDepartment1 = { id: "dep-1", name: "HR", createdAt: new Date() };
            const mockDepartment2 = { id: "dep-2", name: "HR", createdAt: new Date() };

            const mockRepoInstance = {
                createDepartment: jest
                    .fn()
                    .mockResolvedValueOnce(mockDepartment1)
                    .mockResolvedValueOnce(mockDepartment2),
            };
            (
                DepartmentRepository as jest.MockedClass<typeof DepartmentRepository>
            ).mockImplementation(() => mockRepoInstance as any);

            (dataSource.transaction as jest.Mock).mockImplementation(async (callback) => {
                const mockManager = {
                    getRepository: jest.fn().mockReturnValue({}),
                };
                return await callback(mockManager);
            });

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");
            (redisClient.del as jest.Mock).mockResolvedValue(1);

            const result1 = await service.createDepartment("HR", "key-1");
            const result2 = await service.createDepartment("HR", "key-2");

            expect(result1.id).toBe("dep-1");
            expect(result2.id).toBe("dep-2");
            expect(redisClient.setEx).toHaveBeenCalledTimes(2);
        });
    });

    describe("listDepartments", () => {
        it("should return cached departments if available", async () => {
            const departments = [{ id: "dep-1", name: "HR", createdAt: new Date() }];
            const cached = JSON.stringify(departments);
            (redisClient.get as jest.Mock).mockResolvedValue(cached);

            const result: Employee[] = await service.listDepartments();

            expect(result[0].id).toEqual(departments[0].id);
            expect(redisClient.get).toHaveBeenCalledWith("departments:all");
            expect(departmentRepo.getAllDepartments).not.toHaveBeenCalled();
        });

        it("should fetch from repo and cache if not in cache", async () => {
            const departments = [
                { id: "dep-1", name: "HR", createdAt: new Date() },
                { id: "dep-2", name: "Finance", createdAt: new Date() },
            ];
            (redisClient.get as jest.Mock).mockResolvedValue(null);
            departmentRepo.getAllDepartments.mockResolvedValue(departments);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            const result = await service.listDepartments();

            expect(result).toEqual(departments);
            expect(departmentRepo.getAllDepartments).toHaveBeenCalled();
            expect(redisClient.setEx).toHaveBeenCalledWith(
                "departments:all",
                60,
                JSON.stringify(departments),
            );
        });

        it("should handle empty departments list", async () => {
            (redisClient.get as jest.Mock).mockResolvedValue(null);
            departmentRepo.getAllDepartments.mockResolvedValue([]);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            const result = await service.listDepartments();

            expect(result).toEqual([]);
            expect(redisClient.setEx).toHaveBeenCalledWith(
                "departments:all",
                60,
                JSON.stringify([]),
            );
        });
    });

    describe("listEmployeesInDepartment", () => {
        it("should return cached employees if available", async () => {
            const cacheKey = "departments:dep-1:employees:page=1&limit=10";
            const cachedData = {
                data: [{ id: "emp-1", name: "Alice" }],
                count: 1,
                page: 1,
                limit: 10,
            };
            const cached = JSON.stringify(cachedData);
            (redisClient.get as jest.Mock).mockResolvedValue(cached);

            const result = await service.listEmployeesInDepartment("dep-1");

            expect(result).toEqual(cachedData);
            expect(redisClient.get).toHaveBeenCalledWith(cacheKey);
            expect(employeeRepo.getAllEmployees).not.toHaveBeenCalled();
        });

        it("should fetch employees, filter, paginate, and cache if not in cache", async () => {
            const employees = [
                {
                    id: "emp-1",
                    name: "Alice",
                    email: "alice@test.com",
                    departmentId: "dep-1",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: "emp-2",
                    name: "Bob",
                    email: "bob@test.com",
                    departmentId: "dep-2",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
                {
                    id: "emp-3",
                    name: "Charlie",
                    email: "charlie@test.com",
                    departmentId: "dep-1",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];
            (redisClient.get as jest.Mock).mockResolvedValue(null);
            employeeRepo.getAllEmployees.mockResolvedValue(employees);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            const result = await service.listEmployeesInDepartment("dep-1", 1, 1);

            expect(result.data.length).toBe(1); // 1 employee per page
            expect(result.data[0].id).toBe("emp-1"); // First employee in dep-1
            expect(result.count).toBe(2); // 2 total employees in dep-1
            expect(result.page).toBe(1);
            expect(result.limit).toBe(1);

            expect(redisClient.setEx).toHaveBeenCalledWith(
                "departments:dep-1:employees:page=1&limit=1",
                60,
                JSON.stringify(result),
            );
        });

        it("should handle pagination correctly", async () => {
            const employees = Array.from({ length: 15 }, (_, i) => ({
                id: `emp-${i + 1}`,
                name: `Employee ${i + 1}`,
                email: `emp${i + 1}@test.com`,
                departmentId: "dep-1",
                createdAt: new Date(),
                updatedAt: new Date(),
            }));

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            employeeRepo.getAllEmployees.mockResolvedValue(employees);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            // Page 2 with limit 5
            const result = await service.listEmployeesInDepartment("dep-1", 2, 5);

            expect(result.data.length).toBe(5);
            expect(result.data[0].id).toBe("emp-6"); // Should start from 6th employee
            expect(result.data[4].id).toBe("emp-10"); // Should end at 10th employee
            expect(result.count).toBe(15);
            expect(result.page).toBe(2);
            expect(result.limit).toBe(5);
        });

        it("should return empty array for non-existent department", async () => {
            const employees = [
                {
                    id: "emp-1",
                    name: "Alice",
                    email: "alice@test.com",
                    departmentId: "dep-1",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            employeeRepo.getAllEmployees.mockResolvedValue(employees);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            const result = await service.listEmployeesInDepartment("dep-999", 1, 10);

            expect(result.data).toEqual([]);
            expect(result.count).toBe(0);
            expect(result.page).toBe(1);
            expect(result.limit).toBe(10);
        });

        it("should handle default pagination parameters", async () => {
            const employees = [
                {
                    id: "emp-1",
                    name: "Alice",
                    email: "alice@test.com",
                    departmentId: "dep-1",
                    createdAt: new Date(),
                    updatedAt: new Date(),
                },
            ];

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            employeeRepo.getAllEmployees.mockResolvedValue(employees);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            // Call without page and limit (should use defaults: page=1, limit=10)
            const result = await service.listEmployeesInDepartment("dep-1");

            expect(result.page).toBe(1);
            expect(result.limit).toBe(10);
            expect(redisClient.get).toHaveBeenCalledWith(
                "departments:dep-1:employees:page=1&limit=10",
            );
        });
    });
});
