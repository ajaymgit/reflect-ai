import mongoose from "mongoose";

// Only a SHA-256 hash of the reset token is ever stored, never the raw
// value -- same principle as passwordHash on User. If this collection were
// ever read (DB dump, backup leak, etc.), the hashes alone can't be used to
// reset anyone's password, only the raw tokens mailed to users can.
const passwordResetTokenSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// TTL index: MongoDB automatically deletes documents some time after
// expiresAt passes, so stale/expired reset tokens don't accumulate forever.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 });

export default mongoose.model("PasswordResetToken", passwordResetTokenSchema);
