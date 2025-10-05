import app from "./app";
import { AppDataSource } from "./config/datasource";
import redisClient from "./config/redis";
import { getChannel, getConnection } from "./config/rabbitmq";
import Settings from "./config/settings";

/**
 * Initialize all required services
 * @returns Promise<boolean> - true if all services initialized successfully
 */
async function initializeServices(): Promise<boolean> {
    const services = {
        database: false,
        redis: false,
        rabbitmq: false,
    };

    try {
        // Initialize Database
        console.log("Initializing Database connection...");
        await AppDataSource.initialize();
        console.log("Database connection established successfully");
        services.database = true;
    } catch (error) {
        console.error("Database connection failed:", error);
        return false;
    }

    try {
        // Initialize Redis
        console.log("Connecting to Redis...");
        await redisClient.connect();

        // Verify Redis connection with a ping
        const pingResponse = await redisClient.ping();
        if (pingResponse !== "PONG") {
            throw new Error("Redis ping failed");
        }

        console.log("Redis connection established successfully");
        services.redis = true;
    } catch (error) {
        console.error("Redis connection failed:", error);

        // Cleanup database if Redis fails
        if (services.database) {
            await AppDataSource.destroy();
        }
        return false;
    }

    try {
        // Verify RabbitMQ connection
        console.log("Verifying RabbitMQ connection...");

        // Test connection by creating a channel
        const channel = await getChannel();
        await channel.close();

        console.log("RabbitMQ connection established successfully");
        services.rabbitmq = true;
    } catch (error) {
        console.error("RabbitMQ connection failed:", error);

        // Cleanup previous connections if RabbitMQ fails
        if (services.redis) {
            await redisClient.quit();
        }
        if (services.database) {
            await AppDataSource.destroy();
        }
        return false;
    }

    return services.database && services.redis && services.rabbitmq;
}

/**
 * Gracefully shutdown all services
 */
async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n${signal} received. Starting graceful shutdown...`);

    try {
        // Close Redis connection
        console.log("Closing Redis connection...");
        await redisClient.quit();
        console.log("Redis connection closed");
    } catch (error) {
        console.error("Error closing Redis connection:", error);
    }

    try {
        // Close RabbitMQ connection
        console.log("Closing RabbitMQ connection...");
        const conn = await getConnection();
        await conn.close();
        console.log("RabbitMQ connection closed");
    } catch (error) {
        console.error("Error closing RabbitMQ connection:", error);
    }

    try {
        // Close Database connection
        console.log("Closing Database connection...");
        await AppDataSource.destroy();
        console.log("Database connection closed");
    } catch (error) {
        console.error("Error closing Database connection:", error);
    }

    console.log("Shutdown complete");
    process.exit(0);
}

/**
 * Start the application
 */
async function startApp(): Promise<void> {
    try {
        console.log("🚀 Starting application...\n");

        // Initialize all services
        const servicesInitialized = await initializeServices();

        if (!servicesInitialized) {
            console.error("\nFailed to initialize all required services");
            console.error("Application startup aborted");
            process.exit(1);
        }

        // Start Express server
        const PORT = Settings.PORT || 3000;
        app.listen(PORT, () => {
            console.log("\nAll services initialized successfully");
            console.log(`Server is running on port ${PORT}`);
            console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
        });

        // Setup graceful shutdown handlers
        process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
        process.on("SIGINT", () => gracefulShutdown("SIGINT"));
    } catch (error) {
        console.error("\nUnexpected error during application startup:", error);
        process.exit(1);
    }
}

// Start the application
startApp();
