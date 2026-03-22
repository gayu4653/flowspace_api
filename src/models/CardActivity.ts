import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export type ActivityActionType =
  | 'created'
  | 'assigned'
  | 'unassigned'
  | 'status_changed'
  | 'priority_changed'
  | 'due_date_set'
  | 'due_date_changed'
  | 'due_date_removed'
  | 'title_changed'
  | 'description_changed'
  | 'comment_added'
  | 'comment_deleted'
  | 'attachment_added'
  | 'attachment_removed'
  | 'bookmarked'
  | 'archived'
  | 'board_moved';

export interface ICardActivityDocument extends Document {
  card_id:   Types.ObjectId;
  user_id:   Types.ObjectId;
  action:    ActivityActionType;
  // Human-readable summary e.g. "moved card to Done"
  message:   string;
  // Optional structured metadata for display
  meta?: {
    from?:    string;
    to?:      string;
    value?:   string;
    target_user_id?: string;
    target_user_name?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const cardActivitySchema = new Schema<ICardActivityDocument>(
  {
    card_id:  { type: Schema.Types.ObjectId, ref: 'Card',  required: true, index: true },
    user_id:  { type: Schema.Types.ObjectId, ref: 'User',  required: true },
    action:   {
      type: String,
      enum: [
        'created','assigned','unassigned','status_changed','priority_changed',
        'due_date_set','due_date_changed','due_date_removed',
        'title_changed','description_changed',
        'comment_added','comment_deleted',
        'attachment_added','attachment_removed',
        'bookmarked','archived','board_moved',
      ],
      required: true,
    },
    message:  { type: String, required: true },
    meta:     {
      type: {
        from:             String,
        to:               String,
        value:            String,
        target_user_id:   String,
        target_user_name: String,
      },
      default: undefined,
    },
  },
  { timestamps: true },
);

const CardActivity: Model<ICardActivityDocument> =
  mongoose.model<ICardActivityDocument>('CardActivity', cardActivitySchema);

export default CardActivity;
