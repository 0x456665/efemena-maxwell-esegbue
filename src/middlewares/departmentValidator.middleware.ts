import { BadRequestError } from "../utils/errors";
import { deparmentInsertSchema } from "../validators/deparment.validator";
import { Request, Response, NextFunction } from "express";

export function departmentCreateValidator(req: Request, _res: Response, next: NextFunction) {
    const { error } = deparmentInsertSchema.validate(req.body, { abortEarly: false });
    if (error) {
        next(new BadRequestError(error.details.map((err) => err.message).join(", ")));
    }
    next();
}
