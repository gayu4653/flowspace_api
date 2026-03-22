import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Card from '../models/Card';
import Board from '../models/Board';
import Workspace from '../models/Workspace';
import Notification from '../models/Notification';
import InboxMessage from '../models/InboxMessage';
import DocumentModel from '../models/Document';
import CardActivity from '../models/CardActivity';

// ── Helpers ───────────────────────────────────────────────────────────────────

// Get workspace_id from a board_id — most reliable source (board always knows its workspace)
const wsFromBoard = async (boardId: Types.ObjectId | string): Promise<Types.ObjectId | null> => {
  const board = await Board.findById(boardId).select('workspace_id').lean() as any;
  return board?.workspace_id ? new Types.ObjectId(String(board.workspace_id)) : null;
};

// Fallback: get workspace from user membership (used when board_id unknown)
const wsFromUser = async (userId: Types.ObjectId): Promise<Types.ObjectId | null> => {
  const ws = await Workspace.findOne({
    $or: [{ owner_id: userId }, { 'members.user_id': userId }],
  }).select('_id').lean() as any;
  return ws?._id ? new Types.ObjectId(String(ws._id)) : null;
};

const getWorkspaceBoardIds = async (userId: Types.ObjectId, workspaceId?: string): Promise<Types.ObjectId[]> => {
  if (workspaceId) {
    const boards = await Board.find({ workspace_id: workspaceId, status: { $ne: 'delete' } });
    return boards.map(b => b._id as Types.ObjectId);
  }
  const ws = await Workspace.findOne({ $or: [{ owner_id: userId }, { 'members.user_id': userId }] });
  const boards = await Board.find({
    ...(ws ? { workspace_id: ws._id } : { created_by: userId }),
    status: { $ne: 'delete' },
  });
  return boards.map(b => b._id as Types.ObjectId);
};

const detectType = (mime: string, fn: string): string => {
  if (mime === 'application/pdf') return 'pdf';
  if (mime.includes('word') || /\.docx?$/i.test(fn)) return 'doc';
  if (mime.includes('sheet') || mime.includes('excel') || /\.xlsx?$|\.csv$/i.test(fn)) return 'sheet';
  if (mime.startsWith('image/')) return 'image';
  return 'other';
};

