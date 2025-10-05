import { createClient } from "redis";
import Settings from "./settings";

// redis[s]://[[username][:password]@][host][:port][/db-number]:
//
const redisClient = createClient({
    socket:{
        host: "snapnet_redis",
        port: Settings.REDIS_PORT,
    },
    password: Settings.REDIS_PASSWORD,
    database: Settings.REDIS_DB,
});

redisClient.on("error", (err) => {
    console.error("Redis Client Error", err);
});

export default redisClient;
