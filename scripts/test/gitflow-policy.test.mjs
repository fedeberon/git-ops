import test from 'node:test';
import assert from 'node:assert/strict';
import { isReleaseCandidate, validateDeployment } from '../gitflow-policy.mjs';

test('solo release/rc-N publica imágenes', () => {
  assert.equal(isReleaseCandidate('refs/heads/release/rc-1'), true);
  assert.equal(isReleaseCandidate('refs/heads/release/rc-20'), true);
  for (const ref of ['refs/heads/develop', 'refs/heads/main', 'refs/heads/release', 'refs/heads/release/rc-0', 'refs/heads/release/rc-test', 'refs/pull/1/merge']) {
    assert.equal(isReleaseCandidate(ref), false);
  }
});

test('el despliegue exige main, digest completo e instancia válida', () => {
  const digest = 'sha256:' + 'a'.repeat(64);
  const id = 'i-0dbf3a84e959ed14a';
  assert.deepEqual(validateDeployment(digest, id, 'refs/heads/main'), { digest, instanceId: id });
  assert.throws(() => validateDeployment(digest, id, 'refs/heads/develop'));
  assert.throws(() => validateDeployment('latest', id, 'refs/heads/main'));
  assert.throws(() => validateDeployment(digest, 'i-invalid;whoami', 'refs/heads/main'));
});
