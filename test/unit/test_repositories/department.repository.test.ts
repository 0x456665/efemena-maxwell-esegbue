import { DepartmentRepository } from "../../../src/repositories/department.repository";
import { Department } from "../../../src/entities/departement.entity";
import { Repository } from "typeorm";

describe("DepartmentRepository", () => {
    let mockRepo: jest.Mocked<Repository<Department>>;
    let departmentRepository: DepartmentRepository;

    beforeEach(() => {
        // create a mocked repository with only the methods we use
        mockRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            delete: jest.fn()
        } as any;

        departmentRepository = new DepartmentRepository(mockRepo);
    });

    it("should create and save a department", async () => {
        const dept: Department = { id: "uuid", name: "HR", createdAt: new Date() };

        mockRepo.create.mockReturnValue(dept);
        mockRepo.save.mockResolvedValue(dept);

        const result = await departmentRepository.createDepartment("HR");

        expect(mockRepo.create).toHaveBeenCalledWith({ name: "HR" });
        expect(mockRepo.save).toHaveBeenCalledWith(dept);
        expect(result).toEqual(dept);
    });

    it("should get department by id", async () => {
        const dept: Department = { id: "uuid", name: "Finance", createdAt: new Date() };
        mockRepo.findOne.mockResolvedValue(dept);

        const result = await departmentRepository.getDepartmentById("uuid");

        expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: "uuid" } });
        expect(result).toEqual(dept);
    });

    it("should get all departments", async () => {
        const depts: Department[] = [
            { id: "uuid1", name: "HR", createdAt: new Date() },
            { id: "uuid2", name: "Finance", createdAt: new Date() }
        ];
        mockRepo.find.mockResolvedValue(depts);

        const result = await departmentRepository.getAllDepartments();

        expect(mockRepo.find).toHaveBeenCalled();
        expect(result).toEqual(depts);
    });

    it("should delete department", async () => {
        mockRepo.delete.mockResolvedValue({ affected: 1 } as any);

        const result = await departmentRepository.deleteDepartment("uuid");

        expect(mockRepo.delete).toHaveBeenCalledWith("uuid");
        expect(result).toBe(true);
    });
});
