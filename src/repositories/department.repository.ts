import { Repository } from "typeorm";
import { Department } from "../entities/departement.entity";

export class DepartmentRepository {
    private readonly db: Repository<Department>;

    constructor(repository: Repository<Department>) {
        this.db = repository;
    }

    async createDepartment(name: string): Promise<Department> {
        const department = this.db.create({ name });
        return this.db.save(department);
    }

    async getDepartmentById(id: string): Promise<Department | null> {
        return this.db.findOne({ where: { id } });
    }

    async getDepartmentByName(name: string): Promise<Department | null> {
        return this.db.findOne({ where: { name } });
    }

    async getAllDepartments(): Promise<Department[]> {
        return this.db.find();
    }

    async deleteDepartment(id: string): Promise<boolean> {
        const result = await this.db.delete(id);
        return result.affected !== 0;
    }
}
