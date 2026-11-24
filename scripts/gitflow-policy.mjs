// Reglas del proyecto, independientes del transporte y de AWS.
export function isReleaseCandidate(ref) {
  return /^refs\/heads\/release\/rc-[1-9][0-9]*$/.test(ref);
}

export function validateDeployment(digest, instanceId, ref) {
  if (ref !== 'refs/heads/main') throw new Error('El despliegue manual solo puede ejecutarse desde main');
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw new Error('Se requiere un digest sha256 completo');
  if (!/^i-[a-f0-9]{17}$/.test(instanceId)) throw new Error('ID de instancia inválido');
  return { digest, instanceId };
}
