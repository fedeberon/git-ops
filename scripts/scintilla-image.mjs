import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appDirectory = fileURLToPath(new URL('../apps/scintilla/', import.meta.url));

// Fecha UTC + ejecución de GitHub Actions + intento, siempre presentes.
export function executionTag(timestamp, run, attempt) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new Error('Fecha inválida');
  if (!/^[1-9][0-9]*$/.test(run) || !/^[1-9][0-9]*$/.test(attempt)) {
    throw new Error('Ejecución o intento inválido');
  }
  return date.toISOString().slice(0, 10) + '-' + run + '-' + attempt;
}

function execute(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', ...options });
}

function imageDigest(repository, tag) {
  try {
    const response = JSON.parse(execute('aws', [
      'ecr', 'describe-images', '--repository-name', repository,
      '--image-ids', 'imageTag=' + tag, '--output', 'json', '--no-cli-pager',
    ], { stdio: ['ignore', 'pipe', 'pipe'] }));
    const digest = response.imageDetails?.[0]?.imageDigest;
    if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? '')) throw new Error('Digest de ECR inválido');
    return digest;
  } catch (error) {
    if (String(error.stderr ?? '').includes('ImageNotFoundException')) return null;
    throw error;
  }
}

function publish() {
  const registry = process.env.REGISTRY;
  const repository = process.env.ECR_REPOSITORY;
  const commit = process.env.GITHUB_SHA ?? '';
  if (!registry || !/^[0-9]{12}[.]dkr[.]ecr[.][a-z0-9-]+[.]amazonaws[.]com$/.test(registry)) {
    throw new Error('REGISTRY inválido');
  }
  if (!repository || !/^[a-z0-9][a-z0-9._/-]*$/.test(repository)) throw new Error('ECR_REPOSITORY inválido');
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('SHA de commit inválido');
  const created = new Date();
  const tag = executionTag(created.toISOString(), process.env.GITHUB_RUN_NUMBER ?? '', process.env.GITHUB_RUN_ATTEMPT ?? '');
  const image = registry + '/' + repository;
  let digest = imageDigest(repository, tag);
  if (!digest) {
    // Publica solo la imagen ejecutable, sin attestations de procedencia o SBOM.
    execute('docker', ['build', '--platform', 'linux/amd64', '--provenance=false', '--sbom=false',
      '--label', 'org.opencontainers.image.version=' + tag,
      '--label', 'org.opencontainers.image.revision=' + commit,
      '--label', 'org.opencontainers.image.created=' + created.toISOString(),
      '--label', 'org.opencontainers.image.source=https://github.com/' + process.env.GITHUB_REPOSITORY,
      '--tag', image + ':' + tag, '.'], { cwd: appDirectory, stdio: 'inherit' });
    execute('docker', ['push', image + ':' + tag], { stdio: 'inherit' });
    digest = imageDigest(repository, tag);
  }
  if (!digest) throw new Error('No se encontró la imagen publicada');
  const lines = ['## Imagen publicada', '', '- Versión: ' + tag,
    '- Imagen: ' + image + ':' + tag, '- Commit: ' + commit,
    '- Referencia exacta para desplegar: ' + image + '@' + digest];
  console.log(lines.join(String.fromCharCode(10)));
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join(String.fromCharCode(10)) + String.fromCharCode(10));
  }
}

// Importar este archivo en las pruebas no ejecuta comandos AWS/Docker.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] !== 'publish') throw new Error('Usar publish');
  publish();
}
