import {
    Controller,
    Request,
    Get,
    Route,
    Query,
    Post,
    Body,
    Middlewares,
    Path,
    SuccessResponse,
    Tags,
    Security,
} from "tsoa";
import { DepartmentService } from "../services/department.service";
import { AppDataSource } from "../config/datasource";
import { DepartmentRepository } from "../repositories/department.repository";
import { EmployeeRepository } from "../repositories/employee.repository";
import { Department } from "../entities/departement.entity";
import { Employee } from "../entities/employee.entity";
import { DeparmentInsert } from "../interfaces/department.interface";
import { departmentCreateValidator } from "../middlewares/departmentValidator.middleware";
import { idempotencyMiddleware } from "../middlewares/idemptotency.middleware";
import { Request as ExRequest } from "express";
import { PaginatedResponse } from "../interfaces/sucessResponse.interface";

/**
 * DepartmentController
 * Handles routes for creating and fetching departments,
 * as well as listing employees under departments.
 */
@Route("departments")
@Tags("Departments")
export class DepartmentController extends Controller {
    private readonly departmentService: DepartmentService;

    constructor() {
        super();
        // Initialize service with repositories and datasource
        this.departmentService = new DepartmentService(
            AppDataSource,
            new DepartmentRepository(AppDataSource.getRepository(Department)),
            new EmployeeRepository(AppDataSource.getRepository(Employee)),
        );
    }

    /**
     * Create a new department.
     * @param department The department payload
     */
    @Post("/")
    @Security("idempotency")
    @Middlewares(departmentCreateValidator, idempotencyMiddleware)
    @SuccessResponse("201", "Created") // Return 201 on success
    async createDepartment(@Request() req: ExRequest, @Body() department: DeparmentInsert) {
        const idemptotencyKey = req.header("Idempotency-Key")!;
        const { name } = department;
        const created = await this.departmentService.createDepartment(name, idemptotencyKey);

        this.setStatus(201); // Explicitly set HTTP status code
        return created;
    }

    /**
     * List all departments (cached).
     */
    @Get("/")
    @SuccessResponse("200", "OK")
    async getDepartments(): Promise<Department[]> {
        return await this.departmentService.listDepartments();
    }

    /**
     * Get paginated list of employees in a department.
     * @param id The department ID
     * @param page Page number (default 1)
     * @param limit Page size (default 10)
     */
    @Get("/{id}/employees")
    @SuccessResponse("200", "OK")
    async getDepartmentEmployees(
        @Path() id: string,
        @Query() page?: number,
        @Query() limit?: number,
    ): Promise<PaginatedResponse<Employee>> {
        return await this.departmentService.listEmployeesInDepartment(id, page, limit);
    }
}
