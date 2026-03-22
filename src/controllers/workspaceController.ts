import { Request, Response } from 'express';
import Workspace from '../models/Workspace';
import User from '../models/User';
import Notification from '../models/Notification';
import InboxMessage from '../models/InboxMessage';

const DEFAULT_INVITE_PASSWORD = process.env.DEFAULT_USER_PASSWORD ?? '123456';

const slugify = (name: string): string =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// GET /api/workspace — primary workspace, auto-creates if none exists
export const getWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    let ws = await Workspace.findOne({
      $or: [{ owner_id: req.user!._id }, { 'members.user_id': req.user!._id }],
    }).populate('members.user_id', 'name emailid profile_photo role');

    if (!ws) {
      const slug = `${slugify(req.user!.name)}-workspace-${Date.now()}`;
      ws = await Workspace.create({
        name:    `${req.user!.name}'s Workspace`,
        slug,
        owner_id: req.user!._id,
        members: [{ user_id: req.user!._id, role: 'admin' }],
      });
      ws = await ws.populate('members.user_id', 'name emailid profile_photo role');
    }
    res.status(200).json({ success: true, data: ws });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// GET /api/workspace/all — all workspaces user owns or is a member of
export const getAllWorkspaces = async (req: Request, res: Response): Promise<void> => {
  try {
    const workspaces = await Workspace.find({
      $or: [{ owner_id: req.user!._id }, { 'members.user_id': req.user!._id }],
    })
      .populate('members.user_id', 'name emailid profile_photo role')
      .sort({ createdAt: 1 });

    res.status(200).json({ success: true, data: workspaces });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/workspace — explicitly create a new workspace
export const createWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, visibility } = req.body;
    if (!name) { res.status(400).json({ success: false, message: 'name is required' }); return; }

    // Prevent duplicate names for the same owner
    const safeName = name.trim();
    const existing = await Workspace.findOne({
      owner_id: req.user!._id,
      name: { $regex: new RegExp(`^${safeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
    });
    if (existing) {
      res.status(409).json({ success: false, message: 'You already have a workspace with this name' });
      return;
    }

    const slug = `${slugify(safeName)}-${Date.now()}`;
    const ws   = await Workspace.create({
      name:       safeName,
      slug,
      visibility: visibility ?? 'team',
      owner_id:   req.user!._id,
      members:    [{ user_id: req.user!._id, role: 'admin' }],
      plan:       'free',
    });
    const populated = await ws.populate('members.user_id', 'name emailid profile_photo role');
    res.status(201).json({ success: true, data: populated });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/workspace — update workspace (pass _id in body for specific one)
export const updateWorkspace = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, visibility, logo, _id } = req.body;

    const query = _id
      ? { _id, owner_id: req.user!._id }
      : { owner_id: req.user!._id };

    const ws = await Workspace.findOne(query);
    if (!ws) { res.status(404).json({ success: false, message: 'Workspace not found' }); return; }

    if (name)              ws.name       = name.trim();
    if (visibility)        ws.visibility = visibility;
    if (logo !== undefined) ws.logo      = logo;
    ws.plan = 'free';
    await ws.save();

    const populated = await ws.populate('members.user_id', 'name emailid profile_photo role');
    res.status(200).json({ success: true, data: populated });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// GET /api/workspace/members?workspace_id=xxx
export const getMembers = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.workspace_id
      ? {
          _id: req.query.workspace_id,
          $or: [{ owner_id: req.user!._id }, { 'members.user_id': req.user!._id }],
        }
      : { $or: [{ owner_id: req.user!._id }, { 'members.user_id': req.user!._id }] };

    const ws = await Workspace.findOne(query).populate(
      'members.user_id',
      'name emailid profile_photo role title',
    );
    if (!ws) { res.status(404).json({ success: false, message: 'Workspace not found' }); return; }
    res.status(200).json({ success: true, data: ws.members });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// POST /api/workspace/invite
export const inviteMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const { emailid, role, name, workspace_id } = req.body;
    if (!emailid) { res.status(400).json({ success: false, message: 'emailid is required' }); return; }

    const query = workspace_id
      ? { _id: workspace_id, owner_id: req.user!._id }
      : { owner_id: req.user!._id };

    const ws = await Workspace.findOne(query);
    if (!ws) { res.status(404).json({ success: false, message: 'Workspace not found' }); return; }

    let invitee    = await User.findOne({ emailid: emailid.toLowerCase() });
    let createdNew = false;

    if (!invitee) {
      invitee = await User.create({
        name:           name ?? emailid.split('@')[0],
        emailid:        emailid.toLowerCase(),
        password:       DEFAULT_INVITE_PASSWORD,
        role:           'user',
        email_verified: true,
      });
      createdNew = true;
    }

    const alreadyMember = ws.members.some(m => m.user_id.toString() === String(invitee!._id));
    if (!alreadyMember) {
      ws.members.push({ user_id: invitee._id as any, role: role ?? 'member', joined_at: new Date() });
      await ws.save();
    }

    const message = `${req.user!.name} invited you to ${ws.name}`;
    await Notification.create({
      user_id:  invitee._id,
      actor_id: req.user!._id,
      type:     'invite',
      message,
      project:  ws.name,
      ref_id:   String(ws._id),
      ref_type: 'board',
    });
    await InboxMessage.create({
      sender_id:    req.user!._id,
      recipient_id: invitee._id,
      type:         'invite',
      project:      ws.name,
      snippet:      createdNew
        ? `${message}. Default password: ${DEFAULT_INVITE_PASSWORD}`
        : message,
      ref_card_id: null,
    });

    res.status(200).json({
      success:         true,
      message:         createdNew
        ? `${invitee.name} invited and account created`
        : `${invitee.name} added to workspace`,
      data:            { workspace_id: ws._id, member: invitee.toPublic() },
      defaultPassword: createdNew ? DEFAULT_INVITE_PASSWORD : undefined,
    });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// PUT /api/workspace/members/:userId
export const updateMemberRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { role, workspace_id } = req.body;
    const query = workspace_id
      ? { _id: workspace_id, owner_id: req.user!._id }
      : { owner_id: req.user!._id };

    const ws = await Workspace.findOne(query);
    if (!ws) { res.status(404).json({ success: false, message: 'Workspace not found' }); return; }

    const member = ws.members.find(m => m.user_id.toString() === req.params.userId);
    if (!member) { res.status(404).json({ success: false, message: 'Member not found' }); return; }

    member.role = role;
    await ws.save();
    res.status(200).json({ success: true, data: ws });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

// DELETE /api/workspace/members/:userId?workspace_id=xxx
export const removeMember = async (req: Request, res: Response): Promise<void> => {
  try {
    const query = req.query.workspace_id
      ? { _id: req.query.workspace_id, owner_id: req.user!._id }
      : { owner_id: req.user!._id };

    const ws = await Workspace.findOne(query);
    if (!ws) { res.status(404).json({ success: false, message: 'Workspace not found' }); return; }

    ws.members = ws.members.filter(m => m.user_id.toString() !== req.params.userId);
    await ws.save();
    res.status(200).json({ success: true, message: 'Member removed', data: ws });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
