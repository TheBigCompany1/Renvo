const pgp = require('pg-promise')();
require('dotenv').config(); // Load environment variables

// Connect to PostgreSQL using the connection string from .env
const db = pgp(process.env.POSTGRES_URI);

db.connect()
  .then((obj) => {
    console.log('✅ PostgreSQL Connected!');
    obj.done(); // release connection
  })
  .catch((error) => {
    console.error('❌ PostgreSQL Connection Error:', error.message || error);
  });

module.exports = db;
