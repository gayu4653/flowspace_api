import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IBoardDocument extends Document {
  name:         string;
  color:        string;
  status:       'active' | 'deactive' | 'delete';
  workspace_id: Types.ObjectId | null;
  created_by:   Types.ObjectId;
  position:     number;
  createdAt:    Date;
  updatedAt:    Date;
}

const boardSchema = new Schema<IBoardDocument>(
  {
    name:         { type: String, required: true, trim: true },
    color:        { type: String, required: true, default: '#7c3aed' },
    status:       { type: String, enum: ['active', 'deactive', 'delete'], default: 'active' },
    workspace_id: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    created_by:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    position:     { type: Number, default: 0 },
  },
  { timestamps: true },
);

const Board: Model<IBoardDocument> = mongoose.model<IBoardDocument>('Board', boardSchema);
export default Board;
