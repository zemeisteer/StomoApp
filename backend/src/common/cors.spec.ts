import express from 'express';
import request from 'supertest';
import { allowedOrigins, buildCorsOptions } from './cors';

const cors = require('cors');

describe('CORS', () => {
  const origins = allowedOrigins('https://stomoapp.vercel.app', '', false);
  const app = express();
  app.use(cors(buildCorsOptions(origins)));
  app.get('/api/x', (_req, res) => res.json({ ok: true }));

  it('allows the configured site with credentials', async () => {
    const res = await request(app).get('/api/x').set('Origin', 'https://stomoapp.vercel.app');
    expect(res.headers['access-control-allow-origin']).toBe('https://stomoapp.vercel.app');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('gives a foreign origin no CORS headers (browser blocks it), also on preflight', async () => {
    const res = await request(app).get('/api/x').set('Origin', 'https://evil.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await request(app).options('/api/x').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never accepts a wildcard or a malformed origin', () => {
    expect(() => allowedOrigins('*', '', false)).toThrow();
    expect(() => allowedOrigins('https://a.test', 'https://*.evil.test', false)).toThrow();
    expect(allowedOrigins('https://a.test/', '', false)).toEqual(['https://a.test']);
    expect(allowedOrigins('https://a.test', '', false)).not.toContain('http://localhost:3000');
    expect(allowedOrigins('https://a.test', '', true)).toContain('http://localhost:3000');
  });
});
