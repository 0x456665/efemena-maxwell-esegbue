import { Request } from "express";
import { BadRequestError } from "../utils/errors";
/**
 * TSOA Security Authentication Handler for Idempotency Key
 *
 * This function is called by TSOA when a route is decorated with @Security("idempotency")
 * It validates that the Idempotency-Key header is present and valid.
 *
 * @param request Express request object
 * @param securityName The name of the security scheme (should be "idempotency")
 * @param scopes Optional scopes (not used for idempotency)
 * @returns Promise<string> - Returns the idempotency key if valid
 * @throws Error if the idempotency key is missing or invalid
 */
export async function expressAuthentication(
    request: Request,
    securityName: string,
    _scopes?: string[],
): Promise<string> {
    if (securityName === "idempotency") {
        const idempotencyKey = request.header("Idempotency-Key");

        if (!idempotencyKey) {
            throw new BadRequestError("Idempotency-Key header is required");
        }

        // Validate idempotency key format (adjust regex as needed)
        // Example: alphanumeric, hyphens, underscores, 8-64 characters
        const idempotencyKeyRegex = /^[a-zA-Z0-9_-]{8,64}$/;

        if (!idempotencyKeyRegex.test(idempotencyKey)) {
            throw new BadRequestError(
                "Idempotency-Key must be 8-64 characters long and contain only alphanumeric characters, hyphens, and underscores",
            );
        }

        // Attach the idempotency key to the request for easy access in controllers
        (request as any).idempotencyKey = idempotencyKey;

        return idempotencyKey;
    }

    throw new Error("Unknown security scheme");
}
