// ══════════════════════════════════════════════════════════════════════════════
// scripts/seed-lnd-dashboard-data.mjs
//
// Unified orchestrator for L&D Dashboard & TNA data seeding across the 5 canonical offices:
//   1. IPCR Competency Matches (feeds TNA cards, heatmap, and priority gaps)
//   2. Training Attendance Enrollments (feeds Trainings Done & Year-to-Date Compliance)
//   3. IDP Submissions (feeds IDP cards & Department Stacked Chart)
//
// Usage:
//   node scripts/seed-lnd-dashboard-data.mjs --dry      # Dry run summary of all modules
//   node scripts/seed-lnd-dashboard-data.mjs --sql      # Export unified seed-lnd-dashboard-data.sql
//   node scripts/seed-lnd-dashboard-data.mjs --apply    # Live database batch upsert
// ══════════════════════════════════════════════════════════════════════════════

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const args = process.argv.slice(2).join(' ');

console.log('═'.repeat(78));
console.log('UNIFIED L&D DASHBOARD & TNA DATA SEEDER');
console.log('═'.repeat(78));

// 1. IPCR Competency Matches
console.log('\n[1/3] Running IPCR Competencies Seeder...');
execSync(`node scripts/seed-ipcr-competencies.mjs ${args}`, { stdio: 'inherit' });

// 2. Training Attendance Enrollments
console.log('\n[2/3] Running Training Attendance Seeder...');
execSync(`node scripts/seed-training-attendance.mjs ${args}`, { stdio: 'inherit' });

// 3. IDP Submissions
console.log('\n[3/3] Running IDP Submissions Seeder...');
execSync(`node scripts/seed-idp-submissions.mjs ${args}`, { stdio: 'inherit' });

if (process.argv.includes('--sql')) {
  console.log('\nGenerating consolidated seed-lnd-dashboard-data.sql...');
  const files = [
    'seed-ipcr-competencies.sql',
    'seed-training-attendance.sql',
    'seed-idp-submissions.sql',
  ];
  let combined = `-- ==============================================================================\n-- Consolidated L&D Dashboard & TNA Seed Data\n-- Generated on: ${new Date().toISOString()}\n-- ==============================================================================\n\n`;
  for (const f of files) {
    if (existsSync(f)) {
      combined += `-- Module: ${f}\n` + readFileSync(f, 'utf8') + '\n\n';
    }
  }
  writeFileSync('seed-lnd-dashboard-data.sql', combined, 'utf8');
  console.log('Wrote consolidated SQL to seed-lnd-dashboard-data.sql');
}

console.log('\n' + '═'.repeat(78));
console.log('Seeding orchestration complete. Run verification suite:');
console.log('  node scripts/verify-lnd-dashboard-data.mjs');
console.log('═'.repeat(78));
