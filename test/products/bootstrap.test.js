import test from 'node:test';
import assert from 'node:assert/strict';
import { bootstrapProducts } from '../../src/products/bootstrap.js';

test('bootstrap creates and publishes DR Portal only for an empty Product CMS', async () => {
  let countChecks = 0;
  const env = {
    DB: {
      prepare(sql) {
        assert.match(sql, /COUNT\(\*\)/i);
        return { async first() { countChecks += 1; return { count: 0 }; } };
      }
    }
  };
  const calls = [];
  const deps = {
    ensureSchema: async () => true,
    create: async (_env, draft) => { calls.push(['create', draft.name, draft.slug]); return { id: 'prod_seed' }; },
    publish: async (_env, id) => { calls.push(['publish', id]); return { id }; }
  };
  const first = await bootstrapProducts(env, 'system', deps);
  const second = await bootstrapProducts(env, 'system', deps);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(countChecks, 1);
  assert.deepEqual(calls, [['create', 'DR Portal', 'dr-portal'], ['publish', 'prod_seed']]);
});

test('bootstrap is a no-op when any Product CMS content already exists', async () => {
  const env = { DB: { prepare() { return { async first() { return { count: 2 }; } }; } } };
  let writes = 0;
  const result = await bootstrapProducts(env, 'system', {
    ensureSchema: async () => true,
    create: async () => { writes += 1; },
    publish: async () => { writes += 1; }
  });
  assert.equal(result.created, false);
  assert.equal(writes, 0);
});
