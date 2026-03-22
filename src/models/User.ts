import mongoose, { Document, Schema, Model } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUserDocument extends Document {
  name:                 string;
  emailid:              string;
  password:             string;
  role:                 'admin' | 'user';
  profile_photo:        string | null;
  title:                string;
  timezone:             string;
  language:             string;
  google_id:            string | null;
  auth_provider:        'local' | 'google';
  email_verified:       boolean;
  two_factor_enabled:   boolean;
  two_factor_code:      string | null;
  reset_otp:            string | null;
  reset_otp_expires_at: Date | null;
  createdAt:            Date;
  updatedAt:            Date;
  matchPassword(entered: string): Promise<boolean>;
  toPublic(): Omit<IUserDocument, 'password' | 'reset_otp' | 'reset_otp_expires_at' | 'two_factor_code'>;
}

const userSchema = new Schema<IUserDocument>(
  {
    name:                 { type: String, required: true, trim: true },
    emailid:              { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:             { type: String, required: true, minlength: 6 },
    role:                 { type: String, enum: ['admin', 'user'], default: 'user' },
    profile_photo:        { type: String, default: null },
    title:                { type: String, default: '' },
    timezone:             { type: String, default: 'Asia/Kolkata (IST)' },
    language:             { type: String, default: 'English (US)' },
    google_id:            { type: String, default: null },
    auth_provider:        { type: String, enum: ['local', 'google'], default: 'local' },
    email_verified:       { type: Boolean, default: false },
    two_factor_enabled:   { type: Boolean, default: false },
    two_factor_code:      { type: String, default: null },
    reset_otp:            { type: String, default: null },
    reset_otp_expires_at: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword: string): Promise<boolean> {
  return bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.toPublic = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.reset_otp;
  delete obj.reset_otp_expires_at;
  delete obj.two_factor_code;
  return obj;
};

const User: Model<IUserDocument> = mongoose.model<IUserDocument>('User', userSchema);
export default User;
