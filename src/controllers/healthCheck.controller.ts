import os from "os";
import { getChannel } from "../config/rabbitmq";
import Settings from "../config/settings";
import { Controller, Get, Route, SuccessResponse, Tags } from "tsoa";
import { SystemError } from "../utils/errors";

// Get system information
function getSystemInfo() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        uptime: os.uptime(),
        memory: {
            total: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
            free: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
            used: `${(usedMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
            usage: `${((usedMem / totalMem) * 100).toFixed(2)}%`,
        },
        loadAverage: os.loadavg(),
    };
}
async function getQueueInfo() {
    const channel = await getChannel();
    channel.assertQueue(Settings.RABBITMQ_QUEUE_NAME, { durable: true });
    // Check queue status
    const queueInfo = await channel.checkQueue(Settings.RABBITMQ_QUEUE_NAME);

    // Close channel
    await channel.close();
    return {
        status: "connected",
        queue: Settings.RABBITMQ_QUEUE_NAME,
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
    };
}

@Route("health")
@Tags("Health")
export class HealthCheck extends Controller {
    @Get("/")
    @SuccessResponse("200", "System is healthy")
    async getFullSystemHealth() {
        try {
            const systemInfo = getSystemInfo();
            const queueInfo = await getQueueInfo();

            const isHealthy = queueInfo.status === "connected";
            const statusCode = isHealthy ? 200 : 503;

            return {
                status: isHealthy ? "healthy" : "unhealthy",
                timestamp: new Date().toISOString(),
                system: systemInfo,
                rabbitmq: queueInfo,
            };
        } catch (error) {
            if (error instanceof Error) throw new SystemError(error.message);
        }
    }

    // Separate endpoint for system check only
    @Get("/system")
    @SuccessResponse("200", "System is healthy")
    async getSystemHealth() {
        try {
            const systemInfo = getSystemInfo();
            return {
                status: "healthy",
                timestamp: new Date().toISOString(),
                system: systemInfo,
            };
        } catch (error: any) {
            if (error instanceof Error) throw new SystemError(error.message);
        }
    }

    // Separate endpoint for queue check only
    @Get("/queue")
    @SuccessResponse("200", "Queue is healthy")
    async getQueueHealth() {
        try {
            const queueInfo = await getQueueInfo();
            const isHealthy = queueInfo.status === "connected";

            return {
                status: isHealthy ? "healthy" : "unhealthy",
                timestamp: new Date().toISOString(),
                rabbitmq: queueInfo,
            };
        } catch (error: any) {
            if (error instanceof Error) throw new SystemError(error.message);
        }
    }
}
