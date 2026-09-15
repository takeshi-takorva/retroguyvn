import { ensureProductSchema } from './schema.js';
import { createProduct } from './create.js';
import { publishProduct } from './publish.js';

const checkedEnvs = new WeakSet();
const inFlight = new WeakMap();

export const INITIAL_DR_PORTAL = Object.freeze({
  name: 'DR Portal',
  slug: 'dr-portal',
  subtitle: 'Pocket Adventure Device',
  excerpt: 'A compact dedicated handheld built around physical controls, portable play, speaker and vibration feedback, and a persistent digital companion experience.',
  category: 'Handheld',
  availability: 'development',
  featured: true,
  sortOrder: 0,
  coverMediaId: null,
  description: 'DR Portal is RetroGuy VN’s pocket adventure device, designed as a dedicated physical home for long-term digital companion experiences.',
  features: [
    { title: 'Physical Controls', text: 'Dedicated directional and action controls designed for quick pocket play.' },
    { title: 'Portable Form Factor', text: 'A compact handheld format intended for everyday carry.' },
    { title: 'Speaker + Vibration', text: 'Physical audio and vibration feedback keeps interactions tactile.' },
    { title: 'Expandable Content', text: 'A software architecture designed for evolving content and future releases.' }
  ],
  specs: [],
  galleryMediaIds: [],
  cta: { label: 'Get support', href: '/support' }
});

export async function bootstrapProducts(env, actor = 'system', deps = {}) {
  if (checkedEnvs.has(env)) return { created: false, reason: 'already-checked' };
  if (inFlight.has(env)) return inFlight.get(env);

  const run = (async () => {
    const ensureSchema = deps.ensureSchema || ensureProductSchema;
    const create = deps.create || createProduct;
    const publish = deps.publish || publishProduct;
    await ensureSchema(env);
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM products').first();
    if (Number(row?.count || 0) > 0) {
      checkedEnvs.add(env);
      return { created: false, reason: 'not-empty' };
    }
    try {
      const product = await create(env, INITIAL_DR_PORTAL, actor);
      await publish(env, product.id, actor);
      checkedEnvs.add(env);
      return { created: true, id: product.id };
    } catch (error) {
      const check = await env.DB.prepare('SELECT COUNT(*) AS count FROM products').first().catch(() => null);
      if (Number(check?.count || 0) > 0) {
        checkedEnvs.add(env);
        return { created: false, reason: 'concurrent-create' };
      }
      throw error;
    } finally {
      inFlight.delete(env);
    }
  })();

  inFlight.set(env, run);
  return run;
}
