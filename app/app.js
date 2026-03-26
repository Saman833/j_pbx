'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const { createServer } = require('http');
const { createEndpoint } = require('@jambonz/node-client-ws');

const app = express();

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
