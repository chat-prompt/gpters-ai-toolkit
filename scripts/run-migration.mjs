import { neon } from '@neondatabase/serverless';
import fs from 'fs';

const sql = neon(process.env.DATABASE_URL);

const migration = fs.readFileSync('./drizzle/0011_oauth_access_tokens.sql', 'utf-8');

// Split by --> statement-breakpoint and filter out comments
const statements = migration
  .split('--> statement-breakpoint')
  .map(s => {
    // Remove comment lines
    return s.split('\n')
      .filter(line => !line.trim().startsWith('--'))
      .join('\n')
      .trim();
  })
  .filter(s => s.length > 0);

console.log(`Running ${statements.length} statements...`);

for (let i = 0; i < statements.length; i++) {
  const stmt = statements[i];
  console.log(`\n[${i + 1}/${statements.length}] Executing...`);
  console.log(stmt.substring(0, 100) + (stmt.length > 100 ? '...' : ''));
  try {
    await sql.query(stmt);
    console.log('✓ Success');
  } catch (error) {
    console.error('✗ Error:', error.message);
    // Continue on some expected errors
    if (!error.message.includes('already exists') && !error.message.includes('does not exist')) {
      throw error;
    }
  }
}

console.log('\n✓ Migration completed!');
