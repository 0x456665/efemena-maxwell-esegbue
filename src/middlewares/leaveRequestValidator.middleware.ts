import { BadRequestError } from "../utils/errors";
import { leaveRequestInsertSchema } from "../validators/leaveRequest.validator";

import { Request, Response, NextFunction } from "express";

export function leaveRequestCreateValidator(req: Request, _res: Response, next: NextFunction) {
    const { error } = leaveRequestInsertSchema.validate(req.body, { abortEarly: false });
    if (error) {
        next(new BadRequestError(error.details.map((err) => err.message).join(", ")));
    }
    next();
}
