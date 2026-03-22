import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IMeetingDocument extends Document {
  title:        string;
  date:         Date;
  time:         string;
  duration:     string;
  type:         'video' | 'audio' | 'in-person' | 'standup' | 'client' | 'internal';
  status:       'upcoming' | 'live' | 'done';
  link:         string | null;
  agenda:       string[];
  notes:        string;
  notes_mode:   'points' | 'description';
  agent_name:   string;
  assigners:    Types.ObjectId[];
  attendees:    Types.ObjectId[];
  workspace_id: Types.ObjectId | null;
  created_by:   Types.ObjectId;
  createdAt:    Date;
  updatedAt:    Date;
}

const meetingSchema = new Schema<IMeetingDocument>(
  {
    title:        { type: String, required: true, trim: true },
    date:         { type: Date, required: true },
    time:         { type: String, required: true },
    duration:     { type: String, default: '30 min' },
    type:         { type: String, enum: ['video', 'audio', 'in-person', 'standup', 'client', 'internal'], default: 'video' },
    status:       { type: String, enum: ['upcoming', 'live', 'done'], default: 'upcoming' },
    link:         { type: String, default: null },
    agenda:       [{ type: String }],
    notes:        { type: String, default: '' },
    notes_mode:   { type: String, enum: ['points', 'description'], default: 'points' },
    agent_name:   { type: String, default: '' },
    assigners:    [{ type: Schema.Types.ObjectId, ref: 'User' }],
    attendees:    [{ type: Schema.Types.ObjectId, ref: 'User' }],
    workspace_id: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    created_by:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

const Meeting: Model<IMeetingDocument> = mongoose.model<IMeetingDocument>('Meeting', meetingSchema);
export default Meeting;
