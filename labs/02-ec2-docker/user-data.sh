#!/bin/bash
# Prepara el host; la selección y ejecución de imagen se hace después por SSM.
set -euo pipefail
dnf install -y docker
systemctl enable --now docker
systemctl enable --now amazon-ssm-agent
# Terraform inserta el script revisado en base64, sin depender de GitHub durante el arranque.
printf '%s' '__SCINTILLA_DEPLOY_SCRIPT__' | base64 --decode > /usr/local/bin/scintilla-deploy
chmod 750 /usr/local/bin/scintilla-deploy
