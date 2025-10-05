import { Repository } from "typeorm";
import { Employee } from "../entities/employee.entity";
import { EmployeeInsert } from "../interfaces/employee.interface";

export class EmployeeRepository {
    private readonly db: Repository<Employee>;

    constructor(repository: Repository<Employee>) {
        this.db = repository;
    }

    async createEmployee(employeeInfo: EmployeeInsert): Promise<Employee> {
        const employee = this.db.create(employeeInfo);
        return this.db.save(employee);
    }

    async getEmployeeById(id: string): Promise<Employee | null> {
        return this.db.findOne({ where: { id } });
    }

    async getEmployeeByEmail(email: string): Promise<Employee | null> {
        return this.db.findOne({ where: { email } });
    }

    async getAllEmployees(): Promise<Employee[]> {
        return this.db.find();
    }

    async updateEmployee(id: string, employeeInfo: Partial<EmployeeInsert>): Promise<Employee> {
        const employee = await this.db.findOne({ where: { id } });
        if (!employee) {
            throw new Error("Employee not found");
        }
        employee.name = employeeInfo.name || employee.name;
        employee.email = employeeInfo.email || employee.email;
        employee.departmentId = employeeInfo.departmentId || employee.departmentId;
        return this.db.save(employee);
    }

    async deleteEmployee(id: string): Promise<boolean> {
        const result = await this.db.delete(id);
        return result.affected !== 0;
    }
}
