import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateContent = vi.fn(async () => ({ text: '{"explanation":"ok","updates":[]}' }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { models = { generateContent }; },
}));

import handler from '../../api/market-prices';

function mockRes() {
  const res: any = { statusCode: 0, body: null };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: unknown) => { res.body = b; return res; };
  return res;
}

const body = { query: 'cemento', candidates: [{ id: 'm1', name: 'Cemento', currentPrice: 100, unit: 'kg' }] };

describe('api/market-prices', () => {
  beforeEach(() => {
    generateContent.mockClear();
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon';
    process.env.GEMINI_API_KEY = 'server-key';
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) =>
      ({ ok: init?.headers?.Authorization === 'Bearer valido' })));
  });

  it('rechaza sin sesión válida y no llama a Gemini', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer malo' }, body }, res);
    expect(res.statusCode).toBe(401);
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('rechaza métodos que no son POST', async () => {
    const res = mockRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('valida que haya consulta y materiales', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer valido' }, body: { query: '' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('con sesión válida devuelve el texto de Gemini', async () => {
    const res = mockRes();
    await handler({ method: 'POST', headers: { authorization: 'Bearer valido' }, body }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ text: '{"explanation":"ok","updates":[]}' });
    expect(generateContent).toHaveBeenCalledOnce();
  });
});
