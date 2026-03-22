import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface ITagDocument extends Document {
  user_id:      Types.ObjectId;
  workspace_id: Types.ObjectId | null;
  tag_name:     string;
  color:        string;
  status:       'active' | 'deactive' | 'delete';
  createdAt:    Date;
  updatedAt:    Date;
}

const tagSchema = new Schema<ITagDocument>(
  {
    user_id:      { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workspace_id: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    tag_name:     { type: String, required: true, trim: true },
    color:        { type: String, required: true, default: '#7B5CFA' },
    status:       { type: String, enum: ['active', 'deactive', 'delete'], default: 'active' },
  },
  { timestamps: true },
);

const Tag: Model<ITagDocument> = mongoose.model<ITagDocument>('Tag', tagSchema);
export default Tag;
