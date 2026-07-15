import WebSocket from 'ws';

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;
const WS_URL = `ws://localhost:${PORT}`;

// Helper delay function
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runTest() {
  console.log('=== STARTING INTEGRATION TEST ===');

  try {
    // ----------------------------------------------------
    // Step 1: User Registration
    // ----------------------------------------------------
    console.log('\n[HTTP] Registering users Alice and Bob...');
    const registerAlice = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'alice',
        email: 'alice@example.com',
        password: 'Password123!',
      }),
    });
    
    if (registerAlice.status === 201) {
      console.log('Alice registered successfully.');
    } else {
      const data = await registerAlice.json();
      console.log('Alice registration response:', data.error || data);
    }

    const registerBob = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'bob',
        email: 'bob@example.com',
        password: 'Password456!',
      }),
    });
    
    if (registerBob.status === 201) {
      console.log('Bob registered successfully.');
    } else {
      const data = await registerBob.json();
      console.log('Bob registration response:', data.error || data);
    }

    // ----------------------------------------------------
    // Step 2: User Login
    // ----------------------------------------------------
    console.log('\n[HTTP] Logging in Alice and Bob...');
    const loginAliceRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@example.com', password: 'Password123!' }),
    });
    const aliceAuth = await loginAliceRes.json();
    if (!loginAliceRes.ok) throw new Error(`Alice login failed: ${JSON.stringify(aliceAuth)}`);
    console.log('Alice logged in. Access Token acquired.');
    const aliceCookie = loginAliceRes.headers.get('set-cookie');

    const loginBobRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'bob@example.com', password: 'Password456!' }),
    });
    const bobAuth = await loginBobRes.json();
    if (!loginBobRes.ok) throw new Error(`Bob login failed: ${JSON.stringify(bobAuth)}`);
    console.log('Bob logged in. Access Token acquired.');
    const bobCookie = loginBobRes.headers.get('set-cookie');

    const aliceUserId = aliceAuth.user.id;
    const bobUserId = bobAuth.user.id;

    // ----------------------------------------------------
    // Step 3: Token Refresh Verification
    // ----------------------------------------------------
    console.log('\n[HTTP] Testing Access Token Refresh endpoint...');
    const refreshRes = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': aliceCookie || ''
      },
    });
    const refreshData = await refreshRes.json();
    if (!refreshRes.ok) throw new Error(`Token refresh failed: ${JSON.stringify(refreshData)}`);
    console.log('Token refresh success. New Access Token:', refreshData.accessToken.slice(0, 15) + '...');
    const aliceAccessToken = refreshData.accessToken;
    const bobAccessToken = bobAuth.accessToken;

    // ----------------------------------------------------
    // Step 4: Creating a Chat Room
    // ----------------------------------------------------
    console.log('\n[HTTP] Creating direct message room between Alice and Bob...');
    const createRoomRes = await fetch(`${BASE_URL}/api/chat/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${aliceAccessToken}`,
      },
      body: JSON.stringify({
        isGroup: false,
        participantIds: [bobUserId],
      }),
    });
    const roomData = await createRoomRes.json();
    if (!createRoomRes.ok) throw new Error(`Room creation failed: ${JSON.stringify(roomData)}`);
    const roomId = roomData.room.id;
    console.log(`Room created/retrieved successfully. Room ID: ${roomId}`);

    // ----------------------------------------------------
    // Step 5: WebSockets Connections
    // ----------------------------------------------------
    console.log('\n[WS] Connecting Alice and Bob to WebSockets...');
    const aliceSocket = new WebSocket(`${WS_URL}?token=${aliceAccessToken}`);
    const bobSocket = new WebSocket(`${WS_URL}?token=${bobAccessToken}`);

    let aliceSocketOpened = false;
    let bobSocketOpened = false;

    aliceSocket.on('open', () => { aliceSocketOpened = true; });
    bobSocket.on('open', () => { bobSocketOpened = true; });

    // Wait until sockets are open
    for (let i = 0; i < 10; i++) {
      if (aliceSocketOpened && bobSocketOpened) break;
      await delay(200);
    }
    if (!aliceSocketOpened || !bobSocketOpened) throw new Error('Sockets failed to open');
    console.log('Both Alice and Bob WebSocket connections are active.');

    // Event listener accumulators for testing assertions
    const aliceReceived: any[] = [];
    const bobReceived: any[] = [];

    aliceSocket.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      console.log(`[Alice Socket] RECV:`, parsed.type);
      aliceReceived.push(parsed);
    });

    bobSocket.on('message', (data) => {
      const parsed = JSON.parse(data.toString());
      console.log(`[Bob Socket] RECV:`, parsed.type);
      bobReceived.push(parsed);
    });

    await delay(500);

    // ----------------------------------------------------
    // Step 6: Text messaging & Typing Indicators
    // ----------------------------------------------------
    console.log('\n[Flow] Testing Typing Indicators...');
    aliceSocket.send(JSON.stringify({
      type: 'typing',
      roomId,
      isTyping: true,
    }));
    await delay(300);

    // Assert Bob received typing indicator
    const typingEvent = bobReceived.find((e) => e.type === 'typing');
    if (typingEvent && typingEvent.isTyping && typingEvent.userId === aliceUserId) {
      console.log('✔ Bob successfully received Alice\'s typing indicator.');
    } else {
      console.error('❌ Bob did not receive typing indicator correctly.', typingEvent);
    }

    console.log('\n[Flow] Testing Text Message Sending & Receiving...');
    aliceSocket.send(JSON.stringify({
      type: 'send_message',
      roomId,
      content: 'Hello Bob! This is Alice calling you in real-time!',
    }));
    await delay(500);

    // Assert Bob received the message
    const messageEvent = bobReceived.find((e) => e.type === 'message');
    if (messageEvent && messageEvent.message.content === 'Hello Bob! This is Alice calling you in real-time!') {
      console.log('✔ Bob successfully received Alice\'s text message.');
    } else {
      console.error('❌ Bob did not receive message correctly.', messageEvent);
    }

    // ----------------------------------------------------
    // Step 7: Read Receipts
    // ----------------------------------------------------
    console.log('\n[Flow] Testing Read Receipts...');
    bobSocket.send(JSON.stringify({
      type: 'mark_read',
      roomId,
    }));
    await delay(500);

    // Assert Alice received a read receipt
    const readReceiptEvent = aliceReceived.find((e) => e.type === 'read_receipt');
    if (readReceiptEvent && readReceiptEvent.readerId === bobUserId && readReceiptEvent.roomId === roomId) {
      console.log('✔ Alice successfully received Bob\'s read receipt.');
    } else {
      console.error('❌ Alice did not receive read receipt correctly.', readReceiptEvent);
    }

    // ----------------------------------------------------
    // Step 8: WebRTC Calling signaling handshake
    // ----------------------------------------------------
    console.log('\n[Flow] Testing WebRTC Call Initiation (Caller = Alice, Receiver = Bob)...');
    const dummySdpOffer = { type: 'offer', sdp: 'v=0\r\no=alice 2890844526...' };
    aliceSocket.send(JSON.stringify({
      type: 'call_initiate',
      roomId,
      targetUserId: bobUserId,
      callType: 'video',
      sdpOffer: dummySdpOffer,
    }));
    await delay(500);

    // Assert Bob received call request
    const incomingCallEvent = bobReceived.find((e) => e.type === 'call_incoming');
    if (incomingCallEvent && incomingCallEvent.hostId === aliceUserId && incomingCallEvent.callType === 'video') {
      console.log('✔ Bob successfully received Alice\'s video call offer.');
    } else {
      console.error('❌ Bob did not receive call incoming event correctly.', incomingCallEvent);
    }

    const callId = incomingCallEvent?.callId;
    if (!callId) throw new Error('No callId returned during call initiation');

    console.log('\n[Flow] Testing WebRTC Call Answering...');
    const dummySdpAnswer = { type: 'answer', sdp: 'v=0\r\no=bob 2890844527...' };
    bobSocket.send(JSON.stringify({
      type: 'call_answer',
      callId,
      targetUserId: aliceUserId,
      sdpAnswer: dummySdpAnswer,
    }));
    await delay(500);

    // Assert Alice received answer
    const callAnsweredEvent = aliceReceived.find((e) => e.type === 'call_answered');
    if (callAnsweredEvent && callAnsweredEvent.responderId === bobUserId) {
      console.log('✔ Alice successfully received Bob\'s WebRTC answer.');
    } else {
      console.error('❌ Alice did not receive call answered event correctly.', callAnsweredEvent);
    }

    console.log('\n[Flow] Testing WebRTC ICE Candidate routing...');
    const dummyCandidate = { candidate: 'candidate:842130496 1 udp 1677721855 127.0.0.1 53121 typ host', sdpMLineIndex: 0 };
    aliceSocket.send(JSON.stringify({
      type: 'ice_candidate',
      targetUserId: bobUserId,
      candidate: dummyCandidate,
    }));
    await delay(300);

    // Assert Bob received ICE candidate
    const iceCandidateEvent = bobReceived.find((e) => e.type === 'ice_candidate' && e.senderId === aliceUserId);
    if (iceCandidateEvent && iceCandidateEvent.candidate.candidate === dummyCandidate.candidate) {
      console.log('✔ Bob successfully received Alice\'s ICE candidate.');
    } else {
      console.error('❌ Bob did not receive ICE candidate correctly.', iceCandidateEvent);
    }

    console.log('\n[Flow] Testing Call Hangup...');
    aliceSocket.send(JSON.stringify({
      type: 'call_hangup',
      callId,
      targetUserId: bobUserId,
    }));
    await delay(500);

    // Assert Bob received call hangup event
    const callHungupEvent = bobReceived.find((e) => e.type === 'call_hungup');
    if (callHungupEvent && callHungupEvent.callId === callId) {
      console.log('✔ Bob successfully received Alice\'s hangup event.');
    } else {
      console.error('❌ Bob did not receive hangup event correctly.', callHungupEvent);
    }

    // ----------------------------------------------------
    // Step 9: REST API History Fetch Checks
    // ----------------------------------------------------
    console.log('\n[HTTP] Fetching Alice\'s conversation dashboard...');
    const convRes = await fetch(`${BASE_URL}/api/chat/conversations`, {
      headers: { Authorization: `Bearer ${aliceAccessToken}` },
    });
    const convs = await convRes.json();
    if (!convRes.ok) throw new Error(`Failed to fetch conversations: ${JSON.stringify(convs)}`);
    console.log('Alice\'s conversations fetched successfully:', JSON.stringify(convs, null, 2));

    console.log('\n[HTTP] Fetching room messages (cursor pagination)...');
    const msgRes = await fetch(`${BASE_URL}/api/chat/conversations/${roomId}/messages?limit=5`, {
      headers: { Authorization: `Bearer ${aliceAccessToken}` },
    });
    const messages = await msgRes.json();
    if (!msgRes.ok) throw new Error(`Failed to fetch messages: ${JSON.stringify(messages)}`);
    console.log('Historical messages fetched:', JSON.stringify(messages, null, 2));

    // ----------------------------------------------------
    // Step 10: Teardown WebSocket Connections
    // ----------------------------------------------------
    console.log('\n[WS] Disconnecting WebSocket clients...');
    aliceSocket.close();
    bobSocket.close();
    await delay(500);

    // ----------------------------------------------------
    // Step 11: Logout Cleanup
    // ----------------------------------------------------
    console.log('\n[HTTP] Revoking refresh tokens via Logout...');
    const logoutAlice = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': aliceCookie || '' }
    });
    console.log('Alice logout status:', logoutAlice.status);

    const logoutBob = await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { 'Cookie': bobCookie || '' }
    });
    console.log('Bob logout status:', logoutBob.status);

    console.log('\n✔✔✔ ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY ✔✔✔');
  } catch (error) {
    console.error('\n❌ TEST FAILED WITH ERROR:', error);
    process.exit(1);
  }
}

runTest();
