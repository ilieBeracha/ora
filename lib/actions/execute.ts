import { assertApprovedPayload } from "@/lib/approval/guard";
import { prisma } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { setProductReferenceMetafield, verifyProductReferenceMetafield } from "@/lib/shopify/client";

type ShopifyProductReferencePayload = {
  provider: "shopify";
  toolName: "shopify_setProductReferenceMetafield";
  args: {
    shopifyConnectionId: string;
    productId: string;
    namespace: string;
    key: string;
    referenceProductIds: string[];
  };
};

type OraOperatorReviewBatchPayload = {
  provider: "ora";
  toolName: "ora_prepare_operator_review_batch";
  args: {
    shopifyConnectionId?: string;
    signalType?: string;
    actionType?: string;
    affectedCount?: number;
    operatorDecision?: string;
    requiredReview?: string[];
    examples?: unknown[];
  };
};

type ActionExecutionPayload =
  | ShopifyProductReferencePayload
  | OraOperatorReviewBatchPayload;

export async function executeApprovedActionPlan(actionPlanId: string) {
  const actionPlan = await prisma.actionPlan.findUniqueOrThrow({
    where: { id: actionPlanId },
    include: {
      approval: true,
      signal: true,
    },
  });

  assertApprovedPayload({
    executionPayload: actionPlan.executionPayload,
    approvalPayloadHash: actionPlan.approval?.approvalPayloadHash,
  });

  const payload = actionPlan.executionPayload as ActionExecutionPayload;

  if (
    payload.provider === "ora" &&
    payload.toolName === "ora_prepare_operator_review_batch"
  ) {
    return executeOraOperatorReviewBatch(actionPlan, payload);
  }

  if (
    payload.provider !== "shopify" ||
    payload.toolName !== "shopify_setProductReferenceMetafield"
  ) {
    throw new Error("This action type is not executable yet.");
  }

  const connection = await prisma.shopifyConnection.findUniqueOrThrow({
    where: { id: payload.args.shopifyConnectionId },
  });

  if (connection.companyId !== actionPlan.signal.companyId) {
    throw new Error("Approved action cannot execute against another company.");
  }

  try {
    const result = await setProductReferenceMetafield({
      shopDomain: connection.shopDomain,
      authMethod: connection.authMethod,
      encryptedAccessToken: connection.encryptedAccessToken,
      apiClientId: connection.apiClientId,
      encryptedApiClientSecret: connection.encryptedApiClientSecret,
      apiVersion: connection.apiVersion,
      productId: payload.args.productId,
      namespace: payload.args.namespace,
      key: payload.args.key,
      referenceProductIds: payload.args.referenceProductIds,
    });

    const verified = await verifyProductReferenceMetafield({
      shopDomain: connection.shopDomain,
      authMethod: connection.authMethod,
      encryptedAccessToken: connection.encryptedAccessToken,
      apiClientId: connection.apiClientId,
      encryptedApiClientSecret: connection.encryptedApiClientSecret,
      apiVersion: connection.apiVersion,
      productId: payload.args.productId,
      namespace: payload.args.namespace,
      key: payload.args.key,
      referenceProductIds: payload.args.referenceProductIds,
    });

    await prisma.execution.create({
      data: {
        actionPlanId: actionPlan.id,
        provider: "shopify",
        toolName: payload.toolName,
        inputPayload: payload,
        outputPayload: { result, verified },
        status: verified ? "success" : "failed",
        errorMessage: verified ? null : "Shopify update could not be verified.",
      },
    });

    await prisma.actionPlan.update({
      where: { id: actionPlan.id },
      data: { status: verified ? "executed" : "failed" },
    });

    await prisma.outcome.create({
      data: {
        signalId: actionPlan.signalId,
        actionPlanId: actionPlan.id,
        status: verified ? "resolved" : "pending",
        metricsJson: {
          verified,
          referenceProductIds: payload.args.referenceProductIds,
        },
        summary: verified
          ? "Shopify confirmed the product reference metafield now contains the approved reference."
          : "The mutation ran, but the follow-up read did not confirm the expected metafield value.",
      },
    });

    await prisma.signal.update({
      where: { id: actionPlan.signalId },
      data: { status: verified ? "resolved" : "monitoring" },
    });

    return { verified };
  } catch (error) {
    await prisma.execution.create({
      data: {
        actionPlanId: actionPlan.id,
        provider: "shopify",
        toolName: payload.toolName,
        inputPayload: payload,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });

    await prisma.actionPlan.update({
      where: { id: actionPlan.id },
      data: { status: "failed" },
    });

    throw error;
  }
}

async function executeOraOperatorReviewBatch(
  actionPlan: {
    id: string;
    signalId: string;
    signal: { companyId: string };
  },
  payload: OraOperatorReviewBatchPayload,
) {
  if (payload.args.shopifyConnectionId) {
    const connection = await prisma.shopifyConnection.findUniqueOrThrow({
      where: { id: payload.args.shopifyConnectionId },
    });

    if (connection.companyId !== actionPlan.signal.companyId) {
      throw new Error("Approved action cannot execute against another company.");
    }
  }

  await prisma.execution.create({
    data: {
      actionPlanId: actionPlan.id,
      provider: "ora",
      toolName: payload.toolName,
      inputPayload: payload as Prisma.InputJsonValue,
      outputPayload: {
        reviewBatchStarted: true,
        affectedCount: payload.args.affectedCount ?? null,
        operatorDecision: payload.args.operatorDecision ?? null,
        requiredReview: payload.args.requiredReview ?? [],
      } as Prisma.InputJsonValue,
      status: "success",
    },
  });

  await prisma.actionPlan.update({
    where: { id: actionPlan.id },
    data: { status: "executed" },
  });

  await prisma.outcome.create({
    data: {
      signalId: actionPlan.signalId,
      actionPlanId: actionPlan.id,
      status: "pending",
      metricsJson: {
        reviewBatchStarted: true,
        affectedCount: payload.args.affectedCount ?? null,
      } as Prisma.InputJsonValue,
      summary:
        "Ora started the approved operator review batch. Outcome is pending until the review is completed and Signals are scanned again.",
    },
  });

  await prisma.signal.update({
    where: { id: actionPlan.signalId },
    data: { status: "monitoring" },
  });

  return { reviewBatchStarted: true };
}
