import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IInboxMessageDocument extends Document {
  sender_id:      Types.ObjectId;
  recipient_id:   Types.ObjectId;
  workspace_id:   Types.ObjectId | null;
  type:           string;
  project:        string;
  snippet:        string;
  ref_card_id:    Types.ObjectId | null;
  ref_meeting_id: Types.ObjectId | null;
  read:           boolean;
  archived:       boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

const inboxMessageSchema = new Schema<IInboxMessageDocument>(
  {
    sender_id:      { type: Schema.Types.ObjectId, ref: 'User',      required: true },
    recipient_id:   { type: Schema.Types.ObjectId, ref: 'User',      required: true, index: true },
    workspace_id:   { type: Schema.Types.ObjectId, ref: 'Workspace', default: null, index: true },
    type:           { type: String, default: 'status' },
    project:        { type: String, default: '' },
    snippet:        { type: String, default: '' },
    ref_card_id:    { type: Schema.Types.ObjectId, ref: 'Card',    default: null },
    ref_meeting_id: { type: Schema.Types.ObjectId, ref: 'Meeting', default: null },
    read:           { type: Boolean, default: false },
    archived:       { type: Boolean, default: false },
  },
  { timestamps: true, strict: false },
);

const InboxMessage: Model<IInboxMessageDocument> =
  mongoose.model<IInboxMessageDocument>('InboxMessage', inboxMessageSchema);
export default InboxMessage;
