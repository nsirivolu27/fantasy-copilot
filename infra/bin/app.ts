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
 *   dbSize        "small" (default, db.t4g.micro) or "medium" (db.t4g.small).
 */
new FantasyCopilotStack(app, "FantasyCopilot", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  domainName: app.node.tryGetContext("domainName"),
  hostedZoneId: app.node.tryGetContext("hostedZoneId"),
  dbSize: app.node.tryGetContext("dbSize") ?? "small",
  description: "Fantasy Copilot: Fargate service, RDS Postgres, ALB.",
});
