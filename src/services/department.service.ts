import { DataSource } from "typeorm";
import { DepartmentRepository } from "../repositories/department.repository";
import { EmployeeRepository } from "../repositories/employee.repository";
import redisClient from "../config/redis";

export class DepartmentService {
    private readonly dataSource: DataSource;
    private readonly departmentRepo: DepartmentRepository;
    private readonly employeeRepo: EmployeeRepository;
    private readonly CACHE_TTL = 60; // Cache duration (in seconds)
    private readonly IDEMPOTENCY_TTL = 86400; // Idempotency key lifespan (24 hours)

    constructor(
        dataSource: DataSource,
        departmentRepo: DepartmentRepository,
        employeeRepo: EmployeeRepository,
    ) {
        this.dataSource = dataSource;
        this.departmentRepo = departmentRepo;
        this.employeeRepo = employeeRepo;
    }

    /**
     * Creates a new department using a database transaction.
     * Ensures idempotency (no duplicate department creation for the same key)
     * and invalidates the department list cache after success.
     */
    async createDepartment(name: string, idempotencyKey: string) {
        const idempotencyRedisKey = `idempotency:department:${idempotencyKey}`;

        // Prevent duplicate operations using the same idempotency key
        const existing = await redisClient.get(idempotencyRedisKey);
        if (existing) {
            throw new Error("Duplicate request: operation already performed with this idempotency key");
        }

        // Execute the department creation within a transaction
        const department = await this.dataSource.transaction(async (manager) => {
            const repo = new DepartmentRepository(
                manager.getRepository(this.departmentRepo["db"].target),
            );
            return await repo.createDepartment(name);
        });

        // Save idempotency key and operation result
        await redisClient.setEx(
            idempotencyRedisKey,
            this.IDEMPOTENCY_TTL,
            JSON.stringify({ departmentId: department.id, createdAt: new Date() })
        );

        // Invalidate cached department list
        await redisClient.del("departments:all");

        return department;
    }

    /**
     * Returns a list of all departments.
     * Results are cached to reduce database queries.
     */
    async listDepartments() {
        const cacheKey = "departments:all";
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const departments = await this.departmentRepo.getAllDepartments();
        await redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(departments));
        return departments;
    }

    /**
     * Returns a paginated list of employees belonging to a specific department.
     * Results are cached per page and department.
     */
    async listEmployeesInDepartment(departmentId: string, page = 1, limit = 10) {
        const cacheKey = `departments:${departmentId}:employees:page=${page}&limit=${limit}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const allEmployees = await this.employeeRepo.getAllEmployees();
        const filtered = allEmployees.filter((emp) => emp.departmentId === departmentId);

        const start = (page - 1) * limit;
        const paginated = filtered.slice(start, start + limit);

        const response = { data: paginated, count: filtered.length, page, limit };
        await redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(response));

        return response;
    }
}
