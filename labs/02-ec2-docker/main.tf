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
      Lab         = "02-ec2-docker"
    }
  }
}

# La subred pertenece a us-east-2a dentro de nuestra VPC existente.
locals {
  vpc_id    = "vpc-0e69037adc31fc692"
  subnet_id = "subnet-0d276aa8a0fe9747c"
  bucket    = "fede-terraform-lab-9327962338cdf2456b778fb1d4"
}

# Consulta la AMI oficial de Amazon Linux 2023; no crea una imagen.
data "aws_ssm_parameter" "ami" {
  name = "/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-x86_64"
}

# Confianza: el servicio EC2 puede asumir este rol sin claves permanentes.
resource "aws_iam_role" "lab" {
  name = "gitops-ec2-docker-lab"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# Permite al agente SSM administrar la instancia mediante Systems Manager.
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.lab.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Mínimo privilegio: listar este bucket y leer sus objetos; sin escritura.
resource "aws_iam_role_policy" "s3" {
  name = "read-lab-bucket"
  role = aws_iam_role.lab.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${local.bucket}"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${local.bucket}/*"
      }
    ]
  })
}

# Asocia el rol a EC2 mediante un instance profile.
resource "aws_iam_instance_profile" "lab" {
  name = "gitops-ec2-docker-lab"
  role = aws_iam_role.lab.name
}

# Sin entrada pública, ni SSH ni HTTP. SSM usa conexiones de salida.
resource "aws_security_group" "lab" {
  name_prefix = "gitops-ec2-docker-"
  description = "Docker lab managed through SSM; no inbound access"
  vpc_id      = local.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# VM administrada por nosotros: SO, parches y Docker son nuestra responsabilidad.
# La IP pública permite salida sin NAT Gateway si la subred tiene ruta al IGW.
# EC2, EBS e IPv4 pública pueden generar cargos.
resource "aws_instance" "lab" {
  ami                         = nonsensitive(data.aws_ssm_parameter.ami.value)
  instance_type               = "t3.micro"
  subnet_id                   = local.subnet_id
  associate_public_ip_address = true
  vpc_security_group_ids      = [aws_security_group.lab.id]
  iam_instance_profile        = aws_iam_instance_profile.lab.name
  user_data = replace(
    file("${path.module}/user-data.sh"),
    "__SCINTILLA_DEPLOY_SCRIPT__",
    base64encode(file("${path.module}/deploy-container.sh"))
  )
  user_data_replace_on_change = true

  # Exige IMDSv2 para consultar metadatos y credenciales temporales del rol.
  metadata_options {
    http_endpoint = "enabled"
    http_tokens   = "required"
  }

  # Disco persistente entre stop/start; se borra al terminar esta instancia.
  root_block_device {
    volume_type           = "gp3"
    volume_size           = 8
    encrypted             = true
    delete_on_termination = true
  }

  tags = {
    Name        = "gitops-ec2-docker-lab"
    Application = "scintilla"
  }
  depends_on = [aws_iam_role_policy_attachment.ssm, aws_iam_role_policy.s3, aws_iam_role_policy.ecr_pull]
}

output "instance_id" {
  description = "ID para localizar EC2 y abrir Session Manager."
  value       = aws_instance.lab.id
}
