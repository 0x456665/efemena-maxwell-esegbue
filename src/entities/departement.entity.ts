import { Entity, Column, CreateDateColumn, PrimaryGeneratedColumn, Index } from "typeorm";

@Entity()
@Index(["name"])
export class Department {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    name: string;

    @CreateDateColumn()
    createdAt: Date;
}
