import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface ISupportMessageDocument extends Document {
  user_id:  Types.ObjectId | null;
  name:     string;
  emailid:  string;
  subject:  string;
  category: string;
  message:  string;
  status:   'open' | 'closed';
  createdAt: Date;
  updatedAt: Date;
}

const supportMessageSchema = new Schema<ISupportMessageDocument>(
  {
    user_id:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
    name:     { type: String, required: true, trim: true },
    emailid:  { type: String, required: true, trim: true, lowercase: true },
    subject:  { type: String, required: true, trim: true },
    category: { type: String, default: 'general' },
    message:  { type: String, required: true, trim: true },
    status:   { type: String, enum: ['open', 'closed'], default: 'open' },
  },
  { timestamps: true },
);

const SupportMessage: Model<ISupportMessageDocument> = mongoose.model<ISupportMessageDocument>('SupportMessage', supportMessageSchema);
export default SupportMessage;
