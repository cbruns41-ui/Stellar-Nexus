const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db')).openDb(path.join(__dirname, '..', 'data', 'stellar-nexus.db'));

const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
console.log('Alle Tabellen mit Fremdschluesseln:');
tables.forEach(t => {
  if (t.sql.includes('REFERENCES users')) {
    console.log(`  ${t.name} -> users`);
  }
  if (t.sql.includes('REFERENCES empires')) {
    console.log(`  ${t.name} -> empires`);
  }
});
