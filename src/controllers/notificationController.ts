import { Request, Response } from 'express';
import { Types }  from 'mongoose';
import Notification from '../models/Notification';
import NotificationPreference from '../models/NotificationPreference';

const BASE_URL = process.env.BASE_URL ?? '';

const resolveAvatar = (photo: string | null | undefined): string | null => {
  if (!photo) return null;
  return photo.startsWith('/uploads') ? `${BASE_URL}${photo}` : photo;
};

// workspace-aware filter — includes legacy docs with no workspace_id field
const workspaceFilter = (userId: Types.ObjectId, workspaceId?: string) => {
  const base: any = { user_id: userId };
  if (workspaceId) {
    base.$or = [
      { workspace_id: new Types.ObjectId(workspaceId) },
      { workspace_id: null },
      { workspace_id: { $exists: false } },
    ];
  }
  return base;
};

// GET /api/notifications/debug — shows exactly what user is logged in and what exists
export const debugNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId      = new Types.ObjectId(String(req.user!._id));
    const workspaceId = req.query.workspace_id as string | undefined;

    // Count ALL notifs for this user regardless of workspace
    const totalForUser = await Notification.countDocuments({ user_id: userId });

    // Count with workspace filter
    const withWsFilter = workspaceFilter(userId, workspaceId);
    const totalFiltered = await Notification.countDocuments(withWsFilter);

    // Sample of what exists
    const sample = await Notification.find({ user_id: userId }).limit(5).lean();

    res.status(200).json({
      success: true,
      debug: {
        logged_in_user_id: String(req.user!._id),
        logged_in_user_name: (req.user as any)?.name,
        workspace_id_queried: workspaceId ?? null,
        total_notifications_for_user: totalForUser,
        notifications_matching_workspace_filter: totalFiltered,
        filter_used: withWsFilter,
        sample_notifications: sample.map((n: any) => ({
          _id: String(n._id),
          user_id: String(n.user_id),
          workspace_id: n.workspace_id ? String(n.workspace_id) : null,
          type: n.type,
          message: n.message,
        })),
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    console.log('Fetching notifications for user:', userId, 'with query:', req.query);
    const filter  = workspaceFilter(userId, req.query.workspace_id as string | undefined);

    if (req.query.type && req.query.type !== 'All') filter.type = req.query.type;
    if (req.query.unread === 'true') filter.read = false;
    if (req.query.after) filter.createdAt = { $gt: new Date(String(req.query.after)) };

    const notifs = await Notification.find(filter)
      .populate('actor_id', 'name profile_photo')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const formatted = (notifs as any[]).map(n => ({
      id:       String(n._id),
      type:     n.type     ?? 'status',
      actor:    n.actor_id?.name ?? 'System',
      avatar:   resolveAvatar(n.actor_id?.profile_photo),
      message:  n.message  ?? '',
      project:  n.project  ?? '',
      time:     n.createdAt,
      read:     n.read     ?? false,
      ref_id:   n.ref_id   ?? null,
      ref_type: n.ref_type ?? null,
    }));

    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.status(200).json({ success: true, data: formatted, count: formatted.length });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    const filter  = workspaceFilter(userId, req.query.workspace_id as string | undefined);
    filter.read   = false;
    const count = await Notification.countDocuments(filter);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({ success: true, count });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const markRead = async (req: Request, res: Response): Promise<void> => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, user_id: new Types.ObjectId(String(req.user!._id)) },
      { read: true },
    );
    res.status(200).json({ success: true, message: 'Marked as read' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const markAllRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = new Types.ObjectId(String(req.user!._id));
    const filter  = workspaceFilter(userId, req.query.workspace_id as string | undefined);
    filter.read   = false;
    await Notification.updateMany(filter, { read: true });
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    await Notification.findOneAndDelete({
      _id: req.params.id,
      user_id: new Types.ObjectId(String(req.user!._id)),
    });
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getPreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    let prefs = await NotificationPreference.findOne({ user_id: req.user!._id });
    if (!prefs) prefs = await NotificationPreference.create({ user_id: req.user!._id });
    res.status(200).json({ success: true, data: prefs });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const updatePreferences = async (req: Request, res: Response): Promise<void> => {
  try {
    const allowed = ['email_digest','task_assigned','mentions','status_change','new_comment','file_uploads','weekly_report'];
    const updates: Record<string, any> = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
    const prefs = await NotificationPreference.findOneAndUpdate(
      { user_id: req.user!._id }, updates, { new: true, upsert: true },
    );
    res.status(200).json({ success: true, data: prefs });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
