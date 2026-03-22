import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IComment extends Document {
  user_id:   Types.ObjectId;
  text:      string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAttachment extends Document {
  document_id: Types.ObjectId;
  file_url:    string;
  filename:    string;
  file_type:   string;
  file_size:   string;
  name:        string;
  createdAt:   Date;
  updatedAt:   Date;
}

export interface ICardDocument extends Document {
  title:         string;
  description:   string;
  board_id:      Types.ObjectId;
  assigners:     Types.ObjectId[];
  tags:          Types.ObjectId[];
  card_priority: 'low' | 'medium' | 'high';
  card_status:   'todo' | 'in_progress' | 'in_review' | 'done';
  due_from:      Date | null;
  due_to:        Date | null;
  status:        'active' | 'archive' | 'delete';
  bookmarked:    boolean;
  position:      number;
  comments:      Types.DocumentArray<IComment>;
  attachments:   Types.DocumentArray<IAttachment>;
  createdAt:     Date;
  updatedAt:     Date;
}

const commentSchema = new Schema<IComment>(
  {
    user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text:    { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

const attachmentSchema = new Schema<IAttachment>(
  {
    document_id: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    file_url:    { type: String, required: true },
    filename:    { type: String, required: true },
    file_type:   { type: String, default: 'other' },
    file_size:   { type: String, default: '0 KB' },
    name:        { type: String, default: '' },
  },
  { timestamps: true },
);

const cardSchema = new Schema<ICardDocument>(
  {
    title:         { type: String, required: true, trim: true },
    description:   { type: String, default: '' },
    board_id:      { type: Schema.Types.ObjectId, ref: 'Board', required: true },
    assigners:     [{ type: Schema.Types.ObjectId, ref: 'User' }],
    tags:          [{ type: Schema.Types.ObjectId, ref: 'Tag' }],
    card_priority: { type: String, enum: ['low', 'medium', 'high'], default: 'low' },
    card_status:   { type: String, enum: ['todo', 'in_progress', 'in_review', 'done'], default: 'todo' },
    due_from:      { type: Date, default: null },
    due_to:        { type: Date, default: null },
    status:        { type: String, enum: ['active', 'archive', 'delete'], default: 'active' },
    bookmarked:    { type: Boolean, default: false },
    position:      { type: Number, default: 0 },
    comments:      [commentSchema],
    attachments:   [attachmentSchema],
  },
  { timestamps: true },
);

const Card: Model<ICardDocument> = mongoose.model<ICardDocument>('Card', cardSchema);
export default Card;
