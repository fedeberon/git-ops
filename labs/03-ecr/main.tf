terraform {
  required_version = ">= 1.13.0, < 2.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region              = "us-east-2"
  allowed_account_ids = ["603404126514"]
  default_tags {
    tags = {
      Project     = "git-ops"
      Environment = "learning"
      ManagedBy   = "terraform"
      Lab         = "03-ecr"
    }
  }
}

# Registro privado para imágenes con etiquetas de fecha-ejecución-intento inmutables.
# force_delete=false evita borrar accidentalmente un repositorio con imágenes.
resource "aws_ecr_repository" "scintilla" {
  name                 = "scintilla"
  image_tag_mutability = "IMMUTABLE"
  force_delete         = false
  encryption_configuration {
    encryption_type = "AES256"
  }
}

# Se eliminan solo imágenes sin tag, sin decidir cuándo borrar versiones desplegadas.
resource "aws_ecr_lifecycle_policy" "scintilla" {
  repository = aws_ecr_repository.scintilla.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Expire untagged images after 14 days"
      selection = {
        tagStatus   = "untagged"
        countType   = "sinceImagePushed"
        countUnit   = "days"
        countNumber = 14
      }
      action = { type = "expire" }
    }]
  })
}

# Reutiliza el proveedor OIDC existente; no crea otro ni guarda claves AWS.
# El sub usa los IDs inmutables ya observados en este repositorio.
resource "aws_iam_role" "publish" {
  name = "github-scintilla-publish"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = "arn:aws:iam::603404126514:oidc-provider/token.actions.githubusercontent.com"
      }
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
        }
        StringLike = {
          "token.actions.githubusercontent.com:sub" = "repo:fedeberon@14318665/git-ops@1461734010:ref:refs/heads/release/rc-*"
        }
      }
    }]
  })
}

# Permisos de publicación, sin permisos de desplegar ni administrar infraestructura.
resource "aws_iam_role_policy" "publish" {
  name = "publish-scintilla-image"
  role = aws_iam_role.publish.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:PutImage",
          "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:DescribeImages"
        ]
        Resource = aws_ecr_repository.scintilla.arn
      }
    ]
  })
}

output "repository_url" {
  value       = aws_ecr_repository.scintilla.repository_url
  description = "Registro/repositorio, sin el tag de la imagen."
}

output "publish_role_arn" {
  value = aws_iam_role.publish.arn
}
