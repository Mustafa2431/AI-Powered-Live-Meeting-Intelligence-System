const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  task:       { type: String, required: true },
  assignee:   { type: String, default: 'Unassigned' },
  confidence: { type: Number, default: 0 },
  status:     { type: String, enum: ['pending', 'in-progress', 'done'], default: 'pending' },
  meetingId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },
  timestamp:  { type: Date, default: Date.now },
});

const MeetingSchema = new mongoose.Schema({
  title:         { type: String, default: 'Meeting' },
  startedAt:     { type: Date, default: Date.now },
  endedAt:       { type: Date },
  transcript:    { type: String, default: '' },
  summary: {
    overview:      { type: String, default: '' },
    topics:        [String],
    decisions:     [String],
    tasks:         [{ task: String, assignee: String }],
    followUps:     [String],
    openQuestions: [String],
    highlights:    [String],
    timeline:      [{ range: String, summary: String }],
    generatedAt:   Date,
  },
  tasks:         [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],
  screenshots:   [{ type: String }],
  openQuestions: [{ question: String, timestamp: String }],
  followUps:     [{ suggestion: String, context: String, timestamp: String }],
  status:        { type: String, enum: ['active', 'completed'], default: 'active' },
});

const Meeting = mongoose.model('Meeting', MeetingSchema);
const Task    = mongoose.model('Task', TaskSchema);

module.exports = { Meeting, Task };
