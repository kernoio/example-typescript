# Kerno 

## How to use Kerno extension
1. Install the extension from the marketplace

4. Write the Kerno key to wakeup Kerno

3. Kerno will automatically start indexing the codebase

2. When the codebase is indexed you can start creating integration test with Kerno

4. To create an integration tests go to any python file that has an endpoint.

5. When you identify the endpoint that you want to test, press the button **Run tests with kerno** that will be above the endpoint defintion line.

6. Enjoy Kerno

# ![Node/Express/Prisma Example App]

### Example Node (Express + Prisma) codebase containing real world examples (CRUD, auth, advanced patterns, etc)

## Getting Started

## Quick Start

### Prerequisites

Run the following command to install dependencies:

```shell
npm install
```

### Environment variables

This project depends on some environment variables.
If you are running this project locally, create a `.env` file at the root for these variables.
Your host provider should included a feature to set them there directly to avoid exposing them.

Here are the required ones:

```
DATABASE_URL=
JWT_SECRET=
NODE_ENV=production
```

### Generate your Prisma client

Run the following command to generate the Prisma Client which will include types based on your database schema:

```shell
npx prisma generate
```

### Apply any SQL migration script

Run the following command to create/update your database based on existing sql migration scripts:

```shell
npx prisma migrate deploy
```

### Run the project

Run the following command to run the project:

```shell
npx nx serve api
```

### Seed the database

The project includes a seed script to populate the database:

```shell
npx prisma db seed
```

## Deploy on a remote server

Run the following command to:

- install dependencies
- apply any new migration sql scripts
- run the server

```shell
npm ci && npx prisma migrate deploy && node dist/api/main.js
```
