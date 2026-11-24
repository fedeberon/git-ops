import test from 'node:test';
import assert from 'node:assert/strict';
import { executionTag } from '../scintilla-image.mjs';

test('usa fecha y número de ejecución sin prefijo build', () => {
  assert.equal(executionTag('2026-11-24T14:00:00Z', '15', '1'), '2026-11-24-15-1');
});

test('identifica reintentos sin sobrescribir la primera publicación', () => {
  assert.equal(executionTag('2026-11-24T14:00:00Z', '15', '2'), '2026-11-24-15-2');
});

test('normaliza la fecha a UTC al cambiar de día', () => {
  assert.equal(executionTag('2026-11-24T23:30:00-03:00', '16', '1'), '2026-11-25-16-1');
});

test('rechaza fechas y contadores inválidos', () => {
  assert.throws(() => executionTag('no-es-fecha', '1', '1'));
  for (const run of ['0', '-1', '01', 'abc']) {
    assert.throws(() => executionTag('2026-11-24T14:00:00Z', run, '1'));
  }
  assert.throws(() => executionTag('2026-11-24T14:00:00Z', '1', '0'));
});
