import { describe, expect, it } from "bun:test";

import { WORKFLOW_PHASES } from "../../core/constants.js";
import type { WorkflowPhase } from "../../core/types.js";
import {
	VERIFICATION_RESULT_STATUSES,
	VERIFICATION_RESULT_TO_DB_STATUS,
	VERIFICATION_STATUSES,
	type VerifiedRowLike,
	isVerifierDispatchAllowed,
	isWaveVerified,
	toDbVerificationStatus,
} from "./verifier-stage.js";

// ---------------------------------------------------------------------------
// isVerifierDispatchAllowed
// ---------------------------------------------------------------------------

describe("isVerifierDispatchAllowed", () => {
	for (const phase of WORKFLOW_PHASES) {
		it(`allows "verifier" only in accept (phase: ${phase})`, () => {
			const result = isVerifierDispatchAllowed({ role: "verifier", phase });
			if (phase === "accept") {
				expect(result.allowed).toBe(true);
				expect(result.reason).toBeUndefined();
			} else {
				expect(result.allowed).toBe(false);
				expect(result.reason).toContain("acceptance-only");
				expect(result.reason).toContain(phase);
			}
		});

		it(`allows "wave-verifier" only in execute (phase: ${phase})`, () => {
			const result = isVerifierDispatchAllowed({
				role: "wave-verifier",
				phase,
			});
			if (phase === "execute") {
				expect(result.allowed).toBe(true);
				expect(result.reason).toBeUndefined();
			} else {
				expect(result.allowed).toBe(false);
				expect(result.reason).toContain("execute-only");
				expect(result.reason).toContain(phase);
			}
		});
	}

	const otherRoles = [
		"orchestrator",
		"executor-low",
		"executor-medium",
		"executor-high",
		"executor-frontend-low",
		"executor-frontend-medium",
		"executor-frontend-high",
		"planner",
		"researcher",
		"explorer",
		"debugger",
		"tester",
		"writer",
	];

	for (const role of otherRoles) {
		for (const phase of WORKFLOW_PHASES) {
			it(`allows "${role}" in every phase (phase: ${phase})`, () => {
				expect(isVerifierDispatchAllowed({ role, phase }).allowed).toBe(true);
			});
		}
	}

	for (const phase of WORKFLOW_PHASES) {
		it(`allows an undefined role (fail open) in phase: ${phase}`, () => {
			expect(
				isVerifierDispatchAllowed({ role: undefined, phase }).allowed,
			).toBe(true);
		});

		it(`allows an unrecognized role string (fail open) in phase: ${phase}`, () => {
			expect(
				isVerifierDispatchAllowed({ role: "totally-unknown-role", phase })
					.allowed,
			).toBe(true);
		});
	}

	it("is case-sensitive: 'Verifier' is not treated as the accept-only role", () => {
		// Deliberately undetermined-role behavior, not an implicit normalization.
		expect(
			isVerifierDispatchAllowed({ role: "Verifier", phase: "discuss" }).allowed,
		).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// pass/fail/skip <-> passed/failed/skipped mapping
// ---------------------------------------------------------------------------

describe("verification status mapping", () => {
	it("maps every result status to a valid DB status", () => {
		for (const status of VERIFICATION_RESULT_STATUSES) {
			const mapped = VERIFICATION_RESULT_TO_DB_STATUS[status];
			expect(VERIFICATION_STATUSES).toContain(mapped);
		}
	});

	it("maps pass -> passed, fail -> failed, skip -> skipped", () => {
		expect(toDbVerificationStatus("pass")).toBe("passed");
		expect(toDbVerificationStatus("fail")).toBe("failed");
		expect(toDbVerificationStatus("skip")).toBe("skipped");
	});

	it("returns undefined for an input outside the result vocabulary", () => {
		expect(toDbVerificationStatus("passed")).toBeUndefined();
		expect(toDbVerificationStatus("unknown")).toBeUndefined();
		expect(toDbVerificationStatus("")).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// isWaveVerified
// ---------------------------------------------------------------------------

function row(status: VerifiedRowLike["status"]): VerifiedRowLike {
	return { status };
}

describe("isWaveVerified", () => {
	it("is false for zero rows", () => {
		expect(isWaveVerified([])).toBe(false);
	});

	it("is true for a single passed row", () => {
		expect(isWaveVerified([row("passed")])).toBe(true);
	});

	it("is false for a single failed row", () => {
		expect(isWaveVerified([row("failed")])).toBe(false);
	});

	it("is true for a single skipped row (auditable escape)", () => {
		expect(isWaveVerified([row("skipped")])).toBe(true);
	});

	it("is true for multiple passed rows", () => {
		expect(isWaveVerified([row("passed"), row("passed")])).toBe(true);
	});

	it("is false when any row among several is failed", () => {
		expect(isWaveVerified([row("passed"), row("failed"), row("passed")])).toBe(
			false,
		);
	});

	it("is false for a mixed skip/fail set", () => {
		expect(isWaveVerified([row("skipped"), row("failed")])).toBe(false);
	});

	it("is true for a mixed pass/skip set", () => {
		expect(isWaveVerified([row("passed"), row("skipped")])).toBe(true);
	});

	it("treats a pending row as non-failing on its own", () => {
		expect(isWaveVerified([row("pending")])).toBe(true);
	});

	it("is false when a pending row accompanies a failed row", () => {
		expect(isWaveVerified([row("pending"), row("failed")])).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// Sanity: WORKFLOW_PHASES actually covers all five phases used above
// ---------------------------------------------------------------------------

describe("phase coverage sanity check", () => {
	it("exercises all five workflow phases", () => {
		const expected: WorkflowPhase[] = [
			"idle",
			"discuss",
			"plan",
			"execute",
			"accept",
		];
		expect([...WORKFLOW_PHASES].sort()).toEqual([...expected].sort());
	});
});
