# 🛰️ Snapnet — Workforce Management Backend

Welcome to **Snapnet**, a scalable **TypeScript-based backend** powering a modern **Workforce Management System**.
It manages **employees**, **departments**, and **leave requests**, and is designed to scale seamlessly as the company grows from **hundreds** to **tens of thousands** of employees.

This document helps new developers understand the architecture, design decisions, and setup process quickly.

---

## 🧠 System Design Summary

Snapnet follows a **clean architecture** with **asynchronous processing** for scalability, maintainability, and performance.

### 🔄 High-Level Flow

1. **API Layer (Express + TSOA)**

   * Handles RESTful HTTP requests for managing departments, employees, and leave requests.
   * Validates input, applies middleware, and delegates to the service layer.

2. **Service & Repository Layers**

   * **Service layer** encapsulates business rules (e.g., leave approval logic).
   * **Repository layer** abstracts database queries via **TypeORM**.

3. **Database (MySQL)**

   * Stores core entities: Department, Employee, and LeaveRequest.
   * Uses **foreign keys** for referential integrity and **indexes** for scalable queries.

4. **Queue Layer (RabbitMQ)**

   * Handles asynchronous processing (e.g., leave request evaluation).
   * Producers publish messages on new leave requests.
   * Workers consume messages, apply business rules, and update the database.

5. **Cache Layer (Redis)**

   * Provides caching for employee lookups, idempotency control, and rate limiting.

6. **Worker System**

   * Listens to `leave.requested` messages.
   * Auto-approves short leaves (≤ 2 days) or marks others as **PENDING_APPROVAL**.
   * Retries failed jobs and ensures **idempotent** message handling.

This modular design ensures **horizontal scalability**, **fault tolerance**, and **clean separation of concerns**.

---

## 🧭 Overview

Snapnet integrates **Express.js**, **TypeORM**, **TSOA**, **RabbitMQ**, and **Redis** into a cohesive, modular architecture that supports high availability and scalability.
It emphasizes:

* **Performance-first architecture**
* **Clean, testable modules**
* **Asynchronous queue-based workflows**
* **Automated API documentation**

---

## 🧱 Project Architecture

```
snapnet/
├── src/
│   ├── config/          # Centralized configs (DB, Redis, RabbitMQ, Env)
│   ├── controllers/     # REST endpoints (TSOA decorators)
│   ├── middlewares/     # Express middlewares (auth, validation, errors)
│   ├── models/          # TypeORM entities (Department, Employee, LeaveRequest)
│   ├── repositories/    # Data access layer (Repository pattern)
│   ├── services/        # Business logic (Service layer pattern)
│   ├── queues/          # RabbitMQ producers & consumers
│   ├── utils/           # Shared utilities (logging, responses, validators)
│   ├── worker.ts        # Background queue processor
│   └── server.ts        # Main Express entrypoint
│   └── app.ts           
├── test/                # Unit & integration tests (Jest + Supertest)
├── docker-compose.yml   # MySQL, RabbitMQ, Redis, and API stack
├── Dockerfile           # API container definition
├── tsoa.json            # OpenAPI/TSOA route config
├── tsconfig.json        # TypeScript config
├── .env.example         # Example environment file
└── package.json         # Dependencies and scripts
```

---

## ⚙️ Quick Start (Developer Setup)

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/0x456665/efemena-esegbue.git
cd efemena-esegbue
```

### 2️⃣ Install Dependencies

```bash
pnpm install
# or
npm install
```

### 3️⃣ Configure Environment

```bash
cp .env.example .env
```

Typical `.env`:

```
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=workforce_db
DB_USER=workforce_user
DB_PASSWORD=your_secure_db_password
DB_ROOT_PASSWORD=your_secure_root_password
```

### 4️⃣ Start Dependencies

```bash
docker-compose up -d
```

This launches:

* **MySQL** (database)
* **RabbitMQ** (message broker)
* **Redis** (cache layer)

### 5️⃣ Start the Server

```bash
pnpm start
```

Application runs at → [http://localhost:3000](http://localhost:3000)
Swagger API docs → [http://localhost:3000/docs](http://localhost:3000/docs)

---

## 🧩 Core Features

### 🏢 Department Management

* `POST /departments` → Create a department
* `GET /departments/:id/employees?page=x&limit=y` → List employees in a department (paginated)

### 👷 Employee Management

* `POST /employees` → Create an employee under a department
* `GET /employees/:id` → Fetch employee details including leave history

### 🌴 Leave Requests

* `POST /leave-requests` → Create a leave request

  * Initial status = **PENDING**
  * Message published to **RabbitMQ** for background processing

**Worker Logic**

* Auto-approves short leaves (≤ 2 days)
* Marks longer leaves as **PENDING_APPROVAL**
* Retries failed jobs using **retry strategy pattern**
* Uses **idempotency control** to prevent duplicates

---

## 🧰 Design Patterns Used

| Pattern                | Purpose                                  |
| ---------------------- | ---------------------------------------- |
| Repository             | Abstracts and isolates data access logic |
| Service Layer          | Encapsulates business logic              |
| Strategy               | Implements retry policies for queue jobs |
| Factory                | Manages creation of queue consumers      |
| Response Wrapper       | Enforces consistent API responses        |
| Idempotency Middleware | Prevents duplicate message handling      |

---

## 🧪 Testing

Run all tests:

```bash
pnpm test
```

Includes:

* ✅ Unit tests for core business rules (e.g., leave approval)
* ✅ Integration tests for REST APIs (via Supertest)
* ✅ Queue integration tests (mock RabbitMQ)

---

## ⚡ Scalability Considerations

| Area          | Approach                                                    |
| ------------- | ----------------------------------------------------------- |
| **Database**  | Proper indexing, pagination, and normalized schema          |
| **Queue**     | Multiple consumers, DLQ (Dead Letter Queue) for failed jobs |
| **API Layer** | Rate limiting, validation, structured responses             |
| **Cache**     | Redis for caching and idempotency tracking                  |
| **Workers**   | Horizontally scalable consumers with retry mechanisms       |

---

## 🧱 Technologies

| Layer            | Technology              |
| ---------------- | ----------------------- |
| Language         | TypeScript              |
| Framework        | Express.js              |
| ORM              | TypeORM                 |
| Database         | MySQL                   |
| Cache            | Redis                   |
| Queue            | RabbitMQ                |
| Testing          | Jest + Supertest        |
| API Contract     | TSOA (OpenAPI)          |
| Security         | Helmet, CORS            |
| Containerization | Docker + Docker Compose |

---

## 🧩 Developer Workflow

### 1️⃣ Create or Update a Feature

* Implement business logic in `src/services`
* Handle data access via `src/repositories`
* Expose endpoints through `src/controllers`

### 2️⃣ Generate API Spec & Routes

```bash
pnpm run api:build
```

### 3️⃣ Run Tests

```bash
pnpm test
```

### 4️⃣ Start Worker

```bash
pnpm worker
```

---

## 💡 Bonus Features

| Feature       | Description                             |
| ------------- | --------------------------------------- |
| Caching       | Redis-backed employee and query cache   |
| Health Checks | `/health` and `/queue-health` endpoints |
| Idempotency   | Prevents duplicate leave processing     |

---

## ✅ Onboarding Checklist

✅ Clone the repository
✅ Install dependencies
✅ Configure `.env`
✅ Start Docker services
✅ Run `pnpm start`
✅ Access `http://localhost:3000/docs`
✅ Explore the `src/` directory
✅ Run tests with `pnpm test`

