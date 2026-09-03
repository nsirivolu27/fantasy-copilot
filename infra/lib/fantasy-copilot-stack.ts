import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import type { Construct } from "constructs";

export interface FantasyCopilotStackProps extends cdk.StackProps {
  domainName?: string;
  hostedZoneId?: string;
  dbSize?: string;
}

/**
 * Fargate service behind an ALB, with Postgres in private subnets.
 *
 * The notable cost decision: there is NO NAT gateway. Tasks run in public
 * subnets with public IPs, which gives them internet egress through the
 * internet gateway for free. A NAT gateway would add roughly $32 a month for
 * nothing this app needs, since the only inbound path is the load balancer and
 * the security group is what actually restricts access.
 *
 * The database stays in isolated subnets with no route to the internet, and
 * only the service's security group can reach it.
 */
export class FantasyCopilotStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FantasyCopilotStackProps) {
    super(scope, id, props);

    // ---- Network -----------------------------------------------------------

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "data", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // ---- Database ----------------------------------------------------------

    const dbCredentials = new secrets.Secret(this, "DbCredentials", {
      description: "Fantasy Copilot Postgres credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "copilot" }),
        generateStringKey: "password",
        excludePunctuation: true, // keeps the connection string simple to build
        passwordLength: 32,
      },
    });

    const dbSecurityGroup = new ec2.SecurityGroup(this, "DbSecurityGroup", {
      vpc,
      description: "Postgres, reachable only from the app service",
      allowAllOutbound: false,
    });

    const instanceClass =
      props.dbSize === "medium"
        ? ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.SMALL)
        : ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MICRO);

    const database = new rds.DatabaseInstance(this, "Database", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16,
      }),
      instanceType: instanceClass,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSecurityGroup],
      credentials: rds.Credentials.fromSecret(dbCredentials),
      databaseName: "fantasy_copilot",
      allocatedStorage: 20,
      maxAllocatedStorage: 100, // storage autoscaling, so a busy season doesn't wedge
      multiAz: false,
      backupRetention: cdk.Duration.days(7),
      deletionProtection: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      storageEncrypted: true,
      enablePerformanceInsights: false, // not free on t4g.micro
    });

    // ---- Application secrets ----------------------------------------------

    const appSecrets = new secrets.Secret(this, "AppSecrets", {
      description:
        "Fantasy Copilot app secrets. Set APP_PASSWORD and SYNC_SECRET here after deploy.",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ APP_PASSWORD: "" }),
        generateStringKey: "SYNC_SECRET",
        excludePunctuation: true,
        passwordLength: 48,
      },
    });

    // ---- Container image ---------------------------------------------------

    const repository = new ecr.Repository(this, "Repository", {
      repositoryName: "fantasy-copilot",
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true,
      lifecycleRules: [
        { description: "Keep the last 10 images", maxImageCount: 10 },
      ],
    });

    // ---- Service -----------------------------------------------------------

    const cluster = new ecs.Cluster(this, "Cluster", { vpc, containerInsights: false });

    const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDefinition", {
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        // Graviton: cheaper per vCPU, and the image is built multi-arch.
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    const container = taskDefinition.addContainer("app", {
      image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "fantasy-copilot",
        logRetention: logs.RetentionDays.TWO_WEEKS,
      }),
      environment: {
        NODE_ENV: "production",
        PORT: "3000",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      secrets: {
        // Assembled by the entrypoint from the RDS secret's parts.
        DB_HOST: ecs.Secret.fromSecretsManager(dbCredentials, "host"),
        DB_PORT: ecs.Secret.fromSecretsManager(dbCredentials, "port"),
        DB_USER: ecs.Secret.fromSecretsManager(dbCredentials, "username"),
        DB_PASSWORD: ecs.Secret.fromSecretsManager(dbCredentials, "password"),
        DB_NAME: ecs.Secret.fromSecretsManager(dbCredentials, "dbname"),
        APP_PASSWORD: ecs.Secret.fromSecretsManager(appSecrets, "APP_PASSWORD"),
        SYNC_SECRET: ecs.Secret.fromSecretsManager(appSecrets, "SYNC_SECRET"),
      },
      healthCheck: {
        command: ["CMD-SHELL", "wget -qO- http://127.0.0.1:3000/api/health || exit 1"],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    container.addPortMappings({ containerPort: 3000, protocol: ecs.Protocol.TCP });

    const serviceSecurityGroup = new ec2.SecurityGroup(this, "ServiceSecurityGroup", {
      vpc,
      description: "Fantasy Copilot service",
      allowAllOutbound: true, // Sleeper and nflverse are both outbound HTTPS
    });

    // Only this service can reach Postgres.
    dbSecurityGroup.addIngressRule(
      serviceSecurityGroup,
      ec2.Port.tcp(5432),
      "App service to Postgres",
    );

    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition,
      desiredCount: 1,
      securityGroups: [serviceSecurityGroup],
      // Public subnets plus a public IP is what replaces a NAT gateway.
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      assignPublicIp: true,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      healthCheckGracePeriod: cdk.Duration.seconds(90),
    });

    // Scale on CPU. One task handles a few leagues comfortably; this exists so
    // a burst of Sunday-morning traffic doesn't queue behind projection runs.
    const scaling = service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 4 });
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 65,
      scaleInCooldown: cdk.Duration.minutes(5),
      scaleOutCooldown: cdk.Duration.minutes(1),
    });

    // ---- Load balancer -----------------------------------------------------

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, "LoadBalancer", {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, "TargetGroup", {
      vpc,
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targets: [service],
      deregistrationDelay: cdk.Duration.seconds(15),
      healthCheck: {
        path: "/api/health",
        healthyHttpCodes: "200",
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // With a domain: TLS on 443 and a redirect from 80. Without: plain HTTP,
    // which is fine for a private test but not for anything shared.
    if (props.domainName && props.hostedZoneId) {
      const zone = route53.HostedZone.fromHostedZoneAttributes(this, "Zone", {
        hostedZoneId: props.hostedZoneId,
        zoneName: props.domainName.split(".").slice(-2).join("."),
      });

      const certificate = new acm.Certificate(this, "Certificate", {
        domainName: props.domainName,
        validation: acm.CertificateValidation.fromDns(zone),
      });

      loadBalancer.addListener("Https", {
        port: 443,
        certificates: [certificate],
        defaultTargetGroups: [targetGroup],
      });

      loadBalancer.addListener("HttpRedirect", {
        port: 80,
        defaultAction: elbv2.ListenerAction.redirect({
          protocol: "HTTPS",
          port: "443",
          permanent: true,
        }),
      });

      new route53.ARecord(this, "AliasRecord", {
        zone,
        recordName: props.domainName,
        target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)),
      });

      new cdk.CfnOutput(this, "Url", { value: `https://${props.domainName}` });
    } else {
      loadBalancer.addListener("Http", {
        port: 80,
        defaultTargetGroups: [targetGroup],
      });
      new cdk.CfnOutput(this, "Url", {
        value: `http://${loadBalancer.loadBalancerDnsName}`,
        description: "No domain given, so this is plain HTTP. Do not share it.",
      });
    }

    // ---- Outputs -----------------------------------------------------------

    new cdk.CfnOutput(this, "EcrRepositoryUri", { value: repository.repositoryUri });
    new cdk.CfnOutput(this, "DbSecretArn", { value: dbCredentials.secretArn });
    new cdk.CfnOutput(this, "AppSecretArn", {
      value: appSecrets.secretArn,
      description: "Set APP_PASSWORD here, then force a new deployment.",
    });
    new cdk.CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new cdk.CfnOutput(this, "ServiceName", { value: service.serviceName });
    new cdk.CfnOutput(this, "DbEndpoint", { value: database.dbInstanceEndpointAddress });
  }
}
