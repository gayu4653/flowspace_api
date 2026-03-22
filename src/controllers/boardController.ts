import { Request, Response } from 'express';
import Board from '../models/Board';
import Workspace from '../models/Workspace';
import { Types } from 'mongoose';

const getUserWorkspaceId = async (userId: Types.ObjectId): Promise<Types.ObjectId | null> => {
  const ws = await Workspace.findOne({ $or: [{ owner_id: userId }, { 'members.user_id': userId }] });
  return ws?._id as Types.ObjectId ?? null;
};

export const getBoards = async (req: Request, res: Response): Promise<void> => {
  try {
    const wsId   = req.query.workspace_id as string | undefined ?? await getUserWorkspaceId(req.user!._id as Types.ObjectId);
    const filter: any = { status: { $ne: 'delete' } };
    if (wsId) filter.workspace_id = wsId; else filter.created_by = req.user!._id;
    const boards = await Board.find(filter).sort({ position: 1, createdAt: 1 });
    res.status(200).json({ success: true, data: boards });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const createBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, color, status, workspace_id } = req.body;
    if (!name)  { res.status(400).json({ success: false, message: 'name is required' }); return; }
    if (!color) { res.status(400).json({ success: false, message: 'color is required' }); return; }
    const wsId = workspace_id ?? await getUserWorkspaceId(req.user!._id as Types.ObjectId);
    const count = await Board.countDocuments({ created_by: req.user!._id, status: { $ne: 'delete' } });
    const board = await Board.create({ name, color, status: status ?? 'active', created_by: req.user!._id, workspace_id: wsId, position: count });
    res.status(201).json({ success: true, data: board });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const reorderBoards = async (req: Request, res: Response): Promise<void> => {
  try {
    const { boards } = req.body;
    if (!Array.isArray(boards)) { res.status(400).json({ success: false, message: 'boards array required' }); return; }
    await Promise.all(boards.map(({ id, position }: { id: string; position: number }) =>
      Board.findOneAndUpdate({ _id: id, created_by: req.user!._id }, { position }),
    ));
    res.status(200).json({ success: true, message: 'Boards reordered' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const updateBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, color, status } = req.body;
    const board = await Board.findOneAndUpdate(
      { _id: req.params.id, created_by: req.user!._id },
      { ...(name && { name }), ...(color && { color }), ...(status && { status }) },
      { new: true },
    );
    if (!board) { res.status(404).json({ success: false, message: 'Board not found' }); return; }
    res.status(200).json({ success: true, data: board });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const deleteBoard = async (req: Request, res: Response): Promise<void> => {
  try {
    const board = await Board.findOneAndUpdate({ _id: req.params.id, created_by: req.user!._id }, { status: 'delete' }, { new: true });
    if (!board) { res.status(404).json({ success: false, message: 'Board not found' }); return; }
    res.status(200).json({ success: true, message: 'Board archived successfully' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export { getUserWorkspaceId };
