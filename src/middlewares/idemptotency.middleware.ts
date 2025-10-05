// middlewares/idempotency.middleware.ts
import { Request, Response, NextFunction } from "express";
import { BadRequestError } from "../utils/errors";

export async function idempotencyMiddleware(req: Request, _res: Response, next: NextFunction) {
    const key = req.header("Idempotency-Key");

    if (!key) {
        next(new BadRequestError("Idempotency key not found"));
    }

    next();
}
