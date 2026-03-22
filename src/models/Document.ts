import mongoose, { Document as MongoDoc, Schema, Model, Types } from 'mongoose';

export interface IDocumentDocument extends MongoDoc {
  name:         string;
  file_url:     string;
  filename:     string;
  file_type:    'pdf' | 'doc' | 'sheet' | 'image' | 'other';
  file_size:    string;
  workspace_id: Types.ObjectId | null;
  uploaded_by:  Types.ObjectId;
  tags:         string[];
  status:       'active' | 'delete';
  createdAt:    Date;
  updatedAt:    Date;
}

const documentSchema = new Schema<IDocumentDocument>(
  {
    name:         { type: String, required: true, trim: true },
    file_url:     { type: String, required: true },
    filename:     { type: String, required: true },
    file_type:    { type: String, enum: ['pdf', 'doc', 'sheet', 'image', 'other'], default: 'other' },
    file_size:    { type: String, default: '0 KB' },
    workspace_id: { type: Schema.Types.ObjectId, ref: 'Workspace', default: null },
    uploaded_by:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tags:         [{ type: String }],
    status:       { type: String, enum: ['active', 'delete'], default: 'active' },
  },
  { timestamps: true },
);

const DocumentModel: Model<IDocumentDocument> = mongoose.model<IDocumentDocument>('Document', documentSchema);
export default DocumentModel;
