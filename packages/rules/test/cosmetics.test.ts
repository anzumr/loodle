import { describe, expect, it } from 'vitest';
import { COSMETICS, buyCosmetic, equipCosmetic, newWardrobe, sanitizeWardrobe } from '../src';

describe('cosmetics catalogue', () => {
  it('has unique ids and one free item of each kind', () => {
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    for (const kind of ['board', 'pawn', 'dice']) expect(COSMETICS.filter((c) => c.kind === kind && c.price === 0)).toHaveLength(1);
  });

  it('starts everyone with the free items equipped', () => {
    const w = newWardrobe();
    expect(w.owned.sort()).toEqual(['board_classic', 'dice_ivory', 'pawn_glossy']);
    expect(w.equipped).toEqual({ board: 'board_classic', pawn: 'pawn_glossy', dice: 'dice_ivory' });
  });
});

describe('buying', () => {
  it('takes the price and adds the item', () => {
    const r = buyCosmetic(newWardrobe(), 'board_midnight', 200, 1);
    expect(r).toMatchObject({ ok: true, coins: 50 });
    if (r.ok) expect(r.wardrobe.owned).toContain('board_midnight');
  });

  it('refuses when coins or level are short, the item is owned, or it does not exist', () => {
    const w = newWardrobe();
    expect(buyCosmetic(w, 'board_midnight', 149, 9)).toEqual({ ok: false, reason: 'coins' });
    expect(buyCosmetic(w, 'board_royal', 9999, 2)).toEqual({ ok: false, reason: 'level' });
    expect(buyCosmetic(w, 'board_classic', 9999, 9)).toEqual({ ok: false, reason: 'owned' });
    expect(buyCosmetic(w, 'board_golden_ticket', 9999, 9)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('never charges twice or leaves the original wardrobe changed', () => {
    const w = newWardrobe();
    const first = buyCosmetic(w, 'dice_ruby', 100, 1);
    expect(w.owned).not.toContain('dice_ruby');
    if (!first.ok) throw new Error('expected purchase');
    expect(buyCosmetic(first.wardrobe, 'dice_ruby', 100, 1)).toEqual({ ok: false, reason: 'owned' });
  });
});

describe('equipping', () => {
  it('equips owned items into the right slot only', () => {
    const bought = buyCosmetic(newWardrobe(), 'pawn_metal', 200, 1);
    if (!bought.ok) throw new Error('expected purchase');
    const w = equipCosmetic(bought.wardrobe, 'pawn_metal');
    expect(w.equipped).toEqual({ board: 'board_classic', pawn: 'pawn_metal', dice: 'dice_ivory' });
  });

  it('ignores items that are not owned', () => {
    const w = newWardrobe();
    expect(equipCosmetic(w, 'board_royal')).toBe(w);
    expect(equipCosmetic(w, 'nope')).toBe(w);
  });
});

describe('stored wardrobe', () => {
  it('drops unknown items and never equips something that is not owned', () => {
    const w = sanitizeWardrobe({ owned: ['dice_ruby', 'hacked_item', 42], equipped: { board: 'board_royal', dice: 'dice_ruby', pawn: 'dice_ruby' } });
    expect(w.owned.sort()).toEqual(['board_classic', 'dice_ivory', 'dice_ruby', 'pawn_glossy']);
    expect(w.equipped).toEqual({ board: 'board_classic', pawn: 'pawn_glossy', dice: 'dice_ruby' });
    expect(sanitizeWardrobe(null)).toEqual(newWardrobe());
  });
});
