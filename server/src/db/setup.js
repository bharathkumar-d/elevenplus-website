/**
 * One-time database setup script.
 * Run: node src/db/setup.js <postgres-superuser-password>
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { Client } = require('pg');

const superPassword = process.argv[2];
if (!superPassword) {
  console.error('Usage: node src/db/setup.js <postgres-password>');
  process.exit(1);
}

const APP_DB   = 'elevenplus';
const APP_USER = 'elevenplus_user';
const APP_PASS = 'ElevenPlus@Dev1';

async function setup() {
  // Step 1: Connect as postgres superuser to postgres DB
  const superClient = new Client({
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: superPassword,
  });

  try {
    await superClient.connect();
    console.log('✅ Connected as postgres superuser');
  } catch (err) {
    console.error('❌ Could not connect as postgres:', err.message);
    console.error('   Check that the password is correct and PostgreSQL is running.');
    process.exit(1);
  }

  try {
    // Create app user
    await superClient.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${APP_USER}') THEN
          CREATE USER ${APP_USER} WITH PASSWORD '${APP_PASS}';
        END IF;
      END $$;
    `);
    console.log(`✅ User '${APP_USER}' ready`);

    // Create database
    const dbExists = await superClient.query(
      `SELECT 1 FROM pg_database WHERE datname = '${APP_DB}'`
    );
    if (dbExists.rows.length === 0) {
      await superClient.query(`CREATE DATABASE ${APP_DB} OWNER ${APP_USER}`);
      console.log(`✅ Database '${APP_DB}' created`);
    } else {
      console.log(`ℹ️  Database '${APP_DB}' already exists`);
    }

    // Grant privileges
    await superClient.query(`GRANT ALL PRIVILEGES ON DATABASE ${APP_DB} TO ${APP_USER}`);
    console.log('✅ Privileges granted');
  } catch (err) {
    console.error('❌ Setup error:', err.message);
    await superClient.end();
    process.exit(1);
  }

  await superClient.end();

  // Step 2: Connect to app DB as superuser and grant schema
  const dbClient = new Client({
    host: 'localhost', port: 5432,
    database: APP_DB, user: 'postgres', password: superPassword,
  });
  await dbClient.connect();
  await dbClient.query(`GRANT ALL ON SCHEMA public TO ${APP_USER}`);
  await dbClient.end();
  console.log('✅ Schema permissions set');

  // Step 3: Update .env with the app user password
  const fs   = require('fs');
  const path = require('path');
  const envPath = path.join(__dirname, '../../../.env');
  let env = fs.readFileSync(envPath, 'utf8');
  env = env.replace(/DB_PASSWORD=.*/, `DB_PASSWORD=${APP_PASS}`);
  fs.writeFileSync(envPath, env);
  console.log('✅ .env updated with DB_PASSWORD');

  console.log('\n🎉 Database setup complete! Now run: npm run db:migrate && npm run db:seed');
}

setup();
