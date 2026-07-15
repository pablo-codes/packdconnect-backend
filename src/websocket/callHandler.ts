import { WebSocket } from 'ws';
import { ChatRepository } from '../repositories/ChatRepository.js';
import { CallRepository } from '../repositories/CallRepository.js';
import { publishToUser } from './pubsub.js';

export async function handleCallInitiate(
  hostId: string,
  data: { roomId: string; targetUserId: string; callType: 'voice' | 'video'; sdpOffer: any },
  ws: WebSocket
) {
  const { roomId, targetUserId, callType, sdpOffer } = data;
  if (!roomId || !targetUserId || !callType || !sdpOffer) {
    console.warn('[CallHandler] call_initiate: Missing required fields');
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields for call initiation' }));
    return;
  }

  try {
    const isHostMember = await ChatRepository.isMember(roomId, hostId);
    if (!isHostMember) {
      console.warn(`[CallHandler] call_initiate: Host ${hostId} is not a member of room ${roomId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Host is not a member of the room' }));
      return;
    }

    const isTargetMember = await ChatRepository.isMember(roomId, targetUserId);
    if (!isTargetMember) {
      console.warn(`[CallHandler] call_initiate: Target ${targetUserId} is not a member of room ${roomId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Target user is not a member of the room' }));
      return;
    }

    const callLog = await CallRepository.createCallLog(roomId, hostId, callType);

    await publishToUser(targetUserId, {
      type: 'call_incoming',
      callId: callLog.id,
      roomId,
      hostId,
      callType,
      sdpOffer
    });

    console.log(`[CallHandler] Call initiated (ID: ${callLog.id}) from ${hostId} to ${targetUserId}`);

    setTimeout(async () => {
      try {
        const updated = await CallRepository.updateCallStatus(callLog.id, 'ringing', 'missed');
        if (updated) {
          console.log(`[CallHandler] Call ${callLog.id} timed out (ringing status expired)`);
          
          await publishToUser(targetUserId, {
            type: 'call_rejected',
            callId: callLog.id,
            senderId: hostId,
            reason: 'timeout'
          });
          
          await publishToUser(hostId, {
            type: 'call_rejected',
            callId: callLog.id,
            senderId: targetUserId,
            reason: 'timeout'
          });
        }
      } catch (err) {
        console.error('[CallHandler] Error in ringing timeout handler:', err);
      }
    }, 30000);

  } catch (error) {
    console.error('[CallHandler] Error initiating call:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to initiate call' }));
  }
}

