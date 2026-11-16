import mongoose from 'mongoose';
import { MONGO_URI, assertDestructiveAllowed } from './env';

/** Drops the whole configured database. Blocked in production unless ALLOW_DESTRUCTIVE_SEED=true. */
async function main() {
  assertDestructiveAllowed('drop the database');
  await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10_000 });
  const name = mongoose.connection.name;
  await mongoose.connection.dropDatabase();
  console.log(`Dropped database "${name}". Run \`npm run db:seed\` to repopulate.`);
}

main()
  .catch((err) => {
    console.error('Reset failed:', err);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
