# Estado independiente del laboratorio S3, en el mismo bucket de backend.
terraform {
  backend "s3" {
    bucket              = "fede-gitops-tfstate-603404126514"
    key                 = "labs/02-ec2-docker/terraform.tfstate"
    region              = "us-east-2"
    encrypt             = true
    use_lockfile        = true
    allowed_account_ids = ["603404126514"]
  }
}
