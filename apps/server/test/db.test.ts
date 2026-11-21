import { describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { newProgress } from '@loodl/rules';
import { createStore, sanitizeProfile, type Sql } from '../src/db';

// PGlite is real Postgres compiled to WebAssembly, so these run the same SQL as Supabase.
const fresh = async () => {
  const db = new PGlite();
  const store = createStore(db as unknown as Sql);
  await store.migrate();
  return { db, store };
};

describe('profile store', () => {
  it('creates its own schema and can run the setup again safely', async () => {
    const { db, store } = await fresh();
    await store.migrate();
    const { rows } = await db.query<{ table_schema: string }>("select table_schema from information_schema.tables where table_name = 'players'");
    expect(rows.map((r) => r.table_schema)).toEqual(['loodle']);
  });

  it('has no profile until one is saved, then returns what was saved', async () => {
    const { store } = await fresh();
    expect(await store.get('google:1')).toBeNull();
    const progress = { ...newProgress(), xp: 500, coins: 120 };
    const saved = await store.save('google:1', { name: 'Krazer', avatar: 3, progress, challenges: ['hunter'] });
    expect(saved).toMatchObject({ name: 'Krazer', avatar: 3, challenges: ['hunter'] });
    expect(saved.progress).toMatchObject({ xp: 500, coins: 120 });
    expect((await store.get('google:1'))?.progress.coins).toBe(120);
    expect(saved.updatedAt).toBeGreaterThan(0);
  });

  it('updates in place and keeps players apart', async () => {
    const { store } = await fresh();
    await store.save('google:1', { name: 'Alpha' });
    await store.save('google:2', { name: 'Bravo' });
    await store.save('google:1', { name: 'Alpha_2' });
    expect((await store.get('google:1'))?.name).toBe('Alpha_2');
    expect((await store.get('google:2'))?.name).toBe('Bravo');
  });

  it('deletes a profile', async () => {
    const { store } = await fresh();
    await store.save('google:1', { name: 'Alpha' });
    expect(await store.remove('google:1')).toBe(true);
    expect(await store.get('google:1')).toBeNull();
    expect(await store.remove('google:1')).toBe(false);
  });

  it('cleans what clients send before storing it', () => {
    const p = sanitizeProfile({
      name: '<script>',
      avatar: 99,
      progress: { xp: -5, coins: 'lots' },
      wardrobe: { owned: ['board_royal', 'made_up'], equipped: { board: 'board_royal' } },
      challenges: ['hunter', 'hunter', 'DROP TABLE', 7],
    });
    expect(p.name).toBe('Guest');
    expect(p.avatar).toBe(0);
    expect(p.progress).toMatchObject({ xp: 0, coins: 0 });
    expect(p.wardrobe.owned).toContain('board_royal');
    expect(p.wardrobe.owned).not.toContain('made_up');
    expect(p.challenges).toEqual(['hunter']);
  });
});

describe('connecting', () => {
  it('rejects a value that is not a connection string without repeating it', async () => {
    const { connect } = await import('../src/db');
    for (const bad of ['justAPasswordValue123', 'https://user:secretValue9@example.com/db', 'postgresql://host-only.example.com/db']) {
      let message = '';
      try {
        connect(bad);
      } catch (err) {
        message = (err as Error).message;
      }
      expect(message).toMatch(/DATABASE_URL/);
      expect(message).not.toContain('justAPasswordValue123');
      expect(message).not.toContain('secretValue9');
    }
  });
});
