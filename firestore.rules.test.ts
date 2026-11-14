import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const blueprint = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, "firebase-blueprint.json"), "utf8"),
) as {
  entities: Record<string, { properties: Record<string, { maxLength?: number; pattern?: string }> }>;
  firestore: Record<string, unknown>;
};

const rulesSource = readFileSync(path.resolve(import.meta.dirname, "firestore.rules"), "utf8");

describe("firestore.rules Dirty Dozen & structural invariants", () => {
  it("contains default-deny catch-all rule and rules_version = '2'", () => {
    expect(rulesSource).toContain("rules_version = '2';");
    expect(rulesSource).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
  });

  it("secures every collection defined in firebase-blueprint.json", () => {
    const expectedMatches = [
      "match /users/{userId}",
      "match /private/info",
      "match /attempts/{attemptId}",
      "match /admins/{userId}",
      "match /subjects/{subjectId}",
      "match /topics/{topicId}",
      "match /examFiles/{examFileId}",
      "match /questions/{questionId}",
      "match /questionAnswers/{questionId}",
      "match /answerKeyFiles/{fileId}",
      "match /entries/{entryId}",
    ];
    for (const block of expectedMatches) {
      expect(rulesSource).toContain(block);
    }
    expect(Object.keys(blueprint.firestore)).toHaveLength(11);
  });

  it("blocks Dirty Dozen attack vectors via explicit boolean gates", () => {
    // 1. Self-assigned admin escalation blocked on user create
    expect(rulesSource).toContain("incoming().role == 'user'");
    // 2. Shadow / ghost field injection blocked via hasAll + hasOnly
    expect(rulesSource).toContain("data.keys().hasAll(");
    expect(rulesSource).toContain("data.keys().hasOnly(");
    // 3. Cross-user PII snooping isolated to owner/admin on /private/info
    expect(rulesSource).toContain("match /private/info");
    expect(rulesSource).toContain("allow list: if false;");
    // 4. Email spoofing blocked by mandatory email_verified == true
    expect(rulesSource).toContain("request.auth.token.email_verified == true");
    // 5. Answer key secrets strictly admin-only
    expect(rulesSource).toContain("match /questionAnswers/{questionId}");
    expect(rulesSource).toContain("match /answerKeyFiles/{fileId}");
    // 6 & 7. Subcollection master gates require parent exists()
    expect(rulesSource).toContain("exists(/databases/$(database)/documents/users/$(userId))");
    expect(rulesSource).toContain("exists(/databases/$(database)/documents/answerKeyFiles/$(fileId))");
    // 8. Terminal state locking on study attempts & answer key entries
    expect(rulesSource).toContain("data.status == 'submitted'");
    expect(rulesSource).toContain("existing().status in ['needs_review', 'unmatched', 'ambiguous', 'conflict']");
    // 9. Temporal integrity via request.time and immutable createdAt
    expect(rulesSource).toContain("incoming().createdAt == request.time");
    expect(rulesSource).toContain("incoming().createdAt == existing().createdAt");
    // 10. Path ID poisoning guard
    expect(rulesSource).toContain("id.matches('^[a-zA-Z0-9_\\\\-]+$')");
    // 11. Blueprint maxLength bounds enforced inside rules
    expect(rulesSource).toContain("isValidString(data.displayName, 1, 120)");
    expect(rulesSource).toContain("isValidString(data.originalText, 1, 12000)");
    // 12. No blanket list rules: public reads verify resource.data.visibility == 'public'
    expect(rulesSource).toContain("allow list: if resource.data.visibility == 'public' || isAdmin();");
  });
});
