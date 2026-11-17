/**
 * Cosmetics: board skins, pawn finishes and dice colours.
 *
 * Purely visual. Nothing here is read by the rules engine, the AI or the
 * server's match logic, so owning or buying an item can never change dice,
 * legal moves or results.
 */

export type CosmeticKind = 'board' | 'pawn' | 'dice';

export interface Cosmetic {
  id: string;
  kind: CosmeticKind;
  name: string;
  detail: string;
  /** Coins to buy. 0 means everyone owns it from the start. */
  price: number;
  /** Player level needed before it can be bought. */
  level: number;
}

export const COSMETICS: readonly Cosmetic[] = [
  { id: 'board_classic', kind: 'board', name: 'Classic', detail: 'Cream tiles, gold trim', price: 0, level: 1 },
  { id: 'board_midnight', kind: 'board', name: 'Midnight', detail: 'Moonlit tiles, silver trim', price: 150, level: 1 },
  { id: 'board_royal', kind: 'board', name: 'Royal', detail: 'Ivory tiles on deep burgundy', price: 400, level: 3 },
  { id: 'pawn_glossy', kind: 'pawn', name: 'Glossy', detail: 'Polished enamel', price: 0, level: 1 },
  { id: 'pawn_metal', kind: 'pawn', name: 'Metal', detail: 'Brushed metallic finish', price: 200, level: 1 },
  { id: 'pawn_pearl', kind: 'pawn', name: 'Pearl', detail: 'Soft satin sheen', price: 300, level: 2 },
  { id: 'dice_ivory', kind: 'dice', name: 'Ivory', detail: 'White with dark pips', price: 0, level: 1 },
  { id: 'dice_ruby', kind: 'dice', name: 'Ruby', detail: 'Red with white pips', price: 100, level: 1 },
  { id: 'dice_onyx', kind: 'dice', name: 'Onyx', detail: 'Black with gold pips', price: 250, level: 2 },
];

export const cosmeticById = (id: string): Cosmetic | undefined => COSMETICS.find((c) => c.id === id);

export interface Wardrobe {
  owned: string[];
  equipped: Record<CosmeticKind, string>;
}

const FREE = COSMETICS.filter((c) => c.price === 0).map((c) => c.id);

export const newWardrobe = (): Wardrobe => ({
  owned: [...FREE],
  equipped: { board: 'board_classic', pawn: 'pawn_glossy', dice: 'dice_ivory' },
});

export type PurchaseResult =
  | { ok: true; wardrobe: Wardrobe; coins: number }
  | { ok: false; reason: 'unknown' | 'owned' | 'level' | 'coins' };

/** Buy an item with coins. Returns the new wardrobe and remaining coins, or why it was refused. */
export function buyCosmetic(wardrobe: Wardrobe, id: string, coins: number, level: number): PurchaseResult {
  const item = cosmeticById(id);
  if (!item) return { ok: false, reason: 'unknown' };
  if (wardrobe.owned.includes(id)) return { ok: false, reason: 'owned' };
  if (level < item.level) return { ok: false, reason: 'level' };
  if (coins < item.price) return { ok: false, reason: 'coins' };
  return { ok: true, wardrobe: { ...wardrobe, owned: [...wardrobe.owned, id] }, coins: coins - item.price };
}

/** Equip an owned item. Unowned or unknown items leave the wardrobe unchanged. */
export function equipCosmetic(wardrobe: Wardrobe, id: string): Wardrobe {
  const item = cosmeticById(id);
  if (!item || !wardrobe.owned.includes(id)) return wardrobe;
  return { ...wardrobe, equipped: { ...wardrobe.equipped, [item.kind]: id } };
}

/** Rebuild a valid wardrobe from stored data: unknown items dropped, free items always owned, only owned items equipped. */
export function sanitizeWardrobe(input: unknown): Wardrobe {
  const fresh = newWardrobe();
  if (!input || typeof input !== 'object') return fresh;
  const raw = input as Partial<Wardrobe>;
  const owned = [...new Set([...FREE, ...(Array.isArray(raw.owned) ? raw.owned.filter((id): id is string => typeof id === 'string' && !!cosmeticById(id)) : [])])];
  const equipped = { ...fresh.equipped };
  for (const kind of ['board', 'pawn', 'dice'] as const) {
    const id = raw.equipped?.[kind];
    if (typeof id === 'string' && owned.includes(id) && cosmeticById(id)?.kind === kind) equipped[kind] = id;
  }
  return { owned, equipped };
}
