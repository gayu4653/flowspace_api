import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Card from '../models/Card';
import Board from '../models/Board';
import Workspace from '../models/Workspace';

const getWorkspaceBoardIds = async (userId: Types.ObjectId, workspaceId?: string): Promise<Types.ObjectId[]> => {
  const wsId = workspaceId ?? (await Workspace.findOne({ $or: [{ owner_id: userId }, { 'members.user_id': userId }] }))?._id;
  const boards = await Board.find({ ...(wsId ? { workspace_id: wsId } : { created_by: userId }), status: { $ne: 'delete' } });
  return boards.map(b => b._id as Types.ObjectId);
};

export const getStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const ids = await getWorkspaceBoardIds(req.user!._id as Types.ObjectId, req.query.workspace_id as string);
    const [total, inProgress, completed, overdue] = await Promise.all([
      Card.countDocuments({ board_id: { $in: ids }, status: 'active' }),
      Card.countDocuments({ board_id: { $in: ids }, status: 'active', card_status: 'in_progress' }),
      Card.countDocuments({ board_id: { $in: ids }, status: 'active', card_status: 'done' }),
      Card.countDocuments({ board_id: { $in: ids }, status: 'active', card_status: { $ne: 'done' }, due_to: { $lt: new Date() } }),
    ]);
    res.status(200).json({ success: true, data: { total, in_progress: inProgress, completed, overdue } });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getVelocity = async (req: Request, res: Response): Promise<void> => {
  try {
    const ids   = await getWorkspaceBoardIds(req.user!._id as Types.ObjectId, req.query.workspace_id as string);
    const weeks = [];
    for (let i = 5; i >= 0; i--) {
      const end = new Date(); end.setDate(end.getDate() - i * 7);
      const start = new Date(end); start.setDate(start.getDate() - 7);
      const [created, completed] = await Promise.all([
        Card.countDocuments({ board_id: { $in: ids }, createdAt:  { $gte: start, $lt: end } }),
        Card.countDocuments({ board_id: { $in: ids }, card_status: 'done', updatedAt: { $gte: start, $lt: end } }),
      ]);
      weeks.push({ week: `W${6 - i}`, created, completed });
    }
    res.status(200).json({ success: true, data: weeks });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getActivity = async (req: Request, res: Response): Promise<void> => {
  try {
    const ids  = await getWorkspaceBoardIds(req.user!._id as Types.ObjectId, req.query.workspace_id as string);
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d     = new Date(); d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0,0,0,0));
      const end   = new Date(d.setHours(23,59,59,999));
      const tasks = await Card.countDocuments({ board_id: { $in: ids }, card_status: 'done', updatedAt: { $gte: start, $lte: end } });
      result.push({ day: days[start.getDay()], tasks });
    }
    res.status(200).json({ success: true, data: result });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getBookmarks = async (req: Request, res: Response): Promise<void> => {
  try {
    const ids   = await getWorkspaceBoardIds(req.user!._id as Types.ObjectId, req.query.workspace_id as string);
    const cards = await Card.find({ board_id: { $in: ids }, bookmarked: true, status: 'active' })
      .populate('assigners', 'name profile_photo')
      .populate('tags', 'tag_name color')
      .sort({ updatedAt: -1 });
    res.status(200).json({ success: true, data: cards });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
