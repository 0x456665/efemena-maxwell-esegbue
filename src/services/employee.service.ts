import { DataSource } from "typeorm";
import redisClient from "../config/redis";
import { EmployeeRepository } from "../repositories/employee.repository";
import { LeaveRequestRepository } from "../repositories/leaveRequest.repository";
import { DepartmentRepository } from "../repositories/department.repository";
import { Employee } from "../entities/employee.entity";
import { EmployeeInsert } from "../interfaces/employee.interface";
import { ConflictError, NotFoundError } from "../utils/errors";

export class EmployeeService {
    private readonly CACHE_TTL = 60; // Cache duration (in seconds)
    private readonly IDEMPOTENCY_TTL = 86400; // Idempotency key lifespan (24 hours)

    constructor(
        private dataSource: DataSource,
        private employeeRepo: EmployeeRepository,
        private leaveRequestRepo: LeaveRequestRepository,
        private departmentRepo: DepartmentRepository,
    ) {}

    /**
     * Removes cached employee data for a specific department.
     * Helps ensure consistency after new employees are added.
     */
    private async invalidateDepartmentEmployeeCaches(departmentId: string) {
        if (!departmentId) return;
        const keys = await redisClient.keys(`departments:${departmentId}:employees*`);
        if (keys.length) await redisClient.del(keys);
    }

    /**
     * Creates a new employee record using a database transaction.
     * Prevents duplicate submissions via idempotency keys.
     * Clears related department caches after creation.
     */
    async createEmployee(employeeInfo: EmployeeInsert, idempotencyKey: string): Promise<Employee> {
        const idempotencyRedisKey = `idempotency:employee:${idempotencyKey}`;

        // Ensure the same operation isn't executed twice
        const existing = await redisClient.get(idempotencyRedisKey);
        if (existing) {
            throw new ConflictError("Duplicate request: operation already performed with this idempotency key");
        }

        // Validate that the department exists before creating the employee
        if (employeeInfo.departmentId) {
            const department = await this.departmentRepo.getDepartmentById(employeeInfo.departmentId);
            if (!department) {
                throw new NotFoundError(`Department with ID ${employeeInfo.departmentId} not found`);
            }
        }

        // Validate email format (basic check)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(employeeInfo.email)) {
            throw new Error("Invalid email format");
        }

        // Check for duplicate email (optional but recommended)
        const existingEmployee = await this.employeeRepo.getEmployeeByEmail(employeeInfo.email);
        if (existingEmployee) {
            throw new ConflictError(`Employee with email ${employeeInfo.email} already exists`);
        }

        // Execute employee creation transactionally
        const created = await this.dataSource.transaction(async (manager) => {
            const transactionalRepo = new EmployeeRepository(manager.getRepository(Employee));
            return await transactionalRepo.createEmployee(employeeInfo);
        });

        // Store idempotency record
        await redisClient.setEx(
            idempotencyRedisKey,
            this.IDEMPOTENCY_TTL,
            JSON.stringify({ employeeId: created.id, createdAt: new Date() })
        );

        // Invalidate cached employee lists for the department
        if (created?.departmentId) {
            await this.invalidateDepartmentEmployeeCaches(created.departmentId);
        }

        return created;
    }

    /**
     * Retrieves all employees.
     * Results are cached for performance optimization.
     */
    async listEmployees() : Promise<Employee[]> {
        const cacheKey = "employees:all";
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const employees = await this.employeeRepo.getAllEmployees();
        await redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(employees));
        return employees;
    }

    /**
     * Retrieves employees within a department, including their leave requests.
     * Results are paginated and cached for faster access.
     */
    async listEmployeesWithLeaves(departmentId: string, page = 1, limit = 10) {
        // Validate that the department exists
        const department = await this.departmentRepo.getDepartmentById(departmentId);
        if (!department) {
            throw new NotFoundError(`Department with ID ${departmentId} not found`);
        }

        const cacheKey = `departments:${departmentId}:employeesWithLeaves:page=${page}&limit=${limit}`;
        const cached = await redisClient.get(cacheKey);
        if (cached) return JSON.parse(cached);

        const allEmployees = await this.employeeRepo.getAllEmployees();
        const filtered = allEmployees.filter((e) => e.departmentId === departmentId);
        const start = (page - 1) * limit;
        const pageEmployees = filtered.slice(start, start + limit);

        // Combine employee data with their leave requests
        const results = await Promise.all(
            pageEmployees.map(async (emp) => {
                const leaves = await this.leaveRequestRepo.findByEmployee(emp.id);
                return { ...emp, leaveRequests: leaves };
            }),
        );

        const payload = { data: results, count: filtered.length, page, limit };
        await redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(payload));
        return payload;
    }

    /**
     * Retrieves a single employee and their leave requests.
     * Not cached to ensure fresh data.
     */
    async getEmployeeWithLeaves(employeeId: string) {
        const emp = await this.employeeRepo.getEmployeeById(employeeId);
        if (!emp) return null;

        const leaves = await this.leaveRequestRepo.findByEmployee(employeeId);
        return { ...emp, leaveRequests: leaves };
    }
}