const formatSize = (bytes: number): string =>
  bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.round(bytes / 1000)} KB`;

const POPULATE_CARD = [
  { path: 'assigners',               select: 'name emailid profile_photo' },
  { path: 'tags',                    select: 'tag_name color' },
  { path: 'comments.user_id',        select: 'name profile_photo' },
  { path: 'attachments.document_id', select: 'name file_url filename file_type file_size' },
];

const logActivity = (
  cardId:  Types.ObjectId | string,
  userId:  Types.ObjectId | string,
  action:  string,
  message: string,
  meta?:   Record<string, string | undefined>,
): void => {
  CardActivity.create({ card_id: cardId, user_id: userId, action, message, meta }).catch(() => {});
};

// Insert both Notification and InboxMessage with guaranteed workspace_id
const notify = async (
  userIds:     (Types.ObjectId | string)[],
  actorId:     Types.ObjectId | string,
  workspaceId: Types.ObjectId | string | null,
  type:        string,
  message:     string,
  project:     string,
  refId:       string,
  refType:     string,
  snippet:     string,
  refCardId?:  Types.ObjectId | string | null,
): Promise<void> => {
  if (!userIds.length) return;
  await Promise.all([
    Notification.insertMany(userIds.map(uid => ({
      user_id:      uid,
      actor_id:     actorId,
      workspace_id: workspaceId,   // always set — never missing
      type,
      message,
      project,
      ref_id:   refId,
      ref_type: refType,
      read:     false,
    }))),
    InboxMessage.insertMany(userIds.map(uid => ({
      sender_id:    actorId,
      recipient_id: uid,
      workspace_id: workspaceId,   // always set — never missing
      type,
      project,
      snippet,
      ref_card_id: refCardId ?? null,
      read:        false,
    }))),
  ]);
};

// ── Controllers ───────────────────────────────────────────────────────────────

export const getCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const filter: any = { status: { $ne: 'delete' } };
    if (req.query.board_id) {
      filter.board_id = req.query.board_id;
    } else {
      filter.board_id = {
        $in: await getWorkspaceBoardIds(
          req.user!._id as Types.ObjectId,
          req.query.workspace_id as string | undefined,
        ),
      };
    }
    if (req.query.status) filter.card_status = req.query.status;
    const cards = await Card.find(filter).populate(POPULATE_CARD).sort({ position: 1, createdAt: 1 });
    res.status(200).json({ success: true, data: cards });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getCardById = async (req: Request, res: Response): Promise<void> => {
  try {
    const card = await Card.findOne({ _id: req.params.id, status: { $ne: 'delete' } }).populate(POPULATE_CARD);
    if (!card) { res.status(404).json({ success: false, message: 'Card not found' }); return; }
    res.status(200).json({ success: true, data: card });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getCardActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const acts = await CardActivity.find({ card_id: req.params.id })
      .populate('user_id', 'name profile_photo emailid')
      .sort({ createdAt: -1 })
      .limit(100);
    res.status(200).json({ success: true, data: acts });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getMyWork = async (req: Request, res: Response): Promise<void> => {
  try {
    const boardIds = await getWorkspaceBoardIds(
      req.user!._id as Types.ObjectId,
      req.query.workspace_id as string | undefined,
    );
    const cards = await Card.find({
      board_id:  { $in: boardIds },
      assigners: req.user!._id,
      status:    { $ne: 'delete' },
    }).populate(POPULATE_CARD).sort({ due_to: 1, createdAt: -1 }).limit(50);
    res.status(200).json({ success: true, data: cards });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const createCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      title, description, board_id, assigners, tags,
      card_priority, card_status, due_from, due_to, status,
    } = req.body;

    if (!title)    { res.status(400).json({ success: false, message: 'title is required' });    return; }
    if (!board_id) { res.status(400).json({ success: false, message: 'board_id is required' }); return; }

    // Resolve workspace from the board — guaranteed correct workspace
    const wsId = await wsFromBoard(board_id);

    const count = await Card.countDocuments({ board_id, status: { $ne: 'delete' } });
    const card  = await Card.create({
      title,
      description:   description   ?? '',
      board_id,
      assigners:     assigners     ?? [],
      tags:          tags          ?? [],
      card_priority: card_priority ?? 'low',
      card_status:   card_status   ?? 'todo',
      due_from:      due_from      ?? null,
      due_to:        due_to        ?? null,
      status:        status        ?? 'active',
      position:      count,
    });

    logActivity(card._id as Types.ObjectId, req.user!._id, 'created',
      `${req.user!.name} created this card`);

    if (Array.isArray(assigners) && assigners.length > 0) {
      const UserModel = (await import('../models/User')).default;
      const users     = await UserModel.find({ _id: { $in: assigners } }).select('name');
      const nameMap: Record<string, string> = {};
      users.forEach((u: any) => { nameMap[String(u._id)] = u.name; });

      for (const uid of assigners) {
        logActivity(card._id as Types.ObjectId, req.user!._id, 'assigned',
          `${req.user!.name} assigned ${nameMap[uid] ?? 'a user'} to this card`,
          { target_user_id: uid, target_user_name: nameMap[uid] });
      }

      await notify(
        assigners, req.user!._id, wsId,
        'status',
        `${req.user!.name} assigned you to "${title}"`,
        title, String(card._id), 'card',
        `${req.user!.name} assigned you to this task`,
        card._id as Types.ObjectId,
      );
    }

    if (due_to) {
      logActivity(card._id as Types.ObjectId, req.user!._id, 'due_date_set',
        `${req.user!.name} set due date to ${new Date(due_to).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        { to: due_to });
    }

    const populated = await Card.findById(card._id).populate(POPULATE_CARD);
    res.status(201).json({ success: true, data: populated });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const updateCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const allowed = [
      'title', 'description', 'board_id', 'assigners', 'tags',
      'card_priority', 'card_status', 'due_from', 'due_to',
      'status', 'position', 'bookmarked',
    ];
    const updates: Record<string, any> = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const existing = await Card.findById(req.params.id);
    if (!existing) { res.status(404).json({ success: false, message: 'Card not found' }); return; }

    // Resolve workspace from the card's current board — authoritative
    const wsId        = await wsFromBoard(updates.board_id ?? existing.board_id);
    const assignerIds = existing.assigners.map(String);

    // ── Title ──────────────────────────────────────────────────────────────
    if (updates.title && updates.title !== existing.title) {
      logActivity(existing._id as Types.ObjectId, req.user!._id, 'title_changed',
        `${req.user!.name} renamed card to "${updates.title}"`,
        { from: existing.title, to: updates.title });
      await notify(
        assignerIds.filter(id => id !== String(req.user!._id)),
        req.user!._id, wsId, 'status',
        `${req.user!.name} renamed task "${existing.title}" to "${updates.title}"`,
        updates.title, String(existing._id), 'card',
        `Task renamed: "${existing.title}" → "${updates.title}"`,
        existing._id as Types.ObjectId,
      );
    }

    // ── Description ────────────────────────────────────────────────────────
    if (updates.description !== undefined && updates.description !== existing.description) {
      logActivity(existing._id as Types.ObjectId, req.user!._id, 'description_changed',
        `${req.user!.name} updated the description`);
    }

    // ── Status ─────────────────────────────────────────────────────────────
    if (updates.card_status && updates.card_status !== existing.card_status) {
      const lbl = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      logActivity(existing._id as Types.ObjectId, req.user!._id, 'status_changed',
        `${req.user!.name} changed status from ${lbl(existing.card_status)} to ${lbl(updates.card_status)}`,
        { from: existing.card_status, to: updates.card_status });
      await notify(
        assignerIds.filter(id => id !== String(req.user!._id)),
        req.user!._id, wsId, 'status',
        `${req.user!.name} moved "${existing.title}" to ${lbl(updates.card_status)}`,
        existing.title, String(existing._id), 'card',
        `Status: ${lbl(existing.card_status)} → ${lbl(updates.card_status)}`,
        existing._id as Types.ObjectId,
      );
    }

    // ── Priority ───────────────────────────────────────────────────────────
    if (updates.card_priority && updates.card_priority !== existing.card_priority) {
      logActivity(existing._id as Types.ObjectId, req.user!._id, 'priority_changed',
        `${req.user!.name} changed priority to ${updates.card_priority}`,
        { from: existing.card_priority, to: updates.card_priority });
      await notify(
        assignerIds.filter(id => id !== String(req.user!._id)),
        req.user!._id, wsId, 'priority',
        `${req.user!.name} changed priority of "${existing.title}" to ${updates.card_priority}`,
        existing.title, String(existing._id), 'card',
        `Priority: ${existing.card_priority} → ${updates.card_priority}`,
        existing._id as Types.ObjectId,
      );
    }

    // ── Due date ───────────────────────────────────────────────────────────
    if (updates.due_to !== undefined) {
      const action     = !existing.due_to ? 'due_date_set' : !updates.due_to ? 'due_date_removed' : 'due_date_changed';
      const dateLabel  = updates.due_to
        ? new Date(updates.due_to).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : '';
      const msg = action === 'due_date_removed'
        ? `${req.user!.name} removed the due date`
        : `${req.user!.name} set due date to ${dateLabel}`;

      logActivity(existing._id as Types.ObjectId, req.user!._id, action, msg,
        { from: existing.due_to?.toISOString(), to: updates.due_to });
      await notify(
        assignerIds.filter(id => id !== String(req.user!._id)),
        req.user!._id, wsId, 'due_date',
        action === 'due_date_removed'
          ? `${req.user!.name} removed the due date on "${existing.title}"`
          : `${req.user!.name} set due date to ${dateLabel} on "${existing.title}"`,
        existing.title, String(existing._id), 'card',
        msg, existing._id as Types.ObjectId,
      );
    }

    // ── Board move ─────────────────────────────────────────────────────────
    if (updates.board_id && updates.board_id !== String(existing.board_id)) {
      const [fromBoard, toBoard] = await Promise.all([
        Board.findById(existing.board_id).select('name').lean() as any,
        Board.findById(updates.board_id).select('name').lean() as any,
      ]);
      logActivity(existing._id as Types.ObjectId, req.user!._id, 'board_moved',
        `${req.user!.name} moved card from ${fromBoard?.name ?? 'unknown'} to ${toBoard?.name ?? 'unknown'}`,
        { from: fromBoard?.name, to: toBoard?.name });
      await notify(
        assignerIds.filter(id => id !== String(req.user!._id)),
        req.user!._id, wsId, 'status',
        `${req.user!.name} moved "${existing.title}" to board ${toBoard?.name ?? 'unknown'}`,
        existing.title, String(existing._id), 'card',
        `Moved to: ${toBoard?.name}`,
        existing._id as Types.ObjectId,
      );
    }

    // ── Assigners diff ─────────────────────────────────────────────────────
    if (Array.isArray(updates.assigners)) {
      const oldIds  = existing.assigners.map(String);
      const newIds  = updates.assigners as string[];
      const added   = newIds.filter(id => !oldIds.includes(id));
      const removed = oldIds.filter(id => !newIds.includes(id));

      if (added.length || removed.length) {
        const UserModel = (await import('../models/User')).default;
        const users     = await UserModel.find({ _id: { $in: [...added, ...removed] } }).select('name');
        const nameMap: Record<string, string> = {};
        users.forEach((u: any) => { nameMap[String(u._id)] = u.name; });

        added.forEach(uid => logActivity(existing._id as Types.ObjectId, req.user!._id, 'assigned',
          `${req.user!.name} assigned ${nameMap[uid] ?? 'a user'}`,
          { target_user_id: uid, target_user_name: nameMap[uid] }));
        removed.forEach(uid => logActivity(existing._id as Types.ObjectId, req.user!._id, 'unassigned',
          `${req.user!.name} removed ${nameMap[uid] ?? 'a user'}`,
          { target_user_id: uid, target_user_name: nameMap[uid] }));

        if (added.length) {
          await notify(
            added, req.user!._id, wsId, 'status',
            `${req.user!.name} assigned you to "${existing.title}"`,
            existing.title, String(existing._id), 'card',
            `${req.user!.name} assigned you to this task`,
            existing._id as Types.ObjectId,
          );
        }
      }
    }

    const card = await Card.findByIdAndUpdate(req.params.id, updates, { new: true }).populate(POPULATE_CARD);
    res.status(200).json({ success: true, data: card });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const deleteCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const card = await Card.findByIdAndUpdate(req.params.id, { status: 'delete' }, { new: true });
    if (!card) { res.status(404).json({ success: false, message: 'Card not found' }); return; }
    res.status(200).json({ success: true, message: 'Card deleted' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const archiveCard = async (req: Request, res: Response): Promise<void> => {
  try {
    const card = await Card.findByIdAndUpdate(req.params.id, { status: 'archive' }, { new: true });
    if (!card) { res.status(404).json({ success: false, message: 'Card not found' }); return; }
    logActivity(card._id as Types.ObjectId, req.user!._id, 'archived',
      `${req.user!.name} archived this card`);
    res.status(200).json({ success: true, message: 'Card archived', data: card });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const toggleBookmark = async (req: Request, res: Response): Promise<void> => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) { res.status(404).json({ success: false, message: 'Card not found' }); return; }
    card.bookmarked = !card.bookmarked;
    await card.save();
    if (card.bookmarked) {
      logActivity(card._id as Types.ObjectId, req.user!._id, 'bookmarked',
        `${req.user!.name} bookmarked this card`);
    }
    res.status(200).json({ success: true, data: { bookmarked: card.bookmarked } });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const addComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const { text } = req.body;
    if (!text) { res.status(400).json({ success: false, message: 'text is required' }); return; }

    const card = await Card.findById(req.params.id);
    if (!card) { res.status(404).json({ success: false, message: 'Card not found' }); return; }

    card.comments.push({ user_id: req.user!._id as Types.ObjectId, text } as any);
    await card.save();

    logActivity(card._id as Types.ObjectId, req.user!._id, 'comment_added',
      `${req.user!.name} added a comment`, { value: text.slice(0, 80) });

    const updated    = await Card.findById(req.params.id).populate('comments.user_id', 'name profile_photo');
    const newComment = updated!.comments[updated!.comments.length - 1];

    const wsId   = await wsFromBoard(card.board_id);
    const targets = card.assigners.map(String).filter(id => id !== String(req.user!._id));
    await notify(
      targets, req.user!._id, wsId, 'comment',
      `${req.user!.name} commented on "${card.title}"`,
      card.title, String(card._id), 'card',
      text.slice(0, 120),
      card._id as Types.ObjectId,
    );

    res.status(201).json({ success: true, data: newComment });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const deleteComment = async (req: Request, res: Response): Promise<void> => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) { res.status(404).json({ success: false, message: 'Card not found' }); return; }

    const comment = card.comments.id(req.params.commentId);
    if (!comment) { res.status(404).json({ success: false, message: 'Comment not found' }); return; }
    if (comment.user_id.toString() !== String(req.user!._id)) {
      res.status(403).json({ success: false, message: 'Not authorized' }); return;
    }
    comment.deleteOne();
    await card.save();
    logActivity(card._id as Types.ObjectId, req.user!._id, 'comment_deleted',
      `${req.user!.name} deleted a comment`);
    res.status(200).json({ success: true, message: 'Comment deleted' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const reorderCards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      res.status(400).json({ success: false, message: 'order array required' }); return;
    }
    await Promise.all(
      order.map(({ id, position, board_id }: { id: string; position: number; board_id?: string }) =>
        Card.findByIdAndUpdate(id, { position, ...(board_id && { board_id }) }),
      ),
    );
    res.status(200).json({ success: true, message: 'Cards reordered' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const addAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: 'No file uploaded' }); return; }

    const card = await Card.findById(req.params.id);
    if (!card) { res.status(404).json({ success: false, message: 'Card not found' }); return; }

    const fileUrl  = `/uploads/${req.file.filename}`;
    const fileType = detectType(req.file.mimetype, req.file.originalname);
    const fileSize = formatSize(req.file.size);

    // Get workspace from board
    const wsId = await wsFromBoard(card.board_id);

    const doc = await DocumentModel.create({
      name:         (req.body.name as string) ?? req.file.originalname,
      file_url:     fileUrl,
      filename:     req.file.filename,
      file_type:    fileType,
      file_size:    fileSize,
      uploaded_by:  req.user!._id,
      workspace_id: wsId,
      tags:         ['Card Attachment'],
    });

    card.attachments.push({
      document_id: doc._id as Types.ObjectId,
      file_url:    fileUrl,
      filename:    req.file.filename,
      file_type:   fileType,
      file_size:   fileSize,
      name:        doc.name,
    } as any);
    await card.save();

    logActivity(card._id as Types.ObjectId, req.user!._id, 'attachment_added',
      `${req.user!.name} attached "${doc.name}"`, { value: doc.name });

    const assignerIds = card.assigners.map(String).filter(id => id !== String(req.user!._id));
    await notify(
      assignerIds, req.user!._id, wsId, 'file',
      `${req.user!.name} attached a file to "${card.title}"`,
      card.title, String(card._id), 'card',
      `File attached: ${doc.name}`,
      card._id as Types.ObjectId,
    );

    const populated = await Card.findById(card._id).populate(
      'attachments.document_id', 'name file_url file_type file_size',
    );
    const latest = populated!.attachments[populated!.attachments.length - 1];
    res.status(201).json({ success: true, data: { attachment: latest, document: doc } });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const removeAttachment = async (req: Request, res: Response): Promise<void> => {
  try {
    const card = await Card.findById(req.params.id);
    if (!card) { res.status(404).json({ success: false, message: 'Card not found' }); return; }

    const att = card.attachments.id(req.params.attachmentId);
    if (!att) { res.status(404).json({ success: false, message: 'Attachment not found' }); return; }

    const attName = att.name;
    att.deleteOne();
    await card.save();

    logActivity(card._id as Types.ObjectId, req.user!._id, 'attachment_removed',
      `${req.user!.name} removed attachment "${attName}"`, { value: attName });

    res.status(200).json({ success: true, message: 'Attachment removed' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
