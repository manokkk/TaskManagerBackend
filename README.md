# Task Manager Backend

Express + TypeScript + Prisma SQLite REST API for the Task Manager application.

## Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status |
| `GET` | `/api/tasks` | List all tasks (supports `?status=...&priority=...&search=...`) |
| `GET` | `/api/tasks/:id` | Get details of a single task |
| `POST` | `/api/tasks` | Create a new task |
| `PUT` | `/api/tasks/:id` | Update an existing task |
| `DELETE` | `/api/tasks/:id` | Delete a task |

## Setup & Running

```bash
# 1. Install dependencies
npm install

# 2. Push schema to SQLite database
npm run db:push

# 3. Start development server
npm run dev
```

