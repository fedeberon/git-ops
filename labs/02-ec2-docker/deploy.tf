# EC2 descarga imágenes usando su propio rol; no recibe claves del workflow.
resource "aws_iam_role_policy" "ecr_pull" {
  name = "pull-scintilla-image"
  role = aws_iam_role.lab.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"]
        Resource = "arn:aws:ecr:us-east-2:603404126514:repository/scintilla"
      }
    ]
  })
}

# Documento acotado: permite seleccionar un digest, no enviar shell desde GitHub.
resource "aws_ssm_document" "deploy" {
  name            = "ScintillaDeploy"
  document_type   = "Command"
  document_format = "JSON"
  content = jsonencode({
    schemaVersion = "2.2"
    description   = "Deploy an existing Scintilla image by digest"
    parameters = {
      ImageDigest = {
        type              = "String"
        allowedPattern    = "^sha256:[a-f0-9]{64}$"
        interpolationType = "ENV_VAR"
      }
    }
    mainSteps = [{
      action       = "aws:runShellScript"
      name         = "deployScintilla"
      precondition = { StringEquals = ["platformType", "Linux"] }
      inputs = {
        timeoutSeconds = "300"
        runCommand = [
          "#!/bin/bash",
          "set -euo pipefail",
          "/usr/local/bin/scintilla-deploy \"$SSM_ImageDigest\""
        ]
      }
    }]
  })
}

# Solo main puede asumir el rol de despliegue; el de publicación pertenece a release/rc-N.
resource "aws_iam_role" "deploy" {
  name = "github-scintilla-deploy"
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
          "token.actions.githubusercontent.com:sub" = "repo:fedeberon@14318665/git-ops@1461734010:ref:refs/heads/main"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "deploy" {
  name = "deploy-scintilla-through-ssm"
  role = aws_iam_role.deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:DescribeImages"]
        Resource = "arn:aws:ecr:us-east-2:603404126514:repository/scintilla"
      },
      {
        Effect    = "Allow"
        Action    = ["ec2:DescribeInstances", "ssm:GetCommandInvocation"]
        Resource  = "*"
        Condition = { StringEquals = { "aws:RequestedRegion" = "us-east-2" } }
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:SendCommand"]
        Resource = aws_ssm_document.deploy.arn
      },
      {
        Effect   = "Allow"
        Action   = ["ssm:SendCommand"]
        Resource = aws_instance.lab.arn
      }
    ]
  })
}

output "deploy_role_arn" {
  value = aws_iam_role.deploy.arn
}
