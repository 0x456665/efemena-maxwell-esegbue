

import { Entity, Generated, Column, CreateDateColumn, OneToOne, UpdateDateColumn, Index, PrimaryGeneratedColumn } from "typeorm";
import { Department } from "./departement.entity";

@Index(["departmentId"])
@Entity()
export class Employee {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true, nullable: false })
    name: string;

    @Column({ unique: true, nullable: false })
    email: string;

    @Column({ nullable: false })
    departmentId: string;

    @UpdateDateColumn()
    updatedAt: Date;

    @CreateDateColumn()
    createdAt: Date;
}
