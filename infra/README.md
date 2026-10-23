# AWS infrastructure

CDK stack for running Fantasy Copilot on AWS: a Fargate service behind an
Application Load Balancer, with Postgres in private subnets.

## What it creates

| Resource | Why |
|---|---|
| VPC, 2 AZs, **no NAT gateway** | Tasks run in public subnets with public IPs, so egress goes through the internet gateway for free. A NAT would add about $32/month for nothing this app needs. |
| RDS Postgres 16, `db.t4g.micro` | Isolated subnets, no internet route, storage encrypted, 7-day backups, autoscaling to 100 GB. |
| ECR repository | Holds the image. Keeps the last 10. |
| ECS Fargate, ARM64, 0.5 vCPU / 1 GB | Graviton is cheaper per vCPU. Scales 1 to 4 tasks on CPU. |
| ALB | The only inbound path. TLS when you pass a domain. |
| Secrets Manager, 2 secrets | Database credentials and app secrets. Neither appears in the task definition. |
| CloudWatch Logs | Two-week retention. |

## Rough monthly cost

At the default size, in `us-east-1`, one task running continuously:

| | |
|---|---|
| Fargate, 0.5 vCPU / 1 GB, ARM | ~$13 |
| ALB | ~$17 |
| RDS `db.t4g.micro` + 20 GB | ~$14 |
| Secrets Manager, 2 secrets | ~$1 |
| Data transfer, logs, ECR | ~$2 |
| **Total** | **~$47/month** |

Cheaper options, in order: drop the ALB and expose the task directly (loses
TLS and a stable hostname), run RDS on a Reserved Instance, or use a serverless
Postgres like Neon and delete the RDS and VPC parts of this stack, which takes
the total to roughly $15.

## Deploy

```bash
cd infra
npm install
npx cdk bootstrap                 # once per account and region
npx cdk deploy
```

With a domain, which is what you want for anything shared:

```bash
npx cdk deploy -c domainName=copilot.example.com -c hostedZoneId=Z0123456789ABC
```

The stack creates an empty ECR repository, so the first deployment has no image
to run and the service will sit unhealthy until you push one:

```bash
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REGION=$(aws configure get region)
REPO="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/fantasy-copilot"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"

# ARM64, because the task runs on Graviton.
docker buildx build --platform linux/arm64 -t "$REPO:latest" --push .

aws ecs update-service --cluster <ClusterName> --service <ServiceName> \
  --force-new-deployment
```

`ClusterName` and `ServiceName` are stack outputs.

## After the first deploy

The schema is applied on boot by `docker-entrypoint.sh`, which assembles
`DATABASE_URL` from the RDS secret and runs `prisma db push`. Nothing to do by
hand.

Set an app password before sharing the URL. The stack generates `SYNC_SECRET`
automatically but leaves `APP_PASSWORD` empty, which means the app is open:

```bash
aws secretsmanager put-secret-value --secret-id <AppSecretArn> \
  --secret-string '{"APP_PASSWORD":"something-long","SYNC_SECRET":"<keep the generated one>"}'
aws ecs update-service --cluster <ClusterName> --service <ServiceName> --force-new-deployment
```

## Reaching the database

Postgres is in isolated subnets on purpose, so there is no public endpoint. To
run a query or a migration by hand, use SSM port forwarding through a task
rather than opening a security group:

```bash
aws ecs execute-command --cluster <ClusterName> --task <TaskId> \
  --container app --interactive --command "/bin/sh"
```

That needs `enableExecuteCommand` on the service; it is off by default because
it widens the task role. Turn it on temporarily when you need it.

## Scheduled syncs

Add an EventBridge rule hitting the sync endpoint daily. It is deliberately not
in the stack, because the URL only exists after the ALB does:

```bash
curl -X POST https://your-domain/api/sync \
  -H "Authorization: Bearer $SYNC_SECRET"
```

## Tearing it down

```bash
npx cdk destroy
```

The database has `RemovalPolicy.SNAPSHOT`, so destroying the stack leaves a
final snapshot behind. Delete it manually if you do not want to keep paying for
the storage.
