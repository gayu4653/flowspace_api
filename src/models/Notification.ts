import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface INotificationDocument extends Document {
  user_id:      Types.ObjectId;
  actor_id:     Types.ObjectId | null;
  workspace_id: Types.ObjectId | null;
  type:         string;
  message:      string;
  project:      string;
  ref_id:       string | null;
  ref_type:     string | null;
  read:         boolean;
  createdAt:    Date;
  updatedAt:    Date;
}

const notificationSchema = new Schema<INotificationDocument>(
  {
    user_id:      { type: Schema.Types.ObjectId, ref: 'User',      required: true, index: true },
    actor_id:     { type: Schema.Types.ObjectId, ref: 'User',      default: null },
    workspace_id: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null, index: true },
    type:         { type: String, default: 'status' },
    message:      { type: String, required: true },
    project:      { type: String, default: '' },
    ref_id:       { type: String, default: null },
    ref_type:     { type: String, default: null },
    read:         { type: Boolean, default: false },
  },
  { timestamps: true, strict: false },
);

const Notification: Model<INotificationDocument> =
  mongoose.model<INotificationDocument>('Notification', notificationSchema);
export default Notification;
