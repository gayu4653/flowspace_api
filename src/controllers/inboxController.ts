import { Request, Response } from 'express';
import { Types } from 'mongoose';
import InboxMessage from '../models/InboxMessage';
import User from '../models/User';

const BASE_URL = process.env.BASE_URL ?? '';

const resolveAvatar = (photo: string | null | undefined): string | null => {
  if (!photo) return null;
  return photo.startsWith('/uploads') ? `${BASE_URL}${photo}` : photo;
};

const formatMessage = (m: any) => ({
  id:             String(m._id),
  thread_id:      m.thread_id ?? String(m._id),
  sender_id:      m.sender_id?._id ? String(m.sender_id._id) : String(m.sender_id),
  sender:         m.sender_id?.name      ?? 'Unknown',
  sender_email:   m.sender_id?.emailid   ?? '',
  avatar:         resolveAvatar(m.sender_id?.profile_photo),
  recipient_id:   m.recipient_id?._id ? String(m.recipient_id._id) : String(m.recipient_id),
  recipient:      m.recipient_id?.name   ?? '',
  recipient_email: m.recipient_id?.emailid ?? '',
  subject:        m.subject   ?? m.project ?? '',
  project:        m.project   ?? '',
  snippet:        m.snippet   ?? '',
  timestamp:      m.createdAt,
  unread:         !m.read,
  starred:        m.starred   ?? false,
  archived:       m.archived  ?? false,
  trashed:        m.trashed   ?? false,
  direction:      m.direction ?? 'inbox',
  type:           m.type      ?? 'direct',
  ref_card_id:    m.ref_card_id    ? String(m.ref_card_id)    : null,
  ref_meeting_id: m.ref_meeting_id ? String(m.ref_meeting_id) : null,
});

