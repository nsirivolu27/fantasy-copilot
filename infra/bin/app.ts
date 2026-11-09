#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { FantasyCopilotStack } from "../lib/fantasy-copilot-stack";

const app = new cdk.App();

/**
 * Context values, set with -c on the command line or in cdk.json:
 *
 *   domainName    optional, e.g. copilot.example.com. Without it the ALB's own
 *                 DNS name is used and there is no TLS.
 *   hostedZoneId  required with domainName, so the record and cert can be made.
 *   hostedZoneName optional Route 53 zone name. Set it when the zone is not the
 *                  last two parts of domainName, such as example.co.uk.
 *   dbSize        "small" (default, db.t4g.micro) or "medium" (db.t4g.small).
 *   environment   resource tag, "production" by default.
 */
new FantasyCopilotStack(app, "FantasyCopilot", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  domainName: app.node.tryGetContext("domainName"),
  hostedZoneId: app.node.tryGetContext("hostedZoneId"),
  hostedZoneName: app.node.tryGetContext("hostedZoneName"),
  dbSize: app.node.tryGetContext("dbSize") ?? "small",
  environmentName: app.node.tryGetContext("environment") ?? "production",
  description: "Fantasy Copilot: Fargate service, RDS Postgres, ALB.",
});
