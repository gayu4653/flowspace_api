import { Request, Response } from 'express';
import { Types } from 'mongoose';
import Meeting from '../models/Meeting';
import Workspace from '../models/Workspace';
import Notification from '../models/Notification';
import InboxMessage from '../models/InboxMessage';

const POPULATE_MEETING = [
  { path: 'attendees',  select: 'name emailid profile_photo' },
  { path: 'assigners',  select: 'name emailid profile_photo' },
  { path: 'created_by', select: 'name profile_photo' },
];

const notifyMeeting = async (
  userIds:      (Types.ObjectId | string)[],
  actorId:      Types.ObjectId | string,
  workspaceId:  Types.ObjectId | string | null,
  message:      string,
  project:      string,
  snippet:      string,
  refMeetingId: Types.ObjectId | string,
): Promise<void> => {
  if (!userIds.length) return;
  await Promise.all([
    Notification.insertMany(userIds.map(uid => ({
      user_id: uid, actor_id: actorId, workspace_id: workspaceId,
      type: 'meeting', message, project,
      ref_id: String(refMeetingId), ref_type: 'meeting', read: false,
    }))),
    InboxMessage.insertMany(userIds.map(uid => ({
      sender_id: actorId, recipient_id: uid, workspace_id: workspaceId,
      type: 'meeting', project, snippet,
      ref_meeting_id: refMeetingId, ref_card_id: null, read: false,
    }))),
  ]);
};

const collectRecipients = (attendees: any[], assigners: any[], excludeId: Types.ObjectId | string): string[] => {
  const all = new Set<string>();
  [...attendees, ...assigners].forEach(u => {
    const id = typeof u === 'object' ? String(u._id ?? u) : String(u);
    if (id !== String(excludeId)) all.add(id);
  });
  return [...all];
};

