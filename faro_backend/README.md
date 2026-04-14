# Database Setup

## Manual SQL Migration

If you want to manually create all tables, run the following SQL in your MySQL client:

```sql
-- (Excerpt) Full SQL is in prisma/migrations/init.sql
-- Example:
CREATE TABLE `User` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`email` VARCHAR(191) NOT NULL,
	`name` VARCHAR(191) NULL,
	`password` VARCHAR(191) NOT NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,
	UNIQUE INDEX `User_email_key`(`email`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- ... (see prisma/migrations/init.sql for all tables and foreign keys)
```

## Prisma: Push Schema to Database

To ensure your database matches your Prisma schema, run:

```bash
npx prisma db push --schema=prisma/schema.prisma
```

This will create or update all tables as defined in your schema.prisma.
This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/pages/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Docker (Backend on a VPS)

This backend runs as a Next.js server (API routes under `app/api/*`).

Build + run locally or on your Hostinger VPS:

```bash
cd atlas_backend
docker compose -f compose.yml up -d --build
```

The container listens on port `5030` by default (see `compose.yml`). If you’re putting it behind Nginx, consider binding only to localhost on the VPS by changing the port mapping to:

```yml
ports:
  - "127.0.0.1:5010:5010"
```

Environment variables are loaded from `atlas_backend/.env` via `env_file:` in `compose.yml`.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

[API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) can be accessed on [http://localhost:3000/api/hello](http://localhost:3000/api/hello). This endpoint can be edited in `pages/api/hello.ts`.

The `pages/api` directory is mapped to `/api/*`. Files in this directory are treated as [API routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes) instead of React pages.

This project uses [`next/font`](https://nextjs.org/docs/pages/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn-pages-router) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/pages/building-your-application/deploying) for more details.
