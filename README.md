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
