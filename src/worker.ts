import "reflect-metadata";
import { LeaveRequestService } from "./services/leaveRequest.service";
import Settings from "./config/settings";
import { getChannel } from "./config/rabbitmq";
import { AppDataSource } from "./config/datasource";
import { EmployeeRepository } from "./repositories/employee.repository";
import { LeaveRequestRepository } from "./repositories/leaveRequest.repository";
import { Employee } from "./entities/employee.entity";
import { LeaveRequest } from "./entities/leaveRequest.entity";
import { Channel } from "amqplib";
import sendMessageToQueue from "./queue/producer.leaveRequest";
import redisClient from "./config/redis";

const leaveRequestService = new LeaveRequestService(
    AppDataSource,
    new EmployeeRepository(AppDataSource.getRepository(Employee)),
    new LeaveRequestRepository(AppDataSource.getRepository(LeaveRequest)),
);

async function handleMessage(msg: any, channel: Channel) {
    if (!msg) return;

    try {
        const message = msg.content.toString();
        const data: { leaveId: string; idempotencyKey: string } = JSON.parse(message);

        console.log("Received message:", data);

        // Process leave request
        await leaveRequestService.updateStatus(data.leaveId, "APPROVED", data.idempotencyKey);

        // Success → Ack
        channel.ack(msg);
    } catch (error) {
        console.error("Error processing message:", error);

        // Track retry count in headers
        const headers = msg.properties.headers || {};
        const retryCount = (headers["x-retry-count"] || 0) + 1;

        if (retryCount > Settings.MAX_RETRIES) {
            console.log("Exceeded retries. Sending to DLQ:", msg.content.toString());

            // Publish to DLQ
            channel.sendToQueue(Settings.RABBITMQ_DLQ_NAME, msg.content, {
                headers: { ...headers, "x-original-queue": Settings.RABBITMQ_QUEUE_NAME },
                persistent: true,
            });

            // Drop from main queue
            channel.ack(msg);
        } else {
            console.log(`Retrying message (${retryCount}/${Settings.MAX_RETRIES})`);

            // Requeue message with incremented retry count
            sendMessageToQueue(msg.content);

            // Remove old copy
            channel.ack(msg);
        }
    }
}

async function main() {
    const channel = await getChannel();
    channel.assertQueue(Settings.RABBITMQ_QUEUE_NAME, { durable: true });
    console.log("Starting worker...");
    channel.consume(Settings.RABBITMQ_QUEUE_NAME, (message) => handleMessage(message, channel), {
        noAck: false,
    });
}

AppDataSource.initialize().then(redisClient.connect).then(main).catch(console.error);
