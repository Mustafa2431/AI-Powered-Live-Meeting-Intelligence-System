const { connectDB } = require('./db/connect');
const mongoose = require('mongoose');

connectDB().then(async () => {
  const col = mongoose.connection.collection('meetings');
  const docs = await col.find().toArray();
  let count = 0;
  for (const d of docs) {
     if (d.summary === '') {
        console.log('[DEBUG] FOUND A DOC WITH summary = "" ! ID:', d._id);
        count++;
     }
  }
  console.log('[DEBUG] Finished check. Found:', count);
  process.exit(0);
});