export async function handleCallAnswer(
  userId: string,
  data: { callId: string; targetUserId: string; sdpAnswer: any },
  ws: WebSocket
) {
  const { callId, targetUserId, sdpAnswer } = data;
  if (!callId || !targetUserId || !sdpAnswer) {
    console.warn('[CallHandler] call_answer: Missing required fields');
    ws.send(JSON.stringify({ type: 'error', message: 'Missing required fields for call answer' }));
    return;
  }

  try {
    const call = await CallRepository.getCallById(callId);
    if (!call) {
      console.warn(`[CallHandler] call_answer: Call log ${callId} not found`);
      ws.send(JSON.stringify({ type: 'error', message: 'Call not found' }));
      return;
    }

    const isSenderMember = await ChatRepository.isMember(call.room_id, userId);
    if (!isSenderMember) {
      console.warn(`[CallHandler] call_answer: Sender ${userId} is not a member of room ${call.room_id}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Sender is not a member of the room' }));
      return;
    }

    const isTargetMember = await ChatRepository.isMember(call.room_id, targetUserId);
    if (!isTargetMember) {
      console.warn(`[CallHandler] call_answer: Target ${targetUserId} is not a member of room ${call.room_id}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Target user is not a member of the room' }));
      return;
    }

    if (userId === call.host_id || targetUserId !== call.host_id) {
      console.warn(`[CallHandler] call_answer: Legitimate participant check failed for user ${userId} and target ${targetUserId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Not a legitimate participant in this call' }));
      return;
    }

    const updated = await CallRepository.updateCallStatus(callId, 'ringing', 'active');
    if (!updated) {
      console.warn(`[CallHandler] call_answer: Call ${callId} update failed (not in 'ringing' status)`);
      ws.send(JSON.stringify({ type: 'error', message: 'Call cannot be answered (invalid state)' }));
      return;
    }

    await publishToUser(targetUserId, {
      type: 'call_answered',
      callId,
      responderId: userId,
      sdpAnswer
    });

    console.log(`[CallHandler] Call active (ID: ${callId}) answered by ${userId}`);
  } catch (error) {
    console.error('[CallHandler] Error answering call:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to answer call' }));
  }
}

export async function handleIceCandidate(
  userId: string,
  data: { targetUserId: string; candidate: any },
  ws: WebSocket
) {
  const { targetUserId, candidate } = data;
  if (!targetUserId || !candidate) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing targetUserId or candidate' }));
    return;
  }

  try {
    const isCommonRoom = await ChatRepository.usersInCommonRoom(userId, targetUserId);
    if (!isCommonRoom) {
      console.warn(`[CallHandler] ice_candidate: Users ${userId} and ${targetUserId} share no common room`);
      ws.send(JSON.stringify({ type: 'error', message: 'Users share no common room' }));
      return;
    }

    await publishToUser(targetUserId, {
      type: 'ice_candidate',
      senderId: userId,
      candidate
    });
  } catch (error) {
    console.error('[CallHandler] Error routing ICE candidate:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to route ICE candidate' }));
  }
}

export async function handleCallHangup(
  userId: string,
  data: { callId: string; targetUserId: string },
  ws: WebSocket
) {
  const { callId, targetUserId } = data;
  if (!callId || !targetUserId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing callId or targetUserId' }));
    return;
  }

  try {
    const call = await CallRepository.getCallById(callId);
    if (!call) {
      console.warn(`[CallHandler] call_hangup: Call log ${callId} not found`);
      ws.send(JSON.stringify({ type: 'error', message: 'Call not found' }));
      return;
    }

    const isSenderMember = await ChatRepository.isMember(call.room_id, userId);
    if (!isSenderMember) {
      console.warn(`[CallHandler] call_hangup: Sender ${userId} is not a member of room ${call.room_id}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Sender is not a member of the room' }));
      return;
    }

    const isTargetMember = await ChatRepository.isMember(call.room_id, targetUserId);
    if (!isTargetMember) {
      console.warn(`[CallHandler] call_hangup: Target ${targetUserId} is not a member of room ${call.room_id}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Target user is not a member of the room' }));
      return;
    }

    const isHost = userId === call.host_id;
    const isPeerTarget = targetUserId === call.host_id;
    if (!isHost && !isPeerTarget) {
      console.warn(`[CallHandler] call_hangup: Legitimate participant check failed for user ${userId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Not a legitimate participant in this call' }));
      return;
    }

    const updated = await CallRepository.updateCallStatus(callId, ['ringing', 'active'], 'completed');
    if (!updated) {
      console.warn(`[CallHandler] call_hangup: Call ${callId} update failed (not in active/ringing status)`);
      ws.send(JSON.stringify({ type: 'error', message: 'Call cannot be hung up (invalid state)' }));
      return;
    }

    await publishToUser(targetUserId, {
      type: 'call_hungup',
      callId,
      senderId: userId
    });

    console.log(`[CallHandler] Call completed/hung up (ID: ${callId}) by user ${userId}`);
  } catch (error) {
    console.error('[CallHandler] Error hanging up call:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to hang up call' }));
  }
}

export async function handleCallReject(
  userId: string,
  data: { callId: string; targetUserId: string },
  ws: WebSocket
) {
  const { callId, targetUserId } = data;
  if (!callId || !targetUserId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing callId or targetUserId' }));
    return;
  }

  try {
    const call = await CallRepository.getCallById(callId);
    if (!call) {
      console.warn(`[CallHandler] call_reject: Call log ${callId} not found`);
      ws.send(JSON.stringify({ type: 'error', message: 'Call not found' }));
      return;
    }

    const isSenderMember = await ChatRepository.isMember(call.room_id, userId);
    if (!isSenderMember) {
      console.warn(`[CallHandler] call_reject: Sender ${userId} is not a member of room ${call.room_id}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Sender is not a member of the room' }));
      return;
    }

    const isTargetMember = await ChatRepository.isMember(call.room_id, targetUserId);
    if (!isTargetMember) {
      console.warn(`[CallHandler] call_reject: Target ${targetUserId} is not a member of room ${call.room_id}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Target user is not a member of the room' }));
      return;
    }

    if (userId === call.host_id || targetUserId !== call.host_id) {
      console.warn(`[CallHandler] call_reject: Legitimate participant check failed for user ${userId}`);
      ws.send(JSON.stringify({ type: 'error', message: 'Not a legitimate participant in this call' }));
      return;
    }

    const updated = await CallRepository.updateCallStatus(callId, 'ringing', 'rejected');
    if (!updated) {
      console.warn(`[CallHandler] call_reject: Call ${callId} update failed (not in 'ringing' status)`);
      ws.send(JSON.stringify({ type: 'error', message: 'Call cannot be rejected (invalid state)' }));
      return;
    }

    await publishToUser(targetUserId, {
      type: 'call_rejected',
      callId,
      senderId: userId
    });

    console.log(`[CallHandler] Call rejected (ID: ${callId}) by user ${userId}`);
  } catch (error) {
    console.error('[CallHandler] Error rejecting call:', error);
    ws.send(JSON.stringify({ type: 'error', message: 'Failed to reject call' }));
  }
}
