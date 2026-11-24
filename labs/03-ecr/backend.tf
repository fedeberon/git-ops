# Estado separado: eliminar EC2 no elimina las imágenes publicadas.
terraform {
  backend "s3" {
    bucket              = "fede-gitops-tfstate-603404126514"
    key                 = "labs/03-ecr/terraform.tfstate"
    region              = "us-east-2"
    encrypt             = true
    use_lockfile        = true
    allowed_account_ids = ["603404126514"]
  }
}
