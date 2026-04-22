# GitHub Actions Workflows

## Release Workflow (`release.yml`)

Builds and pushes Docker images to Docker Hub on version tags. Creates GitHub Release with image archives.

## ECR Workflow (`ecr.yml`)

Builds and pushes Docker images to AWS ECR on version tags. No GitHub Release created.

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `AWS_OIDC_ROLE_ARN` | ARN of IAM role with ECR push permissions |

### Required GitHub Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `AWS_REGION` | `us-east-1` | AWS region for ECR |
| `ECR_REPOSITORY` | `docmost` | ECR repository name |

### IAM Role Trust Policy

The OIDC role must have a trust policy allowing GitHub Actions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/docmost"
        }
      }
    }
  ]
}
```

### ECR Permissions

The IAM role needs: `ecr:GetAuthorizationToken`, `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload`, `ecr:PutImage`.
