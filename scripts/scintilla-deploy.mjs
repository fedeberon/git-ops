import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { validateDeployment } from './gitflow-policy.mjs';

function aws(args) {
  return JSON.parse(execFileSync('aws', [...args, '--output', 'json', '--no-cli-pager'], {
    encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'],
  }));
}

async function main() {
  const { digest, instanceId } = validateDeployment(
    process.env.IMAGE_DIGEST ?? '', process.env.INSTANCE_ID ?? '', process.env.GITHUB_REF ?? '',
  );
  if (process.argv[2] === 'validate') return;
  if (process.argv[2] !== 'deploy') throw new Error('Usar validate o deploy');
  const details = aws(['ecr', 'describe-images', '--repository-name', 'scintilla', '--image-ids', 'imageDigest=' + digest]);
  if (details.imageDetails?.[0]?.imageDigest !== digest) throw new Error('La imagen no existe en el repositorio esperado');
  const data = aws(['ec2', 'describe-instances', '--instance-ids', instanceId]);
  const instance = data.Reservations?.[0]?.Instances?.[0];
  const tags = Object.fromEntries((instance?.Tags ?? []).map((tag) => [tag.Key, tag.Value]));
  if (instance?.State?.Name !== 'running' || tags.Application !== 'scintilla' || tags.Environment !== 'learning') {
    throw new Error('La instancia no está activa o no pertenece a este laboratorio');
  }
  const command = aws(['ssm', 'send-command', '--instance-ids', instanceId,
    '--document-name', 'ScintillaDeploy', '--document-version', '$DEFAULT',
    '--parameters', JSON.stringify({ ImageDigest: [digest] }), '--timeout-seconds', '60',
    '--comment', 'Scintilla manual deployment, run ' + process.env.GITHUB_RUN_ID]);
  const commandId = command.Command?.CommandId;
  if (!commandId) throw new Error('SSM no devolvió un CommandId');
  console.log('Comando SSM:', commandId);
  for (let i = 0; i < 100; i++) {
    let result;
    try {
      result = aws(['ssm', 'get-command-invocation', '--command-id', commandId, '--instance-id', instanceId]);
    } catch (error) {
      if (!String(error.stderr ?? '').includes('InvocationDoesNotExist')) throw error;
      await delay(5000);
      continue;
    }
    if (result.Status === 'Success') {
      const summary = ['## Scintilla desplegada', '', '- Imagen: 603404126514.dkr.ecr.us-east-2.amazonaws.com/scintilla@' + digest,
        '- Instancia: ' + instanceId, '- Comando SSM: ' + commandId,
        '- Health local: comprobado por el script remoto', '', result.StandardOutputContent ?? ''].join('\n');
      console.log(summary);
      if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
      return;
    }
    if (['Failed', 'Cancelled', 'TimedOut', 'Cancelling'].includes(result.Status)) {
      console.error(result.StandardOutputContent ?? '', result.StandardErrorContent ?? '');
      throw new Error('Falló el despliegue SSM: ' + result.Status);
    }
    await delay(5000);
  }
  throw new Error('Se agotó la espera; revisar el CommandId en SSM antes de reintentar. El comando remoto podría seguir activo.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
