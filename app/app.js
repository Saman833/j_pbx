'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const { createServer } = require('http');
const { createEndpoint } = require('@jambonz/node-client-ws');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  // Some providers send //webhook/... paths; normalize them for route matching.
  req.url = req.url.replace(/\/{2,}/g, '/');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  return next();
});

const lookupPublicIp = async () => {
  const endpoints = [
    'https://api.ipify.org',
    'https://ifconfig.me/ip',
  ];

  for (const url of endpoints) {
    try {
      const response = await fetch(url, { headers: { accept: 'text/plain' } });
      if (!response.ok) continue;
      const ip = (await response.text()).trim();
      if (ip) return ip;
    } catch (err) {
      // Try next endpoint
    }
  }
  return null;
};

const buildLlmVerbs = () => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const publicBaseUrl = process.env.PUBLIC_BASE_URL || '';
  const actionHook = publicBaseUrl ? `${publicBaseUrl.replace(/\/$/, '')}/action` : '/action';

  if (!agentId) {
    return [{ verb: 'hangup' }];
  }

  return [
    { verb: 'pause', length: 1 },
    {
      verb: 'llm',
      vendor: 'elevenlabs',
      model: 'conversational',
      auth: { api_key: apiKey || undefined },
      llmOptions: { agent_id: agentId },
      actionHook,
    },
  ];
};

/**
 * Placetel → Jambonz → ElevenLabs
 * When a call arrives on your Placetel number, Jambonz catches it
 * and connects it to your ElevenLabs AI Agent via the llm verb.
 */
const wsServer = createServer();
const makeService = createEndpoint({ server: wsServer });
const svc = makeService({ path: '/' });

svc.on('session:new', (session) => {
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const apiKey  = process.env.ELEVENLABS_API_KEY;

  if (!agentId) {
    console.error('ELEVENLABS_AGENT_ID is not set.');
    session.hangup().send();
    return;
  }

  if (!apiKey) {
    console.warn('ELEVENLABS_API_KEY is not set. Calls may fail if your agent requires authentication.');
  }

  console.log(`Incoming call from ${session.from} -> connecting to ElevenLabs agent ${agentId}`);

  session
    .pause({ length: 1 })
    .llm({
      vendor: 'elevenlabs',
      model: 'conversational',
      auth: {
        api_key: apiKey || undefined,
      },
      llmOptions: {
        agent_id: agentId,
      },
      actionHook: '/action',
    })
    .send();

  session.on('/action', (evt = {}) => {
    const { completion_reason, call_sid } = evt;
    console.log(`Call ${call_sid} ended. Reason: ${completion_reason}`);
    session.hangup().reply();
  });
});

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'elevenlabs-bridge' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', agent: process.env.ELEVENLABS_AGENT_ID });
});

// HTTP webhook mode for jambonz cloud applications
app.post('/webhook/call', (req, res) => {
  const from = req.body?.from || 'unknown';
  console.log(`Incoming webhook call from ${from}`);
  res.json(buildLlmVerbs());
});

app.post('/webhook/status', (req, res) => {
  const callSid = req.body?.call_sid || 'unknown';
  const callStatus = req.body?.call_status || req.body?.callStatus || 'unknown';
  console.log(`Call status webhook: ${callSid} -> ${callStatus}`);
  res.status(200).json({ ok: true });
});

app.post('/action', (req, res) => {
  const callSid = req.body?.call_sid || 'unknown';
  const reason = req.body?.completion_reason || 'unknown';
  console.log(`Action webhook for call ${callSid}. Reason: ${reason}`);
  res.json([{ verb: 'hangup' }]);
});

const port = process.env.PORT || process.env.HTTP_PORT || 3000;
const wsPort = process.env.WS_PORT || 3001;

app.listen(port, () => {
  console.log(`HTTP health endpoint listening on http://localhost:${port}/health`);
});

wsServer.listen(wsPort, () => {
  console.log(`Jambonz websocket service listening on ws://localhost:${wsPort}/`);
  console.log(`Agent: ${process.env.ELEVENLABS_AGENT_ID || 'NOT SET'}`);

  lookupPublicIp()
    .then((ip) => {
      if (ip) {
        console.log(`Public IP: ${ip}`);
      } else {
        console.warn('Public IP: could not auto-detect');
      }
    })
    .catch(() => {
      console.warn('Public IP: could not auto-detect');
    });
});
