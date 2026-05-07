// ═══════════════════════════════════════════════════════════════════
// tests/pin-hash.test.js
// ═══════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { PIN_SALT, hashPin, esPinHash } from './_helpers.js';

// Vector conocido: SHA-256 de PIN_SALT + '1234' + PIN_SALT precomputado
// con `node -e "require('crypto').createHash('sha256').update('toc-tpv-pin-v1'+'1234'+'toc-tpv-pin-v1').digest('hex')"`
const HASH_1234 = 'c98d12a101b0f15daa9d3f44bdd5c74afb7f8403506e6838838219983730e1d5';

describe('PIN_SALT', () => {
  it('coincide con el salt esperado', () => {
    expect(PIN_SALT).toBe('toc-tpv-pin-v1');
  });
});

describe('hashPin', () => {
  it('devuelve el hash conocido para "1234"', async () => {
    expect(await hashPin('1234')).toBe(HASH_1234);
  });

  it('es idempotente: dos llamadas con el mismo input dan el mismo hash', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('1234');
    expect(a).toBe(b);
  });

  it('PINs distintos producen hashes distintos', async () => {
    const a = await hashPin('1234');
    const b = await hashPin('5678');
    expect(a).not.toBe(b);
  });

  it('devuelve hex de 64 chars', async () => {
    const h = await hashPin('9999');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('lanza Error si pin es number', async () => {
    await expect(hashPin(1234)).rejects.toThrow(/string/);
  });

  it('lanza Error si pin es null', async () => {
    await expect(hashPin(null)).rejects.toThrow(/string/);
  });

  it('lanza Error si pin es undefined', async () => {
    await expect(hashPin(undefined)).rejects.toThrow(/string/);
  });
});

describe('esPinHash', () => {
  it('true para un hash hex válido de 64 chars', () => {
    expect(esPinHash(HASH_1234)).toBe(true);
  });

  it('false para un PIN plano de 4 dígitos', () => {
    expect(esPinHash('1234')).toBe(false);
  });

  it('false para string vacío', () => {
    expect(esPinHash('')).toBe(false);
  });

  it('false para null y undefined', () => {
    expect(esPinHash(null)).toBe(false);
    expect(esPinHash(undefined)).toBe(false);
  });

  it('false para 63 chars (uno menos)', () => {
    expect(esPinHash(HASH_1234.slice(0, 63))).toBe(false);
  });

  it('false para 65 chars (uno más)', () => {
    expect(esPinHash(HASH_1234 + 'a')).toBe(false);
  });

  it('false para hash con caracteres no hex', () => {
    const conLetraInvalida = 'g' + HASH_1234.slice(1);
    expect(esPinHash(conLetraInvalida)).toBe(false);
  });

  it('false para mayúsculas (regex es case-sensitive)', () => {
    expect(esPinHash(HASH_1234.toUpperCase())).toBe(false);
  });

  it('false para number aunque tenga forma hex', () => {
    expect(esPinHash(1234567890)).toBe(false);
  });
});
