'use strict';

require('dotenv').config();
const express = require('express');
const crypto = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const META_APP_SECRET = process.env.META_APP_SECRET;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const AI_NAME = (process.env.AI_NAME || 'Olivier').trim() || 'Olivier';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const GRAPH_API_VERSION = process.env.GRAPH_API_VERSION || 'v26.0';
const MAX_HISTORY_MESSAGES = Number(process.env.MAX_HISTORY_MESSAGES || 12);
const MAX_MESSAGE_LENGTH = 2000;

if (!VERIFY_TOKEN || !PAGE_ACCESS_TOKEN || !META_APP_SECRET || !GROQ_API_KEY) {
  console.error('Missing required environment variables. Check your .env file.');
  process.exit(1);
}

// Keep the raw request body so Meta's X-Hub-Signature-256 can be verified.
app.use('/webhook', express.raw({ type: 'application/json', limit: '1mb' }));
app.use(express.json({ limit: '100kb' }));

// Simple in-memory conversation history. It resets when the server restarts.
const conversations = new Map();
// Prevent processing the same webhook event twice during this process lifetime.
const seenEvents = new Map();
const MAX_SEEN_EVENTS = 5000;

function verifyMetaSignature(req) {
  const signature = req.get('x-hub-signature-256');
  if (!signature || !Buffer.isBuffer(req.body)) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', META_APP_SECRET)
    .update(req.body)
    .digest('hex');

  const suppliedBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return suppliedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function getHistory(senderId) {
  return conversations.get(senderId) || [];
}

function addToHistory(senderId, role, content) {
  const history = getHistory(senderId);
  history.push({ role, content });
  const max = Math.max(2, MAX_HISTORY_MESSAGES);
  while (history.length > max) history.shift();
  conversations.set(senderId, history);
}

async function askGroq(senderId, userText) {
  const messages = [
    {
      role: 'system',
      content: [
        `Ny anaranao dia ${AI_NAME}. Ianao no ${AI_NAME}, mpanampy AI ao amin’ny Facebook Messenger. Rehefa anontaniana ny anaranao dia valio hoe ${AI_NAME}.`,
        'Valio amin’ny fiteny nampiasain’ny olona: Malagasy na Français; raha hafa dia valio amin’io fiteny io.',
        'Ataovy mazava, sariaka, fohy ary manaja ny olona ny valiny.',
        'Aza milaza fa olona tena izy ianao. Raha tsy fantatrao ny valiny dia lazao am-pahatsorana.',
        'Aza mangataka na mamoaka tenimiafina, API keys, na kaody miafina.'
      ].join(' ')
    },
    ...getHistory(senderId),
    { role: 'user', content: userText }
  ];

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_completion_tokens: 500
    }),
    signal: AbortSignal.timeout(30000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || `Groq API returned HTTP ${response.status}`;
    throw new Error(message);
  }

  const answer = data?.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error('Groq returned an empty answer.');
  }

  addToHistory(senderId, 'user', userText);
  addToHistory(senderId, 'assistant', answer.trim());
  return answer.trim();
}

async function sendMessengerMessage(recipientId, text) {
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/me/messages`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAGE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      recipient: { id: recipientId },
      messaging_type: 'RESPONSE',
      message: { text: String(text).slice(0, MAX_MESSAGE_LENGTH) }
    }),
    signal: AbortSignal.timeout(20000)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `Meta Graph API returned HTTP ${response.status}`);
  }
  return data;
}

function wasSeen(event) {
  // Message ID is preferred; otherwise use sender + timestamp + text as a fallback key.
  const key = event.message?.mid || [
    event.sender?.id || '',
    event.timestamp || '',
    event.message?.text || ''
  ].join(':');

  if (seenEvents.has(key)) return true;
  seenEvents.set(key, Date.now());
  if (seenEvents.size > MAX_SEEN_EVENTS) {
    const oldestKey = seenEvents.keys().next().value;
    seenEvents.delete(oldestKey);
  }
  return false;
}

async function processMessagingEvent(event) {
  // Ignore page echoes, delivery/read receipts, postbacks, and non-text messages.
  if (!event || event.message?.is_echo) return;
  const senderId = event.sender?.id;
  const text = event.message?.text?.trim();
  if (!senderId || !text) return;
  if (wasSeen(event)) return;

  try {
    const answer = await askGroq(senderId, text);
    await sendMessengerMessage(senderId, answer);
  } catch (error) {
    console.error('Could not process incoming message:', error.message);
    // A brief fallback; if sending fails, log it without crashing the webhook.
    try {
      await sendMessengerMessage(
        senderId,
        'Miala tsiny, misy olana vetivety amin’ny famaliana. Andramo indray afaka kelikely.'
      );
    } catch (sendError) {
      console.error('Could not send fallback message:', sendError.message);
    }
  }
}

// Meta webhook verification (GET).
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
    return res.status(200).type('text/plain').send(challenge);
  }
  return res.sendStatus(403);
});

// Incoming Messenger events (POST).
app.post('/webhook', (req, res) => {
  if (!verifyMetaSignature(req)) return res.sendStatus(401);

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }

  if (body.object !== 'page') return res.sendStatus(404);

  // Respond quickly to Meta; process messages after acknowledging the webhook.
  res.sendStatus(200);
  for (const entry of body.entry || []) {
    for (const event of entry.messaging || []) {
      void processMessagingEvent(event);
    }
  }
});

app.get('/', (_req, res) => {
  res.status(200).send(`${AI_NAME} AI Messenger bot is running.`);
});

app.listen(PORT, () => {
  console.log(`${AI_NAME} AI Messenger bot listening on port ${PORT}`);
  console.log(`Model: ${GROQ_MODEL}`);
  console.log(`Meta Graph API: ${GRAPH_API_VERSION}`);
});
