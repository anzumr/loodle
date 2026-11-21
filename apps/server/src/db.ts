/**
 * Player profiles in Postgres (Supabase in production).
 *
 * Everything lives in its own `loodle` schema so it can share a Supabase project
 * with other apps without touching their tables. Without DATABASE_URL the server
 * runs exactly as before and profiles stay on each device.
 */
import pg from 'pg';
import {
  cleanAvatar,
  newProgress,
  newWardrobe,
  sanitizeProgress,
  sanitizeWardrobe,
  validateUsername,
  type Progress,
  type Wardrobe,
} from '@loodl/rules';

/** Anything with `query(text, params)` returning rows: a pg Pool in production, PGlite in tests. */
export interface Sql {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Profile {
  name: string;
  avatar: number;
  progress: Progress;
  wardrobe: Wardrobe;
  /** Challenge ids solved. */
  challenges: string[];
  /** Milliseconds since 1970, set by the server on every save. */
  updatedAt: number;
}

export const SCHEMA_SQL = `
create schema if not exists loodle;
create table if not exists loodle.players (
  id          text primary key,
  name        text not null,
  avatar      integer not null default 0,
  progress    jsonb not null,
  wardrobe    jsonb not null,
  challenges  jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
`;

const MAX_CHALLENGES = 100;

/** Clean anything a client sends before it is stored. Unknown or malformed parts fall back to defaults. */
export function sanitizeProfile(input: unknown): Omit<Profile, 'updatedAt'> {
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<Profile>;
  const name = validateUsername(raw.name);
  return {
    name: name.ok ? name.name : 'Guest',
    avatar: cleanAvatar(raw.avatar),
    progress: sanitizeProgress(raw.progress ?? newProgress()),
    wardrobe: sanitizeWardrobe(raw.wardrobe ?? newWardrobe()),
    challenges: Array.isArray(raw.challenges)
      ? [...new Set(raw.challenges.filter((c): c is string => typeof c === 'string' && /^[a-z0-9-]{1,40}$/.test(c)))].slice(0, MAX_CHALLENGES)
      : [],
  };
}

interface Row {
  name: string;
  avatar: number;
  progress: unknown;
  wardrobe: unknown;
  challenges: unknown;
  updated_at: Date | string;
}

const fromRow = (row: Row): Profile => ({
  ...sanitizeProfile({ ...row, progress: row.progress, wardrobe: row.wardrobe, challenges: row.challenges }),
  updatedAt: new Date(row.updated_at).getTime(),
});

export function createStore(sql: Sql) {
  return {
    /** Create the schema and table if they are missing. Safe to run on every start. */
    async migrate() {
      for (const statement of SCHEMA_SQL.split(';').map((s) => s.trim()).filter(Boolean)) await sql.query(statement);
    },
    async get(id: string): Promise<Profile | null> {
      const { rows } = await sql.query<Row>('select name, avatar, progress, wardrobe, challenges, updated_at from loodle.players where id = $1', [id]);
      return rows[0] ? fromRow(rows[0]) : null;
    },
    async save(id: string, input: unknown): Promise<Profile> {
      const p = sanitizeProfile(input);
      const { rows } = await sql.query<Row>(
        `insert into loodle.players (id, name, avatar, progress, wardrobe, challenges)
         values ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
         on conflict (id) do update set
           name = excluded.name, avatar = excluded.avatar, progress = excluded.progress,
           wardrobe = excluded.wardrobe, challenges = excluded.challenges, updated_at = now()
         returning name, avatar, progress, wardrobe, challenges, updated_at`,
        [id, p.name, p.avatar, JSON.stringify(p.progress), JSON.stringify(p.wardrobe), JSON.stringify(p.challenges)],
      );
      return fromRow(rows[0]!);
    },
    /** Remove a player's stored profile (account deletion). */
    async remove(id: string): Promise<boolean> {
      const { rows } = await sql.query('delete from loodle.players where id = $1 returning id', [id]);
      return rows.length > 0;
    },
  };
}
export type Store = ReturnType<typeof createStore>;

/**
 * Connect using DATABASE_URL. Supabase: use the connection pooler string (the direct
 * address needs IPv6). Set DATABASE_CA to Supabase's CA certificate (PEM) to verify the
 * server certificate; without it the connection is still encrypted but not verified.
 */
export function connect(url: string, ca?: string): Sql {
  // Never include the value in errors: it holds the database password and would end up in logs.
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error('DATABASE_URL is not a connection string. It should start with postgresql://');
  }
  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:')
    throw new Error('DATABASE_URL should start with postgresql://');
  if (!parsed.hostname || !parsed.username || !parsed.password)
    throw new Error('DATABASE_URL is missing the user, password or host');
  parsed.searchParams.delete('sslmode'); // the ssl option below decides
  const local = ['localhost', '127.0.0.1'].includes(parsed.hostname);
  return new pg.Pool({
    connectionString: parsed.toString(),
    ssl: local ? false : ca ? { ca } : { rejectUnauthorized: false },
    max: 3, // Supabase's free pooler allows few connections
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}
