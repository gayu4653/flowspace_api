import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IInboxMessageDocument extends Document {
  sender_id:      Types.ObjectId;
  recipient_id:   Types.ObjectId;
  workspace_id:   Types.ObjectId | null;
  type:           string;
  subject:        string;   // NEW — compose subject / card title
  project:        string;
  snippet:        string;   // message body
  ref_card_id:    Types.ObjectId | null;
  ref_meeting_id: Types.ObjectId | null;
  // direction: 'inbox' = received, 'sent' = sent by current user
  direction:      'inbox' | 'sent';
  read:           boolean;
  starred:        boolean;  // NEW — starred flag
  archived:       boolean;
  trashed:        boolean;  // NEW — trash (soft delete)
  thread_id:      string | null;  // NEW — group replies into threads
  createdAt:      Date;
  updatedAt:      Date;
}

const inboxMessageSchema = new Schema<IInboxMessageDocument>(
  {
    sender_id:      { type: Schema.Types.ObjectId, ref: 'User',      required: true },
    recipient_id:   { type: Schema.Types.ObjectId, ref: 'User',      required: true, index: true },
    workspace_id:   { type: Schema.Types.ObjectId, ref: 'Workspace', default: null,  index: true },
    type:           { type: String, default: 'direct' },
    subject:        { type: String, default: '' },
    project:        { type: String, default: '' },
    snippet:        { type: String, default: '' },
    ref_card_id:    { type: Schema.Types.ObjectId, ref: 'Card',    default: null },
    ref_meeting_id: { type: Schema.Types.ObjectId, ref: 'Meeting', default: null },
    direction:      { type: String, enum: ['inbox','sent'], default: 'inbox' },
    read:           { type: Boolean, default: false },
    starred:        { type: Boolean, default: false },
    archived:       { type: Boolean, default: false },
    trashed:        { type: Boolean, default: false },
    thread_id:      { type: String, default: null, index: true },
  },
  { timestamps: true, strict: false },
);

// Compound indexes for fast folder queries
inboxMessageSchema.index({ recipient_id: 1, archived: 1, trashed: 1, createdAt: -1 });
inboxMessageSchema.index({ sender_id: 1, direction: 1, createdAt: -1 });
inboxMessageSchema.index({ thread_id: 1, createdAt: 1 });

const InboxMessage: Model<IInboxMessageDocument> =
  mongoose.model<IInboxMessageDocument>('InboxMessage', inboxMessageSchema);
export default InboxMessage;
