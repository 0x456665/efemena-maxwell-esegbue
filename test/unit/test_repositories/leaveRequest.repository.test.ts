import { Repository } from "typeorm";
import { ILeaveRequest } from "../../../src/interfaces/leaveRequest.interface";
import { LeaveRequest } from "../../../src/entities/leaveRequest.entity";
import { LeaveRequestRepository } from "../../../src/repositories/leaveRequest.repository";

describe("LeaveRequestRepository", () => {
    let repo: Repository<LeaveRequest>;
    let leaveRequestRepo: LeaveRequestRepository;

    beforeEach(() => {
        repo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            update: jest.fn(),
            delete: jest.fn(),
        } as unknown as Repository<LeaveRequest>;

        leaveRequestRepo = new LeaveRequestRepository(repo);
    });

    it("should create a leave request with status PENDING", async () => {
        const fakeRequest: LeaveRequest = {
            id: "1",
            employeeId: "emp123",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-01-05"),
            status: "PENDING",
        };

        (repo.create as jest.Mock).mockReturnValue(fakeRequest);
        (repo.save as jest.Mock).mockResolvedValue(fakeRequest);

        const result = await leaveRequestRepo.createRequest({
            employeeId: "emp123",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-01-05"),
        });

        expect(repo.create).toHaveBeenCalledWith({
            employeeId: "emp123",
            startDate: new Date("2025-01-01"),
            endDate: new Date("2025-01-05"),
            status: "PENDING",
        });
        expect(repo.save).toHaveBeenCalledWith(fakeRequest);
        expect(result.status).toBe("PENDING");
    });

    it("should find a request by id", async () => {
        const fakeRequest = { id: "1" } as LeaveRequest;
        (repo.findOne as jest.Mock).mockResolvedValue(fakeRequest);

        const result = await leaveRequestRepo.findById("1");

        expect(repo.findOne).toHaveBeenCalledWith({ where: { id: "1" } });
        expect(result).toEqual(fakeRequest);
    });

    it("should update status of a leave request", async () => {
        const fakeRequest = { id: "1", status: "APPROVED" } as LeaveRequest;

        (repo.update as jest.Mock).mockResolvedValue({});
        (repo.findOne as jest.Mock).mockResolvedValue(fakeRequest);

        const result = await leaveRequestRepo.updateStatus("1", "APPROVED");

        expect(repo.update).toHaveBeenCalledWith({ id: "1" }, { status: "APPROVED" });
        expect(result?.status).toBe("APPROVED");
    });

    it("should delete a leave request", async () => {
        (repo.delete as jest.Mock).mockResolvedValue({});

        await leaveRequestRepo.deleteRequest("1");

        expect(repo.delete).toHaveBeenCalledWith({ id: "1" });
    });
});
