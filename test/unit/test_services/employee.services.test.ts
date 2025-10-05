import { EmployeeService } from "../../../src/services/employee.service";
import { DataSource } from "typeorm";
import { EmployeeRepository } from "../../../src/repositories/employee.repository";
import { DepartmentRepository } from "../../../src/repositories/department.repository";
import redisClient from "../../../src/config/redis";
import { LeaveRequestRepository } from "../../../src/repositories/leaveRequest.repository";
import { Employee } from "../../../src/entities/employee.entity";
import { Department } from "../../../src/entities/departement.entity";
import { EmployeeInsert } from "../../../src/interfaces/employee.interface";

// Mock Redis
jest.mock("../../../src/config/redis", () => ({
    get: jest.fn(),
    setEx: jest.fn(),
    del: jest.fn(),
    keys: jest.fn(),
}));

// Mock Employee entity to avoid issues with instantiation
jest.mock("../../../src/entities/employee.entity", () => ({
    Employee: jest.fn(),
}));

// Mock EmployeeRepository constructor
jest.mock("../../../src/repositories/employee.repository");
jest.mock("../../../src/repositories/department.repository");

// Fake repositories
const mockEmployeeRepo = {
    createEmployee: jest.fn(),
    getAllEmployees: jest.fn(),
    getEmployeeById: jest.fn(),
    getEmployeeByEmail: jest.fn(),
} as unknown as jest.Mocked<EmployeeRepository>;

const mockLeaveRequestRepo = {
    findByEmployee: jest.fn(),
} as unknown as jest.Mocked<LeaveRequestRepository>;

const mockDepartmentRepo = {
    getDepartmentById: jest.fn(),
    getAllDepartments: jest.fn(),
} as unknown as jest.Mocked<DepartmentRepository>;

// Fake datasource
const mockDataSource = {
    transaction: jest.fn(),
} as unknown as jest.Mocked<DataSource>;

