import {
    Controller,
    Post,
    Body,
    Middlewares,
    Request,
    Tags,
    SuccessResponse,
    Security,
    Route,
} from "tsoa";
import { AppDataSource } from "../config/datasource";
import { EmployeeRepository } from "../repositories/employee.repository";
import { LeaveRequestService } from "../services/leaveRequest.service";
import { Employee } from "../entities/employee.entity";
import { LeaveRequestRepository } from "../repositories/leaveRequest.repository";
import { LeaveRequest } from "../entities/leaveRequest.entity";
import { ILeaveRequest, LeaveRequestInsert } from "../interfaces/leaveRequest.interface";
import { leaveRequestCreateValidator } from "../middlewares/leaveRequestValidator.middleware";
import { Request as ExRequest } from "express";
import { idempotencyMiddleware } from "../middlewares/idemptotency.middleware";

@Tags("Leave Requests")
@Route("leave-requests")
export class LeaveRequestController extends Controller {
    private readonly leaveRequestService: LeaveRequestService;

    constructor() {
        super();

        // Initialize the LeaveRequestService with required repositories and datasource
        this.leaveRequestService = new LeaveRequestService(
            AppDataSource,
            new EmployeeRepository(AppDataSource.getRepository(Employee)),
            new LeaveRequestRepository(AppDataSource.getRepository(LeaveRequest)),
        );
    }

    /**
     * @summary Create a new leave request
     * @description
     * This endpoint allows an employee to submit a new leave request.
     * It validates the input using `leaveRequestCreateValidator` and
     * ensures idempotent behavior using the `Idempotency-Key` header.
     *
     * @param req Express Request object (used to access headers)
     * @param leaveRequest Request body containing leave request details
     * @returns The newly created leave request record
     */
    @Post("/")
    @Security("idempotency")
    @Middlewares(leaveRequestCreateValidator, idempotencyMiddleware) // Validate incoming leave request data
    @SuccessResponse("201", "Leave request created successfully")
    async createLeaveRequest(
        @Request() req: ExRequest,
        @Body() leaveRequest: LeaveRequestInsert,
    ): Promise<ILeaveRequest> {
        // Retrieve the Idempotency-Key header to ensure the request isn't processed multiple times
        const idempotencyKey = req.header("Idempotency-Key")!;

        // Delegate business logic to the service layer
        return await this.leaveRequestService.createLeaveRequest(leaveRequest, idempotencyKey);
    }
}
