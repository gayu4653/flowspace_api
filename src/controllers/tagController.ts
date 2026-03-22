import { Request, Response } from 'express';
import Tag from '../models/Tag';

export const getTags = async (req: Request, res: Response): Promise<void> => {
  try {
    const tags = await Tag.find({ status: { $ne: 'delete' }, user_id: req.user!._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: tags });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const createTag = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tag_name, color, status } = req.body;
    if (!tag_name) { res.status(400).json({ success: false, message: 'tag_name is required' }); return; }
    if (!color)    { res.status(400).json({ success: false, message: 'color is required' }); return; }
    const tag = await Tag.create({ tag_name, color, status: status ?? 'active', user_id: req.user!._id });
    res.status(201).json({ success: true, data: tag });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const updateTag = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tag_name, color, status } = req.body;
    const tag = await Tag.findOneAndUpdate(
      { _id: req.params.id, user_id: req.user!._id },
      { ...(tag_name && { tag_name }), ...(color && { color }), ...(status && { status }) },
      { new: true },
    );
    if (!tag) { res.status(404).json({ success: false, message: 'Tag not found' }); return; }
    res.status(200).json({ success: true, data: tag });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const deleteTag = async (req: Request, res: Response): Promise<void> => {
  try {
    const tag = await Tag.findOneAndUpdate({ _id: req.params.id, user_id: req.user!._id }, { status: 'delete' }, { new: true });
    if (!tag) { res.status(404).json({ success: false, message: 'Tag not found' }); return; }
    res.status(200).json({ success: true, message: 'Tag deleted' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
