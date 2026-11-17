# Laboratorio AWS y GitOps

Preparación práctica para Cloud Practitioner, Terraform y pipelines; luego Kubernetes y Argo CD.

Repositorio: https://github.com/fedeberon/git-ops

## Pipeline de validación

`.github/workflows/terraform.yml` ejecuta controles al subir cambios a `main`, abrir o actualizar un pull request y mediante ejecución manual desde Actions. Usa Terraform 1.13.5 para comprobar formato, instalar los proveedores fijados en el lockfile y validar la configuración. No necesita credenciales AWS y no ejecuta plan, apply ni destroy.

El laboratorio S3 ya se creó, se modificó mediante etiquetas y se eliminó con `terraform destroy` (2 recursos eliminados). El código se conserva para futuras prácticas.

## Laboratorio 01: S3 con Terraform

El archivo `labs/01-s3/main.tf` declara un bucket con nombre único, bloqueo explícito de acceso público y etiquetas. El proveedor limita la cuenta destino a la cuenta personal del laboratorio.

### Autenticación

Iniciar sesión como `fede-lab`:

```bash
aws login --profile terraform-lab --region us-east-2
aws sts get-caller-identity --profile terraform-lab --region us-east-2
```

Configurar un perfil auxiliar para que Terraform obtenga credenciales temporales a través de AWS CLI (no imprime ni guarda claves en el proyecto):

```bash
aws configure set credential_process 'aws configure export-credentials --profile terraform-lab --format process' --profile terraform-lab-tools
aws configure set region us-east-2 --profile terraform-lab-tools
aws sts get-caller-identity --profile terraform-lab-tools
```

Referencia: https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html#cli-configure-sign-in-process

### Preparar y revisar

Para trabajar localmente, seleccionar el perfil en la terminal antes de ejecutar Terraform:

```bash
export AWS_PROFILE=terraform-lab-tools
```

El provider no fija un perfil: localmente usa `AWS_PROFILE`; GitHub Actions usa las credenciales temporales del rol `github-terraform-plan` mediante OIDC.

```bash
cd labs/01-s3
terraform init
terraform fmt -check
terraform validate
terraform plan
```

`init` descarga el proveedor; `validate` comprueba la configuración y `plan` consulta AWS para mostrar los cambios propuestos. Ninguno crea el bucket. Revisar que el plan proponga 2 recursos nuevos.

### Crear y eliminar (después de revisar el plan)

```bash
terraform apply
terraform destroy
```

Ambos comandos solicitan confirmación. Mantener el bucket vacío durante este ejercicio para poder eliminarlo sin borrar objetos manualmente. El uso de AWS puede consumir créditos según almacenamiento y solicitudes.

El estado de Terraform se guarda localmente y se excluye de Git. Conservarlo hasta ejecutar `destroy`; más adelante configuraremos un backend remoto. El archivo `.terraform.lock.hcl` sí debe guardarse en Git.

## Plan desde GitHub Actions

En `main`, después de validar, el workflow asume el rol `github-terraform-plan`, muestra la identidad de AWS y ejecuta `terraform plan`. En pull requests solo valida. El rol tiene lectura de S3; el workflow no ejecuta `apply`.

El backend S3 está declarado en `labs/01-s3/backend.tf`: guarda el estado en `s3://fede-gitops-tfstate-603404126514/labs/01-s3/terraform.tfstate` y usa bloqueo nativo con `use_lockfile`. El bucket se creó por separado, con versionado y acceso público bloqueado. El rol de GitHub tiene la política adicional `terraform-state-access` para el estado y su bloqueo.

Antes de subir esta configuración por primera vez, migrar el estado desde la Mac:

```bash
export AWS_PROFILE=terraform-lab-tools
cd labs/01-s3
terraform init -migrate-state
terraform state list
terraform plan
```

Revisar el destino y aceptar la copia del estado si Terraform la solicita. El laboratorio ya fue destruido, por lo que se espera una lista vacía y un plan de 2 recursos nuevos. No ejecutar apply en este paso. Si no existe estado local para copiar, init solo configurará el backend.

El pipeline valida sin backend primero y luego, únicamente en main y tras autenticarse, inicializa el backend remoto y ejecuta plan. No borra el bucket del estado al destruir el laboratorio.
