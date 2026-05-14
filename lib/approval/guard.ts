import { hashApprovalPayload } from "@/lib/approval/hash";

export function assertApprovedPayload({
  executionPayload,
  approvalPayloadHash,
}: {
  executionPayload: unknown;
  approvalPayloadHash?: string | null;
}) {
  if (!approvalPayloadHash) {
    throw new Error("This action has not been approved.");
  }

  const currentHash = hashApprovalPayload(executionPayload);

  if (currentHash !== approvalPayloadHash) {
    throw new Error("The approved payload no longer matches this action plan.");
  }

  return currentHash;
}

