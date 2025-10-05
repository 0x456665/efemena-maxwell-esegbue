export default class Settings {
  // ============================================
  // APPLICATION
  // ============================================
  static readonly NODE_ENV = process.env.NODE_ENV || "development";
  static readonly PORT = Number(process.env.PORT) || 3000;

  // ============================================
  // MYSQL DATABASE
  // ============================================
  static readonly DB_TYPE = process.env.DB_TYPE || "mysql";
  static readonly DB_HOST = process.env.DB_HOST || "snapnet_mysql";
  static readonly DB_PORT = Number(process.env.DB_PORT) || 3306;
  static readonly DB_USER = process.env.DB_USER || "db_user";
  static readonly DB_PASSWORD = process.env.DB_PASSWORD || "password2";
  static readonly DB_NAME = process.env.DB_NAME || "workforce_db";
  static readonly DB_ROOT_PASSWORD = process.env.DB_ROOT_PASSWORD || "password";
  static readonly DB_LOGGING = process.env.DB_LOGGING === "true";

  // ============================================
  // REDIS
  // ============================================
  static readonly REDIS_HOST = process.env.REDIS_HOST || "snapnet_redis";
  static readonly REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
  static readonly REDIS_PASSWORD = process.env.REDIS_PASSWORD || "";
  static readonly REDIS_DB = Number(process.env.REDIS_DB) || 0;
  static readonly REDIS_KEY_PREFIX = process.env.REDIS_KEY_PREFIX || "workforce:";

  // ============================================
  // RABBITMQ
  // ============================================
  static readonly RABBITMQ_HOST = process.env.RABBITMQ_HOST || "snapnet_rabbitmq";
  static readonly RABBITMQ_PORT = Number(process.env.RABBITMQ_PORT) || 5672;
  static readonly RABBITMQ_USER = process.env.RABBITMQ_USER || "admin";
  static readonly RABBITMQ_PASSWORD = process.env.RABBITMQ_PASSWORD || "guest";
  static readonly RABBITMQ_MANAGEMENT_PORT = Number(process.env.RABBITMQ_MANAGEMENT_PORT) || 15672;

  static readonly RABBITMQ_QUEUE_NAME = process.env.RABBITMQ_QUEUE_NAME || "leave_requests";
  static readonly RABBITMQ_DLQ_NAME = process.env.RABBITMQ_DLQ_NAME || "leave_requests_dlq";

  // Worker retry strategy
  static readonly MAX_RETRIES = Number(process.env.MAX_RETRIES) || 5;
  static readonly RETRY_BASE_DELAY = Number(process.env.RETRY_BASE_DELAY) || 1000;
  static readonly RETRY_MAX_DELAY = Number(process.env.RETRY_MAX_DELAY) || 60000;

  // ============================================
  // JWT
  // ============================================
  static readonly JWT_SECRET = process.env.JWT_SECRET || "default_secret";
  static readonly JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";
  static readonly JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";

  // ============================================
  // RATE LIMITING
  // ============================================
  static readonly RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 900000;
  static readonly RATE_LIMIT_MAX_REQUESTS = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100;

  // ============================================
  // LOGGING
  // ============================================
  static readonly LOG_LEVEL = process.env.LOG_LEVEL || "info";

  // ============================================
  // CORS
  // ============================================
  static readonly CORS_ORIGIN = (process.env.CORS_ORIGIN || "").split(",");
  static readonly CORS_CREDENTIALS = process.env.CORS_CREDENTIALS === "true";

  // ============================================
  // TESTING
  // ============================================
  static readonly TEST_DB_NAME = process.env.TEST_DB_NAME || "workforce_test_db";
  static readonly TEST_REDIS_DB = Number(process.env.TEST_REDIS_DB) || 1;
}