describe("EmployeeService", () => {
    let service: EmployeeService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new EmployeeService(
            mockDataSource,
            mockEmployeeRepo,
            mockLeaveRequestRepo,
            mockDepartmentRepo,
        );
    });

    describe("createEmployee", () => {
        it("should create employee inside a transaction and invalidate cache", async () => {
            const employeeInfo: EmployeeInsert = {
                name: "John",
                email: "j@test.com",
                departmentId: "dep1",
            };

            const idempotencyKey = "unique-emp-key-123";

            const createdEmployee = {
                id: "1",
                name: "John",
                email: "j@test.com",
                departmentId: "dep1",
            } as Employee;

            const mockDepartment = {
                id: "dep1",
                name: "Engineering",
            } as Department;

            // Mock EmployeeRepository instance
            const mockRepoInstance = {
                createEmployee: jest.fn().mockResolvedValue(createdEmployee),
            };
            (EmployeeRepository as jest.MockedClass<typeof EmployeeRepository>).mockImplementation(
                () => mockRepoInstance as any,
            );

            // Mock department validation
            mockDepartmentRepo.getDepartmentById.mockResolvedValue(mockDepartment);
            mockEmployeeRepo.getEmployeeByEmail.mockResolvedValue(null);

            // Mock transaction to execute callback
            mockDataSource.transaction.mockImplementation(async (callback: any) => {
                const mockManager = {
                    getRepository: jest.fn().mockReturnValue({}),
                };
                return await callback(mockManager);
            });

            // Mock idempotency check and storage
            (redisClient.get as jest.Mock).mockResolvedValue(null);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            // Mock Redis operations for cache invalidation
            (redisClient.keys as jest.Mock).mockResolvedValue([
                "departments:dep1:employees:page1",
                "departments:dep1:employeesWithLeaves:page=1&limit=10",
            ]);
            (redisClient.del as jest.Mock).mockResolvedValue(2);

            const result = await service.createEmployee(employeeInfo, idempotencyKey);

            expect(result).toEqual(createdEmployee);
            expect(mockDepartmentRepo.getDepartmentById).toHaveBeenCalledWith("dep1");
            expect(mockEmployeeRepo.getEmployeeByEmail).toHaveBeenCalledWith("j@test.com");
            expect(redisClient.get).toHaveBeenCalledWith(`idempotency:employee:${idempotencyKey}`);
            expect(mockDataSource.transaction).toHaveBeenCalled();
            expect(mockRepoInstance.createEmployee).toHaveBeenCalledWith(employeeInfo);
            expect(redisClient.setEx).toHaveBeenCalledWith(
                `idempotency:employee:${idempotencyKey}`,
                86400,
                expect.stringContaining('"employeeId":"1"'),
            );
            expect(redisClient.keys).toHaveBeenCalledWith("departments:dep1:employees*");
            expect(redisClient.del).toHaveBeenCalledWith([
                "departments:dep1:employees:page1",
                "departments:dep1:employeesWithLeaves:page=1&limit=10",
            ]);
        });

        it("should throw error if department does not exist", async () => {
            const employeeInfo: EmployeeInsert = {
                name: "John",
                email: "j@test.com",
                departmentId: "invalid-dept",
            };

            const idempotencyKey = "unique-emp-key-123";

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            mockDepartmentRepo.getDepartmentById.mockResolvedValue(null);

            await expect(service.createEmployee(employeeInfo, idempotencyKey)).rejects.toThrow(
                "Department with ID invalid-dept not found",
            );

            expect(mockDepartmentRepo.getDepartmentById).toHaveBeenCalledWith("invalid-dept");
            expect(mockDataSource.transaction).not.toHaveBeenCalled();
        });

        it("should throw error for invalid email format", async () => {
            const employeeInfo: EmployeeInsert = {
                name: "John",
                email: "invalid-email",
                departmentId: "dep1",
            };

            const idempotencyKey = "unique-emp-key-123";
            const mockDepartment = { id: "dep1", name: "Engineering" } as Department;

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            mockDepartmentRepo.getDepartmentById.mockResolvedValue(mockDepartment);

            await expect(service.createEmployee(employeeInfo, idempotencyKey)).rejects.toThrow(
                "Invalid email format",
            );

            expect(mockDataSource.transaction).not.toHaveBeenCalled();
        });

        it("should throw error if email already exists", async () => {
            const employeeInfo: EmployeeInsert = {
                name: "John",
                email: "existing@test.com",
                departmentId: "dep1",
            };

            const idempotencyKey = "unique-emp-key-123";
            const mockDepartment = { id: "dep1", name: "Engineering" } as Department;
            const existingEmployee = {
                id: "2",
                email: "existing@test.com",
            } as Employee;

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            mockDepartmentRepo.getDepartmentById.mockResolvedValue(mockDepartment);
            mockEmployeeRepo.getEmployeeByEmail.mockResolvedValue(existingEmployee);

            await expect(service.createEmployee(employeeInfo, idempotencyKey)).rejects.toThrow(
                "Employee with email existing@test.com already exists",
            );

            expect(mockEmployeeRepo.getEmployeeByEmail).toHaveBeenCalledWith("existing@test.com");
            expect(mockDataSource.transaction).not.toHaveBeenCalled();
        });

        it("should throw error if idempotency key already exists", async () => {
            const employeeInfo: EmployeeInsert = {
                name: "John",
                email: "j@test.com",
                departmentId: "dep1",
            };

            const idempotencyKey = "duplicate-emp-key";
            const existingData = JSON.stringify({
                employeeId: "1",
                createdAt: new Date(),
            });

            (redisClient.get as jest.Mock).mockResolvedValue(existingData);

            await expect(service.createEmployee(employeeInfo, idempotencyKey)).rejects.toThrow(
                "Duplicate request: operation already performed with this idempotency key",
            );

            expect(redisClient.get).toHaveBeenCalledWith(`idempotency:employee:${idempotencyKey}`);
            expect(mockDepartmentRepo.getDepartmentById).not.toHaveBeenCalled();
            expect(mockDataSource.transaction).not.toHaveBeenCalled();
            expect(redisClient.setEx).not.toHaveBeenCalled();
        });

        it("should create employee even if cache invalidation has no keys", async () => {
            const employeeInfo: EmployeeInsert = {
                name: "John",
                email: "j@test.com",
                departmentId: "dep1",
            };

            const idempotencyKey = "key-no-cache";

            const createdEmployee = {
                id: "1",
                name: "John",
                email: "j@test.com",
                departmentId: "dep1",
            } as Employee;

            const mockDepartment = { id: "dep1", name: "Engineering" } as Department;

            const mockRepoInstance = {
                createEmployee: jest.fn().mockResolvedValue(createdEmployee),
            };
            (EmployeeRepository as jest.MockedClass<typeof EmployeeRepository>).mockImplementation(
                () => mockRepoInstance as any,
            );

            mockDepartmentRepo.getDepartmentById.mockResolvedValue(mockDepartment);
            mockEmployeeRepo.getEmployeeByEmail.mockResolvedValue(null);

            mockDataSource.transaction.mockImplementation(async (callback: any) => {
                const mockManager = {
                    getRepository: jest.fn().mockReturnValue({}),
                };
                return await callback(mockManager);
            });

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");
            (redisClient.keys as jest.Mock).mockResolvedValue([]); // No keys to delete

            const result = await service.createEmployee(employeeInfo, idempotencyKey);

            expect(result).toEqual(createdEmployee);
            expect(redisClient.keys).toHaveBeenCalledWith("departments:dep1:employees*");
            expect(redisClient.del).not.toHaveBeenCalled(); // No deletion if no keys
        });

        it("should not invalidate cache if departmentId is missing", async () => {
            const employeeInfo: EmployeeInsert = {
                name: "John",
                email: "j@test.com",
                departmentId: "dep1",
            };

            const idempotencyKey = "key-no-dept";

            const createdEmployee = {
                id: "1",
                name: "John",
                email: "j@test.com",
            } as Employee;

            const mockDepartment = { id: "dep1", name: "Engineering" } as Department;

            const mockRepoInstance = {
                createEmployee: jest.fn().mockResolvedValue(createdEmployee),
            };
            (EmployeeRepository as jest.MockedClass<typeof EmployeeRepository>).mockImplementation(
                () => mockRepoInstance as any,
            );

            mockDepartmentRepo.getDepartmentById.mockResolvedValue(mockDepartment);
            mockEmployeeRepo.getEmployeeByEmail.mockResolvedValue(null);

            mockDataSource.transaction.mockImplementation(async (callback: any) => {
                const mockManager = {
                    getRepository: jest.fn().mockReturnValue({}),
                };
                return await callback(mockManager);
            });

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            const result = await service.createEmployee(employeeInfo, idempotencyKey);

            expect(result).toEqual(createdEmployee);
            expect(redisClient.setEx).toHaveBeenCalled(); // Idempotency key stored
            expect(redisClient.keys).not.toHaveBeenCalled();
            expect(redisClient.del).not.toHaveBeenCalled();
        });

        it("should handle transaction failure", async () => {
            const employeeInfo: EmployeeInsert = {
                name: "John",
                email: "j@test.com",
                departmentId: "dep1",
            };

            const idempotencyKey = "key-tx-fail";
            const error = new Error("Transaction failed");
            const mockDepartment = { id: "dep1", name: "Engineering" } as Department;

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            mockDepartmentRepo.getDepartmentById.mockResolvedValue(mockDepartment);
            mockEmployeeRepo.getEmployeeByEmail.mockResolvedValue(null);
            mockDataSource.transaction.mockRejectedValue(error);

            await expect(service.createEmployee(employeeInfo, idempotencyKey)).rejects.toThrow(
                "Transaction failed",
            );
            expect(redisClient.setEx).not.toHaveBeenCalled();
            expect(redisClient.del).not.toHaveBeenCalled();
        });
    });

    describe("listEmployees", () => {
        it("should return cached employees if available", async () => {
            const cachedEmployees = [
                { id: "1", name: "John", departmentId: "dep1" },
                { id: "2", name: "Jane", departmentId: "dep2" },
            ];

            (redisClient.get as jest.Mock).mockResolvedValue(JSON.stringify(cachedEmployees));

            const result = await service.listEmployees();

            expect(result).toEqual(cachedEmployees);
            expect(redisClient.get).toHaveBeenCalledWith("employees:all");
            expect(mockEmployeeRepo.getAllEmployees).not.toHaveBeenCalled();
        });

        it("should fetch from DB and cache if not in cache", async () => {
            const employees = [
                { id: "1", name: "John", departmentId: "dep1" },
                { id: "2", name: "Jane", departmentId: "dep2" },
            ] as Employee[];

            (redisClient.get as jest.Mock).mockResolvedValue(null);
            mockEmployeeRepo.getAllEmployees.mockResolvedValue(employees);
            (redisClient.setEx as jest.Mock).mockResolvedValue("OK");

            const result = await service.listEmployees();

            expect(result).toEqual(employees);
            expect(mockEmployeeRepo.getAllEmployees).toHaveBeenCalled();
            expect(redisClient.setEx).toHaveBeenCalledWith(
                "employees:all",
                60,
                JSON.stringify(employees),
            );
        });
    });

    describe("getEmployeeWithLeaves", () => {
        it("should return null if employee not found", async () => {
            mockEmployeeRepo.getEmployeeById.mockResolvedValue(null);

            const result = await service.getEmployeeWithLeaves("unknown");

            expect(result).toBeNull();
            expect(mockEmployeeRepo.getEmployeeById).toHaveBeenCalledWith("unknown");
            expect(mockLeaveRequestRepo.findByEmployee).not.toHaveBeenCalled();
        });

        it("should return employee with leaves", async () => {
            const emp = {
                id: "1",
                name: "John",
                departmentId: "dep1",
            } as Employee;

            const mockLeaves = [
                { id: "l1", employeeId: "1", status: "PENDING" },
                { id: "l2", employeeId: "1", status: "APPROVED" },
            ];

            mockEmployeeRepo.getEmployeeById.mockResolvedValue(emp);
            mockLeaveRequestRepo.findByEmployee.mockResolvedValue(mockLeaves as any);

            const result = await service.getEmployeeWithLeaves("1");

            expect(result).toBeDefined();
            expect(result?.id).toBe("1");
            expect(result?.name).toBe("John");
            expect(result?.leaveRequests).toHaveLength(2);
            expect(result?.leaveRequests[0].id).toBe("l1");
            expect(mockEmployeeRepo.getEmployeeById).toHaveBeenCalledWith("1");
            expect(mockLeaveRequestRepo.findByEmployee).toHaveBeenCalledWith("1");
        });

        it("should return employee with empty leaves array", async () => {
            const emp = {
                id: "1",
                name: "John",
                departmentId: "dep1",
            } as Employee;

            mockEmployeeRepo.getEmployeeById.mockResolvedValue(emp);
            mockLeaveRequestRepo.findByEmployee.mockResolvedValue([]);

            const result = await service.getEmployeeWithLeaves("1");

            expect(result).toBeDefined();
            expect(result?.leaveRequests).toHaveLength(0);
        });
    });
});
