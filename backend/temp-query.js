const db = require('./node_modules/better-sqlite3')('../data/hackernews.db');
const rows = db.prepare("SELECT story_id, title_snapshot, status FROM article_translations WHERE title_snapshot LIKE '%Labubu%' OR title_snapshot LIKE '%衰落%' OR title_snapshot LIKE '%陨落%'").all();
console.log(JSON.stringify(rows, null, 2));
db.close();
