import { DataSource } from "typeorm";
import Settings from "./settings";
import { Employee } from "../entities/employee.entity";
import { Department } from "../entities/departement.entity";
import { LeaveRequest } from "../entities/leaveRequest.entity";

export const AppDataSource = new DataSource({
    type: "mysql",
    host: "snapnet_mysql",
    port: Settings.DB_PORT as number,
    username: Settings.DB_USER,
    password: Settings.DB_PASSWORD,
    database: Settings.DB_NAME,
    entities: [Employee, Department, LeaveRequest],
    logging: true,
    synchronize: true,
});
