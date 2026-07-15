import { HistoryRepository } from '../repositories/HistoryRepository.js';

function formatDuration(startedAt?: Date | string, endedAt?: Date | string): string | undefined {
  if (!startedAt || !endedAt) return undefined;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const diffSec = Math.round((end - start) / 1000);
  if (diffSec <= 0) return undefined;
  const hours = Math.floor(diffSec / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  } else if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
}

export class HistoryService {
  static async getActivityHistory(userId: string, limit: number, offset: number) {
    const historyRaw = await HistoryRepository.getActivityHistory(userId, limit, offset);
    const historyItems = [];

    for (const row of historyRaw) {
      if (row.type === 'call') {
        const isOutgoing = row.sender_id === userId;
        let type: string = '';
        let detail: string = '';

        if (row.call_type === 'video') {
          if (isOutgoing) {
            type = 'outgoing_video';
            detail = 'Outgoing Video Call';
          } else {
            if (row.status === 'rejected') {
              type = 'rejected_video';
              detail = 'Rejected Video Call';
            } else if (row.status === 'missed' || row.status === 'ringing') {
              type = 'missed_video';
              detail = 'Missed Video Call';
            } else {
              type = 'incoming_video';
              detail = 'Incoming Video Call';
            }
          }
        } else {
          if (isOutgoing) {
            type = 'outgoing_call';
            detail = 'Outgoing Voice Call';
          } else {
            if (row.status === 'rejected') {
              type = 'rejected_call';
              detail = 'Rejected Voice Call';
            } else if (row.status === 'missed' || row.status === 'ringing') {
              type = 'missed_call';
              detail = 'Missed Voice Call';
            } else {
              type = 'incoming_call';
              detail = 'Incoming Voice Call';
            }
          }
        }

        historyItems.push({
          id: row.id,
          name: row.peer_name || 'Unknown User',
          email: row.peer_email || '',
          type,
          detail,
          time: row.time,
          duration: formatDuration(row.started_at, row.ended_at),
          roomId: row.room_id,
          peerId: row.peer_id
        });
      } else if (row.type === 'message') {
        const isOutgoing = row.sender_id === userId;
        const detail = isOutgoing ? `You: "${row.content_preview}"` : `"${row.content_preview}"`;

        historyItems.push({
          id: row.id,
          name: row.peer_name || 'Unknown User',
          email: row.peer_email || '',
          type: 'message',
          detail,
          time: row.time,
          roomId: row.room_id,
          peerId: row.peer_id
        });
      }
    }

    return historyItems;
  }
}
