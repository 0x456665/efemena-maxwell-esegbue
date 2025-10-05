import { Request, Response, NextFunction } from "express";
import { QueryFailedError, EntityNotFoundError } from "typeorm";
import { AppError } from "../utils/errors";
import ErrorResponse from "../interfaces/errorResponse.interface";

export function errorHandler(err: unknown, _req: Request, res: Response, next: NextFunction) {
    let errorResponse: ErrorResponse;

    // If it's our custom AppError
    if (err instanceof AppError) {
        errorResponse = {
            message: err.message,
            statusCode: err.statusCode,
        };
    }
    // TypeORM: Entity not found
    else if (err instanceof EntityNotFoundError) {
        errorResponse = {
            message: "Resource not found",
            statusCode: 404,
        };
    }
    // TypeORM: Query failed (e.g., duplicate key, invalid SQL, constraint violation)
    else if (err instanceof QueryFailedError) {
        errorResponse = {
            message: (err as any).message || "Database query failed",
            statusCode: 400,
        };
    }
    // Generic fallback
    else {
        errorResponse = {
            message: "Internal Server Error",
            statusCode: 500,
        };
        console.error("Unexpected error:", err); // keep log for debugging
    }

    res.status(errorResponse.statusCode).json(errorResponse);
}
