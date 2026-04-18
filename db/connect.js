const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

let connected = false;

async function connectDB() {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('[DB] CRITICAL: MONGODB_URI is missing from .env!');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    connected = true;
    console.log('[DB] Connected to MongoDB Atlas cluster');
  } catch (err) {
    console.error('[DB] Connection failed:', err.message);
  }
}

module.exports = { connectDB };
