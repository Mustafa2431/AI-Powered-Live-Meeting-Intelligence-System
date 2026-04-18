const mongoose = require('mongoose');
require('dotenv').config();

async function cleanLegacy() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  
  // Clean string summary
  const result1 = await db.collection('meetings').updateMany(
    { summary: { $type: 'string' } },
    { $unset: { summary: '' } }
  );
  console.log('Fixed legacy summary docs:', result1.modifiedCount);
  
  // Clean legacy tasks arrays containing strings instead of object ids!
  let invalidTasksFixed = 0;
  const meetings = await db.collection('meetings').find({}).toArray();
  for (const m of meetings) {
    if (Array.isArray(m.tasks) && m.tasks.length > 0) {
      if (typeof m.tasks[0] === 'string') {
        await db.collection('meetings').updateOne(
          { _id: m._id },
          { $set: { tasks: [] } }
        );
        invalidTasksFixed++;
      }
    }
  }
  console.log('Fixed legacy task arrays:', invalidTasksFixed);

  process.exit(0);
}
cleanLegacy();
