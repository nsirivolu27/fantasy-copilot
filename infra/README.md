# AWS infrastructure

This CDK stack runs Fantasy Copilot as an ARM64 Fargate service behind an
Application Load Balancer, with Postgres in isolated subnets. CDK builds the
Docker image, publishes it to its bootstrap ECR repository by content hash,
and updates the ECS task definition in the same deployment.

## What it creates

| Resource | Purpose |
|---|---|
| VPC across 2 AZs, no NAT gateway | The ALB and tasks use public subnets. Task security groups allow inbound traffic only from the ALB. |
| RDS Postgres 16 | Encrypted storage in isolated subnets, 7-day backups, and storage autoscaling to 100 GB. Only the app security group can connect. |
| ECS Fargate on ARM64 | 0.5 vCPU and 1 GB by default, scaling from 1 to 4 tasks on CPU. |
| Application Load Balancer | HTTP for a test deployment, or HTTPS with ACM and Route 53 when a domain is supplied. |
| Secrets Manager | Separate database credentials and application secrets. |
| CloudWatch Logs | Application logs retained for two weeks. |
| CDK bootstrap ECR and S3 | Content-addressed deployment assets managed by CDK. |

The default is intended for a small persistent deployment. In `us-east-1`,
budget roughly $45–$55 per month before meaningful traffic. Check the AWS
Pricing Calculator for the selected region before creating the stack.

## Prerequisites

- An AWS account and AWS CLI credentials for the first deployment
- Node.js 22 and Docker Desktop with Linux containers enabled
- AWS CDK bootstrapped once in the target account and region
- A Route 53 public hosted zone when using the HTTPS option

From the repository root:

```powershell
cd infra
npm ci
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1
npm run build
npx cdk diff
npx cdk deploy FantasyCopilot
```

The first deploy includes the application image. There is no separate ECR
push and no mutable `latest` tag to prepare.

For a domain:

```powershell
npx cdk deploy FantasyCopilot `
  -c domainName=copilot.example.com `
  -c hostedZoneId=Z0123456789ABC `
  -c hostedZoneName=example.com
```

`hostedZoneName` is optional for ordinary domains and recommended when the
hosted zone cannot be inferred from the last two parts of the application
domain.

## Application access after deployment

The `Url` stack output is the application address. Before sharing it, enable
the built-in account layer or set the application password in the secret shown
by the `AppSecretArn` output. Preserve the generated `SYNC_SECRET` when
writing the secret, then deploy again so ECS starts a new task with the value.

For accounts:

1. Add `REQUIRE_AUTH=1` to the container environment in the stack.
2. Deploy the stack.
3. Open the URL and let the first account claim ownership.
4. Keep signups closed, or explicitly configure an invite code.

For the simpler shared-password mode:

```powershell
aws secretsmanager get-secret-value --secret-id APP_SECRET_ARN --query SecretString --output text
aws secretsmanager put-secret-value --secret-id APP_SECRET_ARN --secret-string '{"APP_PASSWORD":"use-a-long-random-value","SYNC_SECRET":"preserve-the-existing-value"}'
cd infra
npx cdk deploy FantasyCopilot
```

The container assembles `DATABASE_URL` from the database secret and applies
the current Prisma schema when it starts. Before storing production data that
must survive schema changes, replace `prisma db push` with committed
migrations and run migrations as a one-off deployment step.

## GitHub Actions deployment

The manual `Deploy to AWS` workflow runs the same CDK deployment. Configure:

| GitHub setting | Value |
|---|---|
| Secret `AWS_DEPLOY_ROLE_ARN` | IAM role assumed through GitHub's OIDC provider |
| Variable `AWS_REGION` | Target region, such as `us-east-1` |
| Variable `AWS_DOMAIN_NAME` | Optional application domain |
| Variable `AWS_HOSTED_ZONE_ID` | Required with the domain |
| Variable `AWS_HOSTED_ZONE_NAME` | Optional hosted zone name |

Create the GitHub OIDC provider and scope the role trust policy to this exact
repository and the `production` GitHub environment. Grant the role permission
to use the CDK bootstrap deployment roles. Do not store AWS access keys in
GitHub. Add required reviewers to the GitHub `production` environment if the
repository plan supports them.

## Operations

- Health check: `GET /api/health`
- Logs: the `fantasy-copilot` CloudWatch log stream
- Application updates: run `npx cdk deploy` or dispatch the GitHub workflow
- Database backups: seven daily RDS backups plus a final snapshot on stack deletion
- League refresh: call `POST /api/sync` with `Authorization: Bearer SYNC_SECRET`

The current deployment is suited to one operator or trusted league. Hosting
unrelated customers in one stack requires league-scoped authorization and data
access throughout the application; see [MULTI-TENANCY.md](../MULTI-TENANCY.md).

Destroy the stack with `npx cdk destroy FantasyCopilot`. RDS keeps a final
snapshot, which continues to incur storage cost until deleted.
