import amqp, { ChannelModel } from "amqplib";
import Settings from "./settings";

let connectionPromise: Promise<ChannelModel> | null = null;

export async function getConnection(): Promise<ChannelModel> {
    if (!connectionPromise) {
        connectionPromise = amqp.connect({
            hostname: "snapnet_rabbitmq",
            port: Settings.RABBITMQ_PORT,
            username: Settings.RABBITMQ_USER,
            password: Settings.RABBITMQ_PASSWORD,
        }).then(connection => {
            console.log("RabbitMQ connected");

            connection.on("error", (err) => {
                console.error("RabbitMQ connection error:", err);
                connectionPromise = null;
            });

            connection.on("close", () => {
                console.log("RabbitMQ connection closed");
                connectionPromise = null;
            });

            return connection;
        }).catch(error => {
            console.error("Failed to connect to RabbitMQ:", error);
            connectionPromise = null;
            throw error;
        });
    }

    return connectionPromise;
}

export async function getChannel() {
    const connection = await getConnection();
    return connection.createChannel();
}
