import { BadRequestError } from "../utils/errors";
import { employeeInsertSchema } from "../validators/employee.validator";

import { Request, Response, NextFunction } from "express";

export function employeeCreateValidator(req: Request, _res: Response, next: NextFunction) {
    const { error } = employeeInsertSchema.validate(req.body, { abortEarly: false });
    if (error) {
        next(new BadRequestError(error.details.map((err) => err.message).join(", ")));
    }
    next();
}
