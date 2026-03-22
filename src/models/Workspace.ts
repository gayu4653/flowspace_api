import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IMember {
  user_id:   Types.ObjectId;
  role:      'admin' | 'member';
  joined_at: Date;
}

export interface IWorkspaceDocument extends Document {
  name:       string;
  slug:       string;
  logo:       string | null;
  visibility: 'team' | 'public' | 'private';
  owner_id:   Types.ObjectId;
  members:    IMember[];
  plan:       'free' | 'pro';
  createdAt:  Date;
  updatedAt:  Date;
}

const memberSchema = new Schema<IMember>(
  {
    user_id:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role:      { type: String, enum: ['admin', 'member'], default: 'member' },
    joined_at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const workspaceSchema = new Schema<IWorkspaceDocument>(
  {
    name:       { type: String, required: true, trim: true },
    slug:       { type: String, required: true, unique: true, lowercase: true, trim: true },
    logo:       { type: String, default: null },
    visibility: { type: String, enum: ['team', 'public', 'private'], default: 'team' },
    owner_id:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    members:    [memberSchema],
    plan:       { type: String, enum: ['free', 'pro'], default: 'free' },
  },
  { timestamps: true },
);

const Workspace: Model<IWorkspaceDocument> = mongoose.model<IWorkspaceDocument>('Workspace', workspaceSchema);
export default Workspace;
