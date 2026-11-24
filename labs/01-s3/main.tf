# Versiones de Terraform y del proveedor necesarias para administrar los recursos.
terraform {
  required_version = ">= 1.13.0, < 2.0.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

# Crea y administra recursos en Ohio, limitando las operaciones a esta cuenta AWS.
provider "aws" {
  region              = "us-east-2"
  allowed_account_ids = ["603404126514"]

  # Etiquetas comunes para identificar el proyecto, entorno y herramienta de gestión.
  default_tags {
    tags = {
      Project     = "git-ops"
      Environment = "learning"
      ManagedBy   = "terraform"
    }
  }
}

# Crea un bucket S3 para almacenar objetos. Terraform completa el prefijo
# con un sufijo para generar un nombre único.
resource "aws_s3_bucket" "lab" {
  bucket_prefix = "fede-terraform-lab-"
}

# Bloquea mecanismos de acceso público al bucket.
# Los accesos privados autorizados por IAM pueden seguir funcionando.
resource "aws_s3_bucket_public_access_block" "lab" {
  bucket = aws_s3_bucket.lab.id

  # Rechaza la asignación de nuevas ACL públicas.
  block_public_acls       = true
  # Rechaza nuevas políticas que otorguen acceso público al bucket.
  block_public_policy     = true
  # Ignora permisos públicos concedidos mediante ACL existentes.
  ignore_public_acls      = true
  # Restringe el acceso si el bucket tiene una política pública.
  restrict_public_buckets = true
}

# Conserva versiones de los objetos para recuperar contenido tras
# sobrescrituras o eliminaciones normales. No impide borrar versiones
# definitivamente si se tienen los permisos necesarios.
resource "aws_s3_bucket_versioning" "lab" {
  bucket = aws_s3_bucket.lab.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Muestra el nombre generado para usarlo al consultar o acceder al bucket.
output "bucket_name" {
  description = "Nombre del bucket creado para el laboratorio."
  value       = aws_s3_bucket.lab.id
}
