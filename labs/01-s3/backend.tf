terraform {
  backend "s3" {
    bucket              = "fede-gitops-tfstate-603404126514"
    key                 = "labs/01-s3/terraform.tfstate"
    region              = "us-east-2"
    encrypt             = true
    use_lockfile        = true
    allowed_account_ids = ["603404126514"]
  }
}
