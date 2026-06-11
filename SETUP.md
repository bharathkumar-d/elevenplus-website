# 11+ Exam Website — Windows Setup Guide

## Step 1: Install Node.js

1. Go to https://nodejs.org and download the **LTS** version (v20 or higher)
2. Run the installer — accept all defaults, make sure "Add to PATH" is checked
3. Open a new PowerShell window and verify:
   ```
   node --version    # should show v20.x.x
   npm --version     # should show 10.x.x
   ```

## Step 2: Install PostgreSQL

PostgreSQL is the database that stores everything — users, questions, exam papers, results. Think of it like a very powerful Excel that your app reads and writes to automatically.

### 2a — Download

1. Open your browser and go to: **https://www.postgresql.org/download/windows/**
2. Click the big blue **"Download the installer"** link (it takes you to EDB's site)
3. Find the row for **PostgreSQL 16** and click the download icon in the **Windows x86-64** column
4. Save the file (it will be named something like `postgresql-16.x-windows-x64.exe`)

### 2b — Run the installer

1. Double-click the downloaded `.exe` file
2. Click **Next** on the welcome screen
3. **Installation Directory** — leave as default (`C:\Program Files\PostgreSQL\16`), click Next
4. **Select Components** — leave all four ticked (PostgreSQL Server, pgAdmin 4, Stack Builder, Command Line Tools), click Next
5. **Data Directory** — leave as default, click Next
6. **Password** — this is the password for the built-in `postgres` superuser (the master admin of your database). Choose something you'll remember. **Write it down right now** — you'll need it in Step 3.
7. **Port** — leave as `5432`, click Next
8. **Locale** — leave as `Default locale`, click Next
9. Click **Next** on the summary screen, then **Next** again to start installing
10. When it finishes, **uncheck "Launch Stack Builder"** (you don't need it) and click **Finish**

### 2c — Add PostgreSQL to your PATH

This lets you run `psql` commands from PowerShell. You only need to do this once.

1. Press the **Windows key**, type `environment variables`, and click **"Edit the system environment variables"**
2. Click the **"Environment Variables..."** button at the bottom
3. In the **"System variables"** section (bottom half), scroll down and double-click **Path**
4. Click **New** and paste this:
   ```
   C:\Program Files\PostgreSQL\16\bin
   ```
5. Click **OK** → **OK** → **OK** to close all dialogs
6. **Close and reopen PowerShell** (the PATH change won't take effect in an already-open window)

### 2d — Verify the installation

In a new PowerShell window, run:
```powershell
psql --version
```
You should see something like: `psql (PostgreSQL) 16.x`

Now test that the server is running by connecting to it:
```powershell
psql -U postgres
```
It will ask for the password you set in step 2b. Type it and press Enter (the characters won't show — that's normal).

If you see a prompt like `postgres=#` you're in. Type `\q` and press Enter to exit.

> **Troubleshooting:** If you get `psql: error: connection refused`, the PostgreSQL service may not have started. Press Windows key, search for **Services**, find **postgresql-x64-16**, right-click it, and choose **Start**.

---

## Step 3: Create the Database

Now we'll create the specific database and user that the 11+ website will use. This keeps our app data separate from anything else on your PostgreSQL server.

### What we're doing (plain English)
- Creating a database called `elevenplus` — like a folder that holds all our tables
- Creating a user called `elevenplus_user` — the app logs in as this user (not as the superuser `postgres`)
- Giving that user permission to read and write inside that database

### 3a — Open psql as the superuser

Open PowerShell and run:
```powershell
psql -U postgres
```
Enter your `postgres` superuser password. You'll see the `postgres=#` prompt.

### 3b — Run the setup commands

Copy and paste each line below, pressing Enter after each one:

```sql
CREATE DATABASE elevenplus;
```
You should see: `CREATE DATABASE`

```sql
CREATE USER elevenplus_user WITH PASSWORD 'changeThisPassword123';
```
You should see: `CREATE ROLE`
> **Important:** Replace `changeThisPassword123` with your own password. Use something with letters, numbers, and a symbol. You'll put this same password in your `.env` file in Step 5.

```sql
GRANT ALL PRIVILEGES ON DATABASE elevenplus TO elevenplus_user;
```
You should see: `GRANT`

```sql
\c elevenplus
```
This switches your connection into the `elevenplus` database. You'll see: `You are now connected to database "elevenplus" as user "postgres".`

```sql
GRANT ALL ON SCHEMA public TO elevenplus_user;
```
You should see: `GRANT`

### 3c — Verify and exit

Check the database was created:
```sql
\l
```
You should see `elevenplus` listed in the table of databases.

Now exit:
```sql
\q
```

### 3d — Test the app user can connect

```powershell
psql -U elevenplus_user -d elevenplus
```
Enter the password you set for `elevenplus_user`. If you see `elevenplus=>` you're all set. Type `\q` to exit.

> **Quick reference — useful psql commands:**
> | Command | What it does |
> |---|---|
> | `\l` | List all databases |
> | `\dt` | List all tables in current database |
> | `\c dbname` | Switch to a different database |
> | `\q` | Quit psql |
> | `\?` | Show all available commands |

## Step 4: Install Project Dependencies

From the project root (`C:\Bharath\AI\Code\11+ website`):
```powershell
npm install
npm run install:all
```

## Step 5: Configure Environment Variables

```powershell
Copy-Item .env.example .env
```

Open `.env` and fill in:
- `DB_PASSWORD` — the password you set for `elevenplus_user`
- `JWT_SECRET` — any long random string (e.g. run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)


## Step 6: Run Database Migrations

```powershell
npm run db:migrate
npm run db:seed
```

## Step 7: Start the Development Servers

```powershell
npm run dev
```

This starts:
- Frontend at http://localhost:3000
- Backend API at http://localhost:5000

## Default Admin Login (after seed)

- Email: `admin@elevenplus.local`
- Password: `Admin@123!`

**Change this immediately after first login.**
