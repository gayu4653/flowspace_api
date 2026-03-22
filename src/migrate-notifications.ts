/**
 * Migration: backfill workspace_id on notifications and inboxmessages
 *
 * Run ONCE after deploying the updated code:
 *   npx ts-node src/migrate-notifications.ts
 */
import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

const notifSchema   = new mongoose.Schema({}, { strict: false, collection: 'notifications'  });
const inboxSchema   = new mongoose.Schema({}, { strict: false, collection: 'inboxmessages'  });
const cardSchema    = new mongoose.Schema({ board_id: mongoose.Schema.Types.ObjectId }, { strict: false, collection: 'cards' });
const boardSchema   = new mongoose.Schema({ workspace_id: mongoose.Schema.Types.ObjectId }, { strict: false, collection: 'boards' });
const meetingSchema = new mongoose.Schema({ workspace_id: mongoose.Schema.Types.ObjectId }, { strict: false, collection: 'meetings' });

const NotifModel   = mongoose.model('MigNotif',   notifSchema);
const InboxModel   = mongoose.model('MigInbox',   inboxSchema);
const CardModel    = mongoose.model('MigCard',    cardSchema);
const BoardModel   = mongoose.model('MigBoard',   boardSchema);
const MeetingModel = mongoose.model('MigMeeting', meetingSchema);

const wsFromCard = async (cardId: string): Promise<Types.ObjectId | null> => {
  try {
    const card  = await CardModel.findById(cardId).lean()  as any;
    if (!card?.board_id) return null;
    const board = await BoardModel.findById(card.board_id).lean() as any;
    return board?.workspace_id ? new Types.ObjectId(String(board.workspace_id)) : null;
  } catch { return null; }
};

const wsFromMeeting = async (meetingId: string): Promise<Types.ObjectId | null> => {
  try {
    const m = await MeetingModel.findById(meetingId).lean() as any;
    return m?.workspace_id ? new Types.ObjectId(String(m.workspace_id)) : null;
  } catch { return null; }
};

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error('MONGO_URI not set in .env'); process.exit(1); }
  await mongoose.connect(uri);
  console.log('✅ Connected to MongoDB');

  // ── Notifications ──────────────────────────────────────────────────────────
  const notifsMissing = await NotifModel.find({
    $or: [{ workspace_id: { $exists: false } }, { workspace_id: null }],
  }).lean() as any[];
  console.log(`\n📋 Notifications to update: ${notifsMissing.length}`);

  for (const doc of notifsMissing) {
    let wsId: Types.ObjectId | null = null;
    if      (doc.ref_type === 'card'    && doc.ref_id) wsId = await wsFromCard(doc.ref_id);
    else if (doc.ref_type === 'meeting' && doc.ref_id) wsId = await wsFromMeeting(doc.ref_id);
    await NotifModel.updateOne({ _id: doc._id }, { $set: { workspace_id: wsId } });
  }
  console.log(`   ✔ Done`);

  // ── Inbox messages ─────────────────────────────────────────────────────────
  const inboxMissing = await InboxModel.find({
    $or: [{ workspace_id: { $exists: false } }, { workspace_id: null }],
  }).lean() as any[];
  console.log(`\n📬 Inbox messages to update: ${inboxMissing.length}`);

  for (const doc of inboxMissing) {
    let wsId: Types.ObjectId | null = null;
    if      (doc.ref_card_id)    wsId = await wsFromCard(String(doc.ref_card_id));
    else if (doc.ref_meeting_id) wsId = await wsFromMeeting(String(doc.ref_meeting_id));
    await InboxModel.updateOne({ _id: doc._id }, { $set: { workspace_id: wsId } });
  }
  console.log(`   ✔ Done`);

  // ── Indexes ────────────────────────────────────────────────────────────────
  console.log('\n🔍 Ensuring indexes...');
  const db = mongoose.connection.db!;
  await db.collection('notifications').createIndex({ user_id: 1, workspace_id: 1, read: 1, createdAt: -1 });
  await db.collection('inboxmessages').createIndex({ recipient_id: 1, workspace_id: 1, read: 1, createdAt: -1 });
  console.log('   ✔ Indexes ready');

  console.log('\n🎉 Migration complete — restart your server');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => { console.error('❌ Migration failed:', err.message); process.exit(1); });
