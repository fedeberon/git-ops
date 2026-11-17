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
    }
  }
}

resource "aws_s3_bucket" "lab" {
  bucket_prefix = "fede-terraform-lab-"
}

resource "aws_s3_bucket_public_access_block" "lab" {
  bucket = aws_s3_bucket.lab.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

output "bucket_name" {
  description = "Nombre del bucket creado para el laboratorio."
  value       = aws_s3_bucket.lab.id
}
