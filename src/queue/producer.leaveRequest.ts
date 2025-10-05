import { getChannel } from "../config/rabbitmq";
import Settings from "../config/settings";
import { LeaveRequesMessage } from "../interfaces/message.interface";

async function sendMessageToQueue(message: LeaveRequesMessage) {
    const channel = await getChannel();

    channel.assertQueue(Settings.RABBITMQ_QUEUE_NAME, {
        durable: true,
    });
    const messageString = JSON.stringify(message);
    channel.sendToQueue(Settings.RABBITMQ_QUEUE_NAME, Buffer.from(messageString));
}

export default sendMessageToQueue;
