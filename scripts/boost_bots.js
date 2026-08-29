const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db')).openDb(path.join(__dirname, '..', 'data', 'stellar-nexus.db'));

const empires = db.prepare("SELECT id, name FROM empires WHERE name LIKE 'Bot %'").all();
empires.forEach(e => {
  const planets = db.prepare('SELECT id FROM planets WHERE empire_id = ?').all(e.id);
  planets.forEach(p => {
    // Erhöhe Startressourcen für schnellere Entwicklung
    db.prepare('UPDATE planets SET metal = 5000, helium = 3000, energy = 4000, crystal = 1000, diamond = 100, titan = 1000 WHERE id = ?').run(p.id);
    console.log(e.name + ' - Ressourcen erhöht');
  });
});
