import { EmployeeRepository } from "../../../src/repositories/employee.repository";
import { Employee } from "../../../src/interfaces/employee.interface";
import { Repository } from "typeorm";

describe("EmployeeRepository (FK as departmentId)", () => {
    let mockRepo: jest.Mocked<Repository<Employee>>;
    let employeeRepository: EmployeeRepository;

    beforeEach(() => {
        mockRepo = {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            delete: jest.fn(),
        } as any;

        employeeRepository = new EmployeeRepository(mockRepo);
    });

    it("should create and save an employee", async () => {
        const employee: Employee = {
            id: "e1",
            name: "John Doe",
            email: "john@example.com",
            departmentId: "d1",
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        mockRepo.create.mockReturnValue(employee);
        mockRepo.save.mockResolvedValue(employee);

        const result = await employeeRepository.createEmployee(
            {
                name: "John Doe",
                email:"john@example.com",
                departmentId:"d1"},
        );

        expect(mockRepo.create).toHaveBeenCalledWith({
            name: "John Doe",
            email: "john@example.com",
            departmentId: "d1",
        });
        expect(mockRepo.save).toHaveBeenCalledWith(employee);
        expect(result).toEqual(employee);
    });

    it("should get employee by id", async () => {
        const employee = {
            id: "e1",
            name: "Jane",
            email: "jane@example.com",
            departmentId: "d1",
        } as Employee;
        mockRepo.findOne.mockResolvedValue(employee);

        const result = await employeeRepository.getEmployeeById("e1");

        expect(mockRepo.findOne).toHaveBeenCalledWith({ where: { id: "e1" } });
        expect(result).toEqual(employee);
    });

    it("should get all employees", async () => {
        const employees = [
            { id: "e1", name: "John", email: "john@example.com", departmentId: "d1" },
            { id: "e2", name: "Jane", email: "jane@example.com", departmentId: "d2" },
        ] as Employee[];
        mockRepo.find.mockResolvedValue(employees);

        const result = await employeeRepository.getAllEmployees();

        expect(mockRepo.find).toHaveBeenCalled();
        expect(result).toEqual(employees);
    });

    it("should delete employee", async () => {
        mockRepo.delete.mockResolvedValue({ affected: 1 } as any);

        const result = await employeeRepository.deleteEmployee("e1");

        expect(mockRepo.delete).toHaveBeenCalledWith("e1");
        expect(result).toBe(true);
    });
});
