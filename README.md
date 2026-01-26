# NotifyX Monorepo

NotifyX is a powerful and scalable notification service designed to handle complex notification workflows across multiple providers (FCM, HMS, APNS, Web Push, etc.).

## Project Structure

This is a monorepo containing the following components:

- **[api](file:///Users/awsqi/Documents/aws/notifyX/api)**: The backend API service built with Bun, Express, and Prisma.
- **[portal](file:///Users/awsqi/Documents/aws/notifyX/portal)**: The frontend administration portal built with React, Vite, and Tailwind CSS.
- **[docs](file:///Users/awsqi/Documents/aws/notifyX/docs)**: Documentation regarding user journeys and architecture.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Backend Framework**: [Express](https://expressjs.com/)
- **Database ORM**: [Prisma](https://www.prisma.io/) (PostgreSQL)
- **Message Queue**: [BullMQ](https://docs.bullmq.io/) (Redis)
- **Object Storage**: [MinIO](https://min.io/) (S3 compatible)
- **Frontend Framework**: [React](https://react.dev/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/docs/installation) installed locally.
- [Docker](https://www.docker.com/products/docker-desktop/) and Docker Compose.

### 1. Set up Infrastructure

Spin up the required services (PostgreSQL, Redis, MinIO) using Docker Compose:

```bash
docker-compose up -d
```

### 2. Set up Backend API

Navigate to the `api` directory and follow these steps:

```bash
cd api
cp .env.example .env
bun install
bun run db:migrate
bun run dev
```

The API will be available at `http://localhost:3000`. You can view the API documentation at `http://localhost:3000/docs`.

### 3. Set up Frontend Portal

Navigate to the `portal` directory and follow these steps:

```bash
cd portal
cp .env.example .env
bun install
bun run dev
```

The Portal will be available at `http://localhost:5173`.

---

## Development Commands

### Root

- `docker-compose up -d`: Start infrastructure services.
- `docker-compose down`: Stop infrastructure services.

### API (`/api`)

- `bun run dev`: Start API in development mode with watch.
- `bun run db:generate`: Generate Prisma client.
- `bun run db:migrate`: Run database migrations.
- `bun test`: Run API tests.

### Portal (`/portal`)

- `bun run dev`: Start Portal in development mode.
- `bun run build`: Build Portal for production.
- `bun run lint`: Run linting.

## License

MIT