// ── GET /api/inbox?folder=inbox|sent|starred|archived|trash|unread ────────────
export const getInbox = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId   = new Types.ObjectId(String(req.user!._id));
    const folder   = (req.query.folder as string) ?? 'inbox';
    const wsId     = req.query.workspace_id as string | undefined;

    let filter: any = {};

    switch (folder) {
      case 'sent':
        // Show messages this user SENT — use direction:'sent' OR sender + no direction field
        filter = {
          sender_id: userId,
          direction: 'sent',
          trashed: false,
        };
        break;

      case 'starred':
        filter = {
          $or: [{ recipient_id: userId }, { sender_id: userId }],
          starred: true,
          trashed: false,
        };
        break;

      case 'archived':
        filter = { recipient_id: userId, archived: true, trashed: false };
        break;

      case 'trash':
        filter = {
          $or: [{ recipient_id: userId }, { sender_id: userId }],
          trashed: true,
        };
        break;

      case 'unread':
        filter = {
          recipient_id: userId,
          read: false,
          archived: false,
          trashed: false,
        };
        break;

      default: // inbox
        // Show ALL messages received by user (regardless of workspace_id on message)
        // This ensures compose messages with workspace_id=null always appear
        filter = {
          recipient_id: userId,
          direction: { $in: ['inbox', null, undefined] }, // inbox direction OR legacy (no direction field)
          archived: false,
          trashed: false,
        };
        break;
    }

    // Workspace filter: only apply for sent/starred/archived/trash — 
    // for inbox, we intentionally don't filter by workspace so all messages appear
    if (wsId && folder !== 'inbox' && folder !== 'unread') {
      filter.$and = filter.$and ?? [];
      filter.$and.push({
        $or: [
          { workspace_id: new Types.ObjectId(wsId) },
          { workspace_id: null },
          { workspace_id: { $exists: false } },
        ],
      });
    }

    if (req.query.type && req.query.type !== 'All') filter.type = req.query.type;
    if (req.query.after) filter.createdAt = { $gt: new Date(String(req.query.after)) };

    const messages = await InboxMessage.find(filter)
      .populate('sender_id',    'name emailid profile_photo')
      .populate('recipient_id', 'name emailid profile_photo')
      .sort({ createdAt: -1 })
      .lean();

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).json({ success: true, data: (messages as any[]).map(formatMessage) });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── GET /api/inbox/count ──────────────────────────────────────────────────────
export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    // Count all unread inbox messages (no workspace filter so compose messages count too)
    const count = await InboxMessage.countDocuments({
      recipient_id: userId,
      read: false,
      archived: false,
      trashed: false,
    });
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, count });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── GET /api/inbox/thread/:threadId ──────────────────────────────────────────
// Returns one message per thread step — no duplicates
// Sent copies (direction:'sent') are shown to sender; inbox copies to recipient
export const getThread = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));

    // Strategy: Get all messages in thread that belong to this user
    // Each composed/replied message creates 2 docs (sent + inbox)
    // We show the SENT copy to the sender and INBOX copy to the recipient
    // To avoid duplicates we group by a content key and pick the right direction
    const all = await InboxMessage.find({
      thread_id: req.params.threadId,
      $or: [{ recipient_id: userId }, { sender_id: userId }],
    })
      .populate('sender_id',    'name emailid profile_photo')
      .populate('recipient_id', 'name emailid profile_photo')
      .sort({ createdAt: 1 })
      .lean() as any[];

    // Deduplicate: for each pair of sent+inbox docs (same sender, same snippet, same timestamp ~),
    // show only the one that's most relevant to this user:
    //   - If I sent it → show sent copy (direction:'sent')
    //   - If I received it → show inbox copy (direction:'inbox')
    const seen = new Set<string>();
    const deduped: any[] = [];

    for (const msg of all) {
      const senderId = msg.sender_id?._id ? String(msg.sender_id._id) : String(msg.sender_id);
      const iAmSender = senderId === String(userId);
      const dir = msg.direction ?? 'inbox';

      // Pick the correct direction copy
      if (iAmSender && dir !== 'sent') continue;   // I sent it → skip inbox copy
      if (!iAmSender && dir !== 'inbox') continue; // I received it → skip sent copy

      // Deduplicate by thread position (snippet + sender)
      const key = `${senderId}:${msg.snippet?.slice(0, 50)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(msg);
    }

    res.status(200).json({ success: true, data: deduped.map(formatMessage) });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── GET /api/inbox/:id ────────────────────────────────────────────────────────
export const getMessageById = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    const msg = await InboxMessage.findOne({
      _id: req.params.id,
      $or: [{ recipient_id: userId }, { sender_id: userId }],
    })
      .populate('sender_id',    'name emailid profile_photo')
      .populate('recipient_id', 'name emailid profile_photo')
      .lean();
    if (!msg) { res.status(404).json({ success: false, message: 'Message not found' }); return; }
    res.status(200).json({ success: true, data: formatMessage(msg) });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── POST /api/inbox/compose ───────────────────────────────────────────────────
export const composeMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { to_email, subject, body, workspace_id } = req.body;
    if (!to_email)   { res.status(400).json({ success: false, message: 'to_email is required' }); return; }
    if (!body?.trim()) { res.status(400).json({ success: false, message: 'body is required' }); return; }

    const recipient = await User.findOne({ emailid: String(to_email).toLowerCase().trim() });
    if (!recipient) {
      res.status(404).json({ success: false, message: `No user found with email: ${to_email}` });
      return;
    }

    const threadId = crypto.randomUUID();

    // Inbox copy — for recipient
    await InboxMessage.create({
      sender_id:    req.user!._id,
      recipient_id: recipient._id,
      workspace_id: workspace_id ?? null,
      type:         'direct',
      subject:      subject ?? '',
      project:      subject ?? '',
      snippet:      body.trim(),
      direction:    'inbox',
      thread_id:    threadId,
      read:         false,
      starred:      false,
      archived:     false,
      trashed:      false,
    });

    // Sent copy — for sender
    await InboxMessage.create({
      sender_id:    req.user!._id,
      recipient_id: recipient._id,
      workspace_id: workspace_id ?? null,
      type:         'direct',
      subject:      subject ?? '',
      project:      subject ?? '',
      snippet:      body.trim(),
      direction:    'sent',
      thread_id:    threadId,
      read:         true,
      starred:      false,
      archived:     false,
      trashed:      false,
    });

    res.status(201).json({
      success: true,
      message: `Message sent to ${recipient.name} (${recipient.emailid})`,
      data: { thread_id: threadId },
    });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── POST /api/inbox/reply ─────────────────────────────────────────────────────
export const replyToMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const { message_id, body, workspace_id,
            // Legacy system notification reply fields
            recipient_id: legacyRecipientId, project, snippet } = req.body;

    const userId = new Types.ObjectId(String(req.user!._id));

    // Legacy path: system generated notifications use recipient_id directly
    if (!message_id && legacyRecipientId) {
      await InboxMessage.create({
        sender_id:    userId,
        recipient_id: legacyRecipientId,
        workspace_id: workspace_id ?? null,
        type:         'comment',
        subject:      project ?? '',
        project:      project ?? '',
        snippet:      snippet ?? body ?? '',
        direction:    'inbox',
        thread_id:    null,
        read:         false,
      });
      res.status(201).json({ success: true });
      return;
    }

    if (!message_id) { res.status(400).json({ success: false, message: 'message_id is required' }); return; }
    const replyBody = (body ?? snippet ?? '').trim();
    if (!replyBody)  { res.status(400).json({ success: false, message: 'body is required' }); return; }

    // Find original to get thread context
    const original = await InboxMessage.findOne({
      _id: message_id,
      $or: [{ recipient_id: userId }, { sender_id: userId }],
    }).lean() as any;

    if (!original) { res.status(404).json({ success: false, message: 'Original message not found' }); return; }

    const iAmSender   = String(original.sender_id) === String(userId);
    const replyToId   = iAmSender ? original.recipient_id : original.sender_id;
    const threadId    = original.thread_id ?? String(original._id);

    // Inbox copy for recipient
    await InboxMessage.create({
      sender_id:    userId,
      recipient_id: replyToId,
      workspace_id: workspace_id ?? original.workspace_id ?? null,
      type:         'direct',
      subject:      `Re: ${original.subject || original.project || ''}`,
      project:      original.project ?? '',
      snippet:      replyBody,
      direction:    'inbox',
      thread_id:    threadId,
      read:         false,
      ref_card_id:  original.ref_card_id ?? null,
    });

    // Sent copy for sender
    await InboxMessage.create({
      sender_id:    userId,
      recipient_id: replyToId,
      workspace_id: workspace_id ?? original.workspace_id ?? null,
      type:         'direct',
      subject:      `Re: ${original.subject || original.project || ''}`,
      project:      original.project ?? '',
      snippet:      replyBody,
      direction:    'sent',
      thread_id:    threadId,
      read:         true,
      ref_card_id:  original.ref_card_id ?? null,
    });

    // Mark original as read
    await InboxMessage.findByIdAndUpdate(message_id, { read: true });

    res.status(201).json({ success: true, message: 'Reply sent', thread_id: threadId });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const sendReply = replyToMessage; // backward compat

// ── PUT /api/inbox/:id/read ───────────────────────────────────────────────────
export const markRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    await InboxMessage.findOneAndUpdate(
      { _id: req.params.id, $or: [{ recipient_id: userId }, { sender_id: userId }] },
      { read: true },
    );
    res.status(200).json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── PUT /api/inbox/read-all ───────────────────────────────────────────────────
export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    await InboxMessage.updateMany(
      { recipient_id: userId, read: false, trashed: false },
      { read: true },
    );
    res.status(200).json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── PUT /api/inbox/:id/star ───────────────────────────────────────────────────
export const toggleStar = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    const msg = await InboxMessage.findOne({
      _id: req.params.id,
      $or: [{ recipient_id: userId }, { sender_id: userId }],
    });
    if (!msg) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    msg.starred = !msg.starred;
    await msg.save();
    res.status(200).json({ success: true, starred: msg.starred });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── PUT /api/inbox/:id/archive ────────────────────────────────────────────────
export const archiveMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    await InboxMessage.findOneAndUpdate(
      { _id: req.params.id, recipient_id: userId },
      { archived: true, trashed: false },
    );
    res.status(200).json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── PUT /api/inbox/:id/unarchive ──────────────────────────────────────────────
export const unarchiveMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    await InboxMessage.findOneAndUpdate(
      { _id: req.params.id, recipient_id: userId },
      { archived: false },
    );
    res.status(200).json({ success: true });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── DELETE /api/inbox/:id ─────────────────────────────────────────────────────
export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    const msg = await InboxMessage.findOne({
      _id: req.params.id,
      $or: [{ recipient_id: userId }, { sender_id: userId }],
    });
    if (!msg) { res.status(404).json({ success: false, message: 'Not found' }); return; }
    if (msg.trashed) {
      await InboxMessage.findByIdAndDelete(req.params.id);
      res.status(200).json({ success: true, message: 'Permanently deleted' });
    } else {
      msg.trashed  = true;
      msg.archived = false;
      await msg.save();
      res.status(200).json({ success: true, message: 'Moved to trash' });
    }
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── GET /api/inbox/search?q= ──────────────────────────────────────────────────
export const searchMessages = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    const q = String(req.query.q ?? '').trim();
    if (!q) { res.status(200).json({ success: true, data: [] }); return; }
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const msgs = await InboxMessage.find({
      $or: [{ recipient_id: userId }, { sender_id: userId }],
      trashed: false,
      $and: [{ $or: [{ snippet: regex }, { subject: regex }, { project: regex }] }],
    } as any)
      .populate('sender_id',    'name emailid profile_photo')
      .populate('recipient_id', 'name emailid profile_photo')
      .sort({ createdAt: -1 })
      .limit(30)
      .lean();
    res.status(200).json({ success: true, data: (msgs as any[]).map(formatMessage) });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// ── GET /api/inbox/debug ──────────────────────────────────────────────────────
export const debugInbox = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    const total  = await InboxMessage.countDocuments({ $or: [{ recipient_id: userId }, { sender_id: userId }] });
    const unread = await InboxMessage.countDocuments({ recipient_id: userId, read: false });
    res.status(200).json({ success: true, debug: { user_id: String(userId), total, unread } });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