export const getMeetings = async (req: Request, res: Response): Promise<void> => {
  try {
    const wsId = req.query.workspace_id as string | undefined;
    let baseFilter: any;
    if (wsId) {
      baseFilter = {
        workspace_id: wsId,
        $or: [{ created_by: req.user!._id }, { attendees: req.user!._id }, { assigners: req.user!._id }],
      };
    } else {
      const ws = await Workspace.findOne({ $or: [{ owner_id: req.user!._id }, { 'members.user_id': req.user!._id }] });
      baseFilter = ws
        ? { workspace_id: ws._id, $or: [{ created_by: req.user!._id }, { attendees: req.user!._id }, { assigners: req.user!._id }] }
        : { $or: [{ created_by: req.user!._id }, { attendees: req.user!._id }, { assigners: req.user!._id }] };
    }
    if (req.query.status) baseFilter.status = req.query.status;
    const meetings = await Meeting.find(baseFilter).populate(POPULATE_MEETING).sort({ date: 1, time: 1 });
    res.status(200).json({ success: true, data: meetings });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const getMeetingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const meeting = await Meeting.findById(req.params.id).populate(POPULATE_MEETING);
    if (!meeting) { res.status(404).json({ success: false, message: 'Meeting not found' }); return; }
    res.status(200).json({ success: true, data: meeting });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const createMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const ws = await Workspace.findOne({ $or: [{ owner_id: req.user!._id }, { 'members.user_id': req.user!._id }] });
    const wsId = ws?._id ?? null;
    const { title, date, time, duration, type, link, agenda, attendees, assigners, notes, notes_mode, agent_name } = req.body;
    if (!title || !date || !time) { res.status(400).json({ success: false, message: 'title, date and time are required' }); return; }

    const meeting = await Meeting.create({
      title, date, time,
      duration:    duration   ?? '30 min',
      type:        type       ?? 'video',
      link:        link       ?? null,
      agenda:      Array.isArray(agenda) ? agenda : [],
      attendees:   attendees  ?? [],
      assigners:   assigners  ?? [],
      notes:       notes      ?? '',
      notes_mode:  notes_mode ?? 'points',
      agent_name:  agent_name ?? '',
      workspace_id: wsId,
      created_by:  req.user!._id,
      status:      'upcoming',
    });

    const populated   = await Meeting.findById(meeting._id).populate(POPULATE_MEETING);
    const recipients  = collectRecipients(attendees ?? [], assigners ?? [], req.user!._id);

    if (recipients.length) {
      const dateLabel = new Date(date).toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short' });
      await notifyMeeting(recipients, req.user!._id, wsId,
        `${req.user!.name} invited you to "${title}"`,
        title, `Meeting scheduled: ${dateLabel} at ${time}`,
        meeting._id as Types.ObjectId);
    }

    res.status(201).json({ success: true, data: populated });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const updateMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const allowed = ['title','date','time','duration','type','link','agenda','attendees','assigners','notes','notes_mode','agent_name'];
    const updates: Record<string, any> = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });

    const existing = await Meeting.findOne({ _id: req.params.id }).populate(POPULATE_MEETING) as any;
    if (!existing) { res.status(404).json({ success: false, message: 'Meeting not found' }); return; }

    const wsId = existing.workspace_id ?? null;
    const meeting = await Meeting.findByIdAndUpdate(req.params.id, updates, { new: true }).populate(POPULATE_MEETING);

    if (updates.attendees || updates.assigners) {
      const oldAll = new Set([
        ...existing.attendees.map((u: any) => String(u._id ?? u)),
        ...existing.assigners.map((u: any) => String(u._id ?? u)),
      ]);
      const newAll = collectRecipients(updates.attendees ?? existing.attendees, updates.assigners ?? existing.assigners, req.user!._id);
      const newlyAdded = newAll.filter(id => !oldAll.has(id));
      if (newlyAdded.length) {
        const dateLabel = new Date(existing.date).toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short' });
        await notifyMeeting(newlyAdded, req.user!._id, wsId,
          `${req.user!.name} added you to "${existing.title}"`,
          existing.title, `Meeting: ${dateLabel} at ${existing.time}`,
          existing._id as Types.ObjectId);
      }
    }

    if (updates.date || updates.time) {
      const recipients = collectRecipients(existing.attendees, existing.assigners, req.user!._id);
      if (recipients.length) {
        const newDate    = updates.date ?? existing.date;
        const newTime    = updates.time ?? existing.time;
        const dateLabel  = new Date(newDate).toLocaleDateString('en-GB', { weekday:'short', day:'2-digit', month:'short' });
        await notifyMeeting(recipients, req.user!._id, wsId,
          `${req.user!.name} rescheduled "${existing.title}"`,
          existing.title, `New time: ${dateLabel} at ${newTime}`,
          existing._id as Types.ObjectId);
      }
    }

    res.status(200).json({ success: true, data: meeting });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const updateMeetingStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const meeting = await Meeting.findOneAndUpdate(
      { _id: req.params.id, created_by: req.user!._id },
      { status: req.body.status },
      { new: true },
    ).populate(POPULATE_MEETING) as any;
    if (!meeting) { res.status(404).json({ success: false, message: 'Meeting not found' }); return; }

    if (req.body.status === 'live') {
      const wsId       = meeting.workspace_id ?? null;
      const recipients = collectRecipients(meeting.attendees, meeting.assigners, req.user!._id);
      if (recipients.length) {
        await notifyMeeting(recipients, req.user!._id, wsId,
          `"${meeting.title}" is now live`,
          meeting.title, 'The meeting has started — join now!',
          meeting._id as Types.ObjectId);
      }
    }

    res.status(200).json({ success: true, data: meeting });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};

export const deleteMeeting = async (req: Request, res: Response): Promise<void> => {
  try {
    const existing = await Meeting.findOne({ _id: req.params.id, created_by: req.user!._id }).populate(POPULATE_MEETING) as any;
    if (!existing) { res.status(404).json({ success: false, message: 'Meeting not found' }); return; }

    const wsId       = existing.workspace_id ?? null;
    const recipients = collectRecipients(existing.attendees, existing.assigners, req.user!._id);
    await Meeting.findByIdAndDelete(req.params.id);

    if (recipients.length) {
      await notifyMeeting(recipients, req.user!._id, wsId,
        `${req.user!.name} cancelled "${existing.title}"`,
        existing.title, 'Meeting has been cancelled',
        existing._id as Types.ObjectId);
    }

    res.status(200).json({ success: true, message: 'Meeting deleted' });
  } catch (err: any) { res.status(500).json({ success: false, message: err.message }); }
};
