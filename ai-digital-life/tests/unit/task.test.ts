import { describe, expect, it } from "vitest";
import { createApprovalRequest, assessRiskLevel, shouldRequireApproval } from "@ai-digital-life/task";

describe("task governance helpers", () => {
  it("calculates the highest risk level from operations", () => {
    expect(
      assessRiskLevel([
        {
          kind: "file.write",
          params: {},
          riskLevel: "medium",
          reversible: true
        },
        {
          kind: "git.force",
          params: {},
          riskLevel: "high",
          reversible: false
        }
      ])
    ).toBe("high");
  });

  it("flags high-risk operations for approval", () => {
    expect(
      shouldRequireApproval([
        {
          kind: "git.force",
          params: {},
          riskLevel: "high",
          reversible: false
        }
      ])
    ).toBe(true);
  });

  it("builds approval requests with derived metadata", () => {
    const request = createApprovalRequest({
      taskId: "task-1",
      title: "dangerous.action",
      description: "Review this destructive write.",
      impact: ["May overwrite project files."],
      operations: [
        {
          kind: "file.overwrite",
          params: {},
          riskLevel: "high",
          reversible: false
        }
      ],
      createdAt: 123
    });

    expect(request.taskId).toBe("task-1");
    expect(request.riskLevel).toBe("high");
    expect(request.reversible).toBe(false);
    expect(request.createdAt).toBe(123);
  });
});
