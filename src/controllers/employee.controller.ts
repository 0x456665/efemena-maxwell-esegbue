import {
    Controller,
    Get,
    Route,
    Query,
    Post,
    Body,
    Patch,
    Middlewares,
    Path,
    Request,
    Tags,
    SuccessResponse,
    Security,
} from "tsoa";
import { EmployeeService } from "../services/employee.service";
import { AppDataSource } from "../config/datasource";
import { EmployeeRepository } from "../repositories/employee.repository";
import { Employee } from "../entities/employee.entity";
import { EmployeeInsert } from "../interfaces/employee.interface";
import { employeeCreateValidator } from "../middlewares/employeeValidator.middleware";
import { LeaveRequestRepository } from "../repositories/leaveRequest.repository";
import { LeaveRequest } from "../entities/leaveRequest.entity";
import { idempotencyMiddleware } from "../middlewares/idemptotency.middleware";
import { Request as ExRequest } from "express";
import { Department } from "../entities/departement.entity";
import { DepartmentRepository } from "../repositories/department.repository";

@Route("employees")
@Tags("Employees")
export class EmployeeController extends Controller {
    private readonly employeeService: EmployeeService;

    constructor() {
        super();

        // Initialize the EmployeeService with repositories and datasource
        this.employeeService = new EmployeeService(
            AppDataSource,
            new EmployeeRepository(AppDataSource.getRepository(Employee)),
            new LeaveRequestRepository(AppDataSource.getRepository(LeaveRequest)),
            new DepartmentRepository(AppDataSource.getRepository(Department)),
        );
    }

    /**
     * @summary Create a new employee
     * @param req Express request object (used to access headers)
     * @param employee Employee details from request body
     * @returns The newly created employee record
     */
    @Post("/")
    @Security("idempotency")
    @SuccessResponse("201", "Employee created successfully")
    @Middlewares(employeeCreateValidator, idempotencyMiddleware) // Validate input and enforce idempotency
    async createEmployee(@Request() req: ExRequest, @Body() employee: EmployeeInsert) {
        // Extract the Idempotency-Key from request headers
        const idempotencyKey = req.header("Idempotency-Key")!;

        const { name, email, departmentId } = employee;

        // Delegate employee creation to the service layer
        return await this.employeeService.createEmployee(
            { name, email, departmentId },
            idempotencyKey,
        );
    }

    /**
     * @summary Get all employees
     * @returns A list of all employees in the system
     */
    @Get("/")
    @SuccessResponse("200", "Employees retrieved successfully")
    async getEmployees() :Promise<Employee[]> {
        return await this.employeeService.listEmployees();
    }

    /**
     * @summary Get a single employee with their leave requests
     * @param id The ID of the employee to fetch
     * @returns Employee details along with their leave requests
     */
    @Get("/{id}")
    @SuccessResponse("200", "Employee retrieved successfully")
    async getEmployee(@Path() id: string) {
        return await this.employeeService.getEmployeeWithLeaves(id);
    }
}
