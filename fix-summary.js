const { connectDB } = require('./db/connect');
const mongoose = require('mongoose');

connectDB().then(async () => {
  const col = mongoose.connection.collection('meetings');

  // Fix docs where summary is stored as a plain string (legacy format)
  const result = await col.updateMany(
    { summary: { $type: 'string' } },
    [{ $set: { summary: { overview: '$summary' } } }]
  );
  console.log('[Fix] summary string docs patched:', result.modifiedCount);

  // Verify no more bad docs remain
  const remaining = await col.countDocuments({ summary: { $type: 'string' } });
  console.log('[Fix] Remaining bad docs:', remaining);

  process.exit(0);
}).catch(e => {
  console.error('[Fix] Error:', e.message);
  process.exit(1);
});
