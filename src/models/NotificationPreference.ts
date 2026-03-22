import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface INotificationPreferenceDocument extends Document {
  user_id:       Types.ObjectId;
  email_digest:  boolean;
  task_assigned: boolean;
  mentions:      boolean;
  status_change: boolean;
  new_comment:   boolean;
  file_uploads:  boolean;
  weekly_report: boolean;
  createdAt:     Date;
  updatedAt:     Date;
}

const notificationPreferenceSchema = new Schema<INotificationPreferenceDocument>(
  {
    user_id:       { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    email_digest:  { type: Boolean, default: true },
    task_assigned: { type: Boolean, default: true },
    mentions:      { type: Boolean, default: true },
    status_change: { type: Boolean, default: false },
    new_comment:   { type: Boolean, default: true },
    file_uploads:  { type: Boolean, default: false },
    weekly_report: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const NotificationPreference: Model<INotificationPreferenceDocument> = mongoose.model<INotificationPreferenceDocument>('NotificationPreference', notificationPreferenceSchema);
export default NotificationPreference;
