import Settings from "../config/settings";
import { getChannel } from "../config/rabbitmq";
import { LeaveResponseDLQMessage } from "../interfaces/message.interface";

async function sendMessageToDLQ(message: LeaveResponseDLQMessage) {
    const channel = await getChannel();
    await channel.assertQueue(Settings.RABBITMQ_QUEUE_NAME, {
        durable: true,
    });
    const messageString = JSON.stringify(message);
    channel.sendToQueue(Settings.RABBITMQ_DLQ_NAME, Buffer.from(messageString));
}

export default sendMessageToDLQ;
