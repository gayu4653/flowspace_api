import { Request, Response } from 'express';
import { Types } from 'mongoose';
import InboxMessage from '../models/InboxMessage';

const BASE_URL = process.env.BASE_URL ?? '';

const resolveAvatar = (photo: string | null | undefined): string | null => {
  if (!photo) return null;
  return photo.startsWith('/uploads') ? `${BASE_URL}${photo}` : photo;
};

const formatMessage = (m: any) => ({
  id:             String(m._id),
  sender:         m.sender_id?.name      ?? 'Unknown',
  avatar:         resolveAvatar(m.sender_id?.profile_photo),
  project:        m.project              ?? '',
  snippet:        m.snippet              ?? '',
  timestamp:      m.createdAt,
  unread:         !m.read,
  type:           m.type                 ?? 'status',
  ref_card_id:    m.ref_card_id    ? String(m.ref_card_id)    : null,
  ref_meeting_id: m.ref_meeting_id ? String(m.ref_meeting_id) : null,
});

const workspaceFilter = (recipientId: Types.ObjectId, workspaceId?: string) => {
  const base: any = { recipient_id: recipientId, archived: false };
  if (workspaceId) {
    base.$or = [
      { workspace_id: new Types.ObjectId(workspaceId) },
      { workspace_id: null },
      { workspace_id: { $exists: false } },
    ];
  }
  return base;
};

// GET /api/inbox/debug — shows logged-in user and raw counts
export const debugInbox = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipientId = new Types.ObjectId(String(req.user!._id));
    const workspaceId = req.query.workspace_id as string | undefined;

    const totalForUser  = await InboxMessage.countDocuments({ recipient_id: recipientId, archived: false });
    const filter        = workspaceFilter(recipientId, workspaceId);
    const totalFiltered = await InboxMessage.countDocuments(filter);
    const sample        = await InboxMessage.find({ recipient_id: recipientId, archived: false }).limit(5).lean();

    res.status(200).json({
      success: true,
      debug: {
        logged_in_user_id: String(req.user!._id),
        logged_in_user_name: (req.user as any)?.name,
        workspace_id_queried: workspaceId ?? null,
        total_inbox_for_user: totalForUser,
        inbox_matching_workspace_filter: totalFiltered,
        filter_used: filter,
        sample_messages: sample.map((m: any) => ({
          _id: String(m._id),
          recipient_id: String(m.recipient_id),
          workspace_id: m.workspace_id ? String(m.workspace_id) : null,
          type: m.type,
          snippet: m.snippet,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getInbox = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipientId = new Types.ObjectId(String(req.user!._id));
    const filter      = workspaceFilter(recipientId, req.query.workspace_id as string | undefined);

    if (req.query.type && req.query.type !== 'All') filter.type = req.query.type;
    if (req.query.unread === 'true') filter.read = false;
    if (req.query.after) filter.createdAt = { $gt: new Date(String(req.query.after)) };

    const messages = await InboxMessage.find(filter)
      .populate('sender_id', 'name emailid profile_photo')
      .sort({ createdAt: -1 })
      .lean();

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).json({ success: true, data: (messages as any[]).map(formatMessage) });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipientId = new Types.ObjectId(String(req.user!._id));
    const filter      = workspaceFilter(recipientId, req.query.workspace_id as string | undefined);
    filter.read       = false;
    const count = await InboxMessage.countDocuments(filter);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, count });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getMessageById = async (req: Request, res: Response): Promise<void> => {
  try {
    const msg = await InboxMessage.findOne({
      _id: req.params.id,
      recipient_id: new Types.ObjectId(String(req.user!._id)),
    }).populate('sender_id', 'name emailid profile_photo').lean();
    if (!msg) { res.status(404).json({ success: false, message: 'Message not found' }); return; }
    res.status(200).json({ success: true, data: formatMessage(msg) });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const markRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await InboxMessage.findOneAndUpdate(
      { _id: req.params.id, recipient_id: new Types.ObjectId(String(req.user!._id)) },
      { read: true },
    );
    res.status(200).json({ success: true, message: 'Marked as read' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipientId = new Types.ObjectId(String(req.user!._id));
    const filter      = workspaceFilter(recipientId, req.query.workspace_id as string | undefined);
    filter.read       = false;
    await InboxMessage.updateMany(filter, { read: true });
    res.status(200).json({ success: true, message: 'All messages marked as read' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const archiveMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    await InboxMessage.findOneAndUpdate(
      { _id: req.params.id, recipient_id: new Types.ObjectId(String(req.user!._id)) },
      { archived: true },
    );
    res.status(200).json({ success: true, message: 'Message archived' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  try {
    await InboxMessage.findOneAndDelete({
      _id: req.params.id,
      recipient_id: new Types.ObjectId(String(req.user!._id)),
    });
    res.status(200).json({ success: true, message: 'Message deleted' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const sendReply = async (req: Request, res: Response): Promise<void> => {
  try {
    const { recipient_id, type, project, snippet, ref_card_id, workspace_id } = req.body;
    if (!recipient_id) { res.status(400).json({ success: false, message: 'recipient_id is required' }); return; }
    const msg = await InboxMessage.create({
      sender_id:    req.user!._id,
      recipient_id,
      workspace_id: workspace_id ?? null,
      type:         type        ?? 'comment',
      project:      project     ?? '',
      snippet:      snippet     ?? '',
      ref_card_id:  ref_card_id ?? null,
    });
    res.status(201).json({ success: true, data: msg });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
