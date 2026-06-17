import { describe, expect, it } from "bun:test";

import {
	DEFAULT_AGENT,
	ROUTING_CATEGORIES,
	detectAutoDelegation,
	route,
} from "./index.js";

// ---------------------------------------------------------------------------
// route() — Executor tiers
// ---------------------------------------------------------------------------

describe("route — executor-low", () => {
	it("routes scaffold tasks", () => {
		const r = route("Scaffold the new package directory structure");
		expect(r.agent).toBe("executor-low");
		expect(r.tier).toBe("low");
	});

	it("routes config updates", () => {
		const r = route("Update config for the new environment");
		expect(r.agent).toBe("executor-low");
		expect(r.tier).toBe("low");
	});

	it("routes dependency additions", () => {
		const r = route("Add dependency on zod for schema validation");
		expect(r.agent).toBe("executor-low");
		expect(r.tier).toBe("low");
	});

	it("routes file rename tasks", () => {
		const r = route("Rename file from old-name.ts to new-name.ts");
		expect(r.agent).toBe("executor-low");
	});
});

describe("route — executor-medium", () => {
	it("routes business logic tasks", () => {
		const r = route("Add business logic for order total calculation");
		expect(r.agent).toBe("executor-medium");
		expect(r.tier).toBe("medium");
	});

	it("routes refactoring tasks", () => {
		const r = route("Refactor the user service to reduce duplication");
		expect(r.agent).toBe("executor-medium");
		expect(r.tier).toBe("medium");
	});

	it("routes utility function creation", () => {
		const r = route("Create a utility function for date formatting");
		expect(r.agent).toBe("executor-medium");
		expect(r.tier).toBe("medium");
	});

	it("routes middleware tasks", () => {
		const r = route("Add middleware for request logging");
		expect(r.agent).toBe("executor-medium");
		expect(r.tier).toBe("medium");
	});

	it("routes validation additions", () => {
		const r = route("Add validation for the user input fields");
		expect(r.agent).toBe("executor-medium");
		expect(r.tier).toBe("medium");
	});
});

describe("route — executor-high", () => {
	it("routes feature implementation", () => {
		const r = route("Implement the payment processing feature");
		expect(r.agent).toBe("executor-high");
		expect(r.tier).toBe("high");
	});

	it("routes API endpoint creation", () => {
		const r = route("Build an API endpoint for user profiles");
		expect(r.agent).toBe("executor-high");
		expect(r.tier).toBe("high");
	});

	it("routes authentication work", () => {
		const r = route("Implement authentication with JWT tokens");
		expect(r.agent).toBe("executor-high");
		expect(r.tier).toBe("high");
	});

	it("routes security tasks", () => {
		const r = route("Add security headers and encryption for data at rest");
		expect(r.agent).toBe("executor-high");
		expect(r.tier).toBe("high");
	});

	it("routes algorithm implementation", () => {
		const r = route("Implement the sorting algorithm for the leaderboard");
		expect(r.agent).toBe("executor-high");
		expect(r.tier).toBe("high");
	});
});

describe("route — executor-frontend-low", () => {
	it("routes styling fixes", () => {
		const r = route("Fix styling on the login button");
		expect(r.agent).toBe("executor-frontend-low");
		expect(r.tier).toBe("frontend-low");
	});

	it("routes CSS updates", () => {
		const r = route("Update CSS for the header component");
		expect(r.agent).toBe("executor-frontend-low");
		expect(r.tier).toBe("frontend-low");
	});

	it("routes spacing adjustments", () => {
		const r = route("Adjust spacing between the cards on the homepage");
		expect(r.agent).toBe("executor-frontend-low");
		expect(r.tier).toBe("frontend-low");
	});

	it("routes simple UI tweaks", () => {
		const r = route("Tweak UI alignment on the settings page");
		expect(r.agent).toBe("executor-frontend-low");
		expect(r.tier).toBe("frontend-low");
	});
});

describe("route — executor-frontend-high", () => {
	it("routes component creation", () => {
		const r = route("Build a reusable UI component for data tables");
		expect(r.agent).toBe("executor-frontend-high");
		expect(r.tier).toBe("frontend-high");
	});

	it("routes accessibility work", () => {
		const r = route("Improve accessibility across the form components");
		expect(r.agent).toBe("executor-frontend-high");
		expect(r.tier).toBe("frontend-high");
	});

	it("routes animation tasks", () => {
		const r = route("Add animation and transition effects to the modal");
		expect(r.agent).toBe("executor-frontend-high");
		expect(r.tier).toBe("frontend-high");
	});

	it("routes dashboard creation", () => {
		const r = route("Create a dashboard with data visualization charts");
		expect(r.agent).toBe("executor-frontend-high");
		expect(r.tier).toBe("frontend-high");
	});

	it("routes design system work", () => {
		const r = route("Build the design system token layer with theme support");
		expect(r.agent).toBe("executor-frontend-high");
		expect(r.tier).toBe("frontend-high");
	});
});

// ---------------------------------------------------------------------------
// route() — Specialist agents
// ---------------------------------------------------------------------------

describe("route — researcher", () => {
	it("routes research tasks", () => {
		const r = route("Research the best caching strategy for our API");
		expect(r.agent).toBe("researcher");
		expect(r.tier).toBeUndefined();
	});

	it("routes comparison tasks", () => {
		const r = route("Compare alternatives for the state management library");
		expect(r.agent).toBe("researcher");
	});

	it("routes feasibility studies", () => {
		const r = route("Conduct a feasibility study on WebSocket support");
		expect(r.agent).toBe("researcher");
	});

	it("routes spike/POC tasks", () => {
		const r = route("Create a proof of concept for the new auth flow");
		expect(r.agent).toBe("researcher");
	});
});

describe("route — explorer", () => {
	it("routes file finding tasks", () => {
		const r = route("Find files related to the authentication module");
		expect(r.agent).toBe("explorer");
		expect(r.tier).toBeUndefined();
	});

	it("routes code tracing tasks", () => {
		const r = route("Trace code flow from the API handler to the database");
		expect(r.agent).toBe("explorer");
	});

	it("routes usage finding tasks", () => {
		const r = route("Find usages of the deprecated helper function");
		expect(r.agent).toBe("explorer");
	});

	it("routes 'where is' queries", () => {
		const r = route("Where is the user model defined?");
		expect(r.agent).toBe("explorer");
	});
});

describe("route — debugger", () => {
	it("routes debug tasks", () => {
		const r = route("Debug the login authentication issue");
		expect(r.agent).toBe("debugger");
		expect(r.tier).toBeUndefined();
	});

	it("routes bug fix tasks", () => {
		const r = route("Fix bug in the payment processing module");
		expect(r.agent).toBe("debugger");
	});

	it("routes troubleshooting tasks", () => {
		const r = route("Troubleshoot the database connection timeout");
		expect(r.agent).toBe("debugger");
	});

	it("routes root cause analysis", () => {
		const r = route("Find the root cause of the memory leak");
		expect(r.agent).toBe("debugger");
	});

	it("routes 'why failing' queries", () => {
		const r = route("Why is the test suite failing on CI?");
		expect(r.agent).toBe("debugger");
	});
});

describe("route — tester", () => {
	it("routes test writing tasks", () => {
		const r = route("Write tests for the authentication module");
		expect(r.agent).toBe("tester");
		expect(r.tier).toBeUndefined();
	});

	it("routes coverage improvement tasks", () => {
		const r = route("Improve test coverage for the API handlers");
		expect(r.agent).toBe("tester");
	});

	it("routes e2e test tasks", () => {
		const r = route("Create e2e tests for the checkout flow");
		expect(r.agent).toBe("tester");
	});

	it("routes unit test tasks", () => {
		const r = route("Add unit test for the price calculator");
		expect(r.agent).toBe("tester");
	});
});

describe("route — writer", () => {
	it("routes documentation tasks", () => {
		const r = route("Write documentation for the API endpoints");
		expect(r.agent).toBe("writer");
		expect(r.tier).toBeUndefined();
	});

	it("routes README tasks", () => {
		const r = route("Update the readme with setup instructions");
		expect(r.agent).toBe("writer");
	});

	it("routes guide writing", () => {
		const r = route("Write a migration guide for the v2 API");
		expect(r.agent).toBe("writer");
	});
});

describe("route — verifier", () => {
	it("routes verification tasks", () => {
		const r = route("Verify the implementation meets the spec requirements");
		expect(r.agent).toBe("verifier");
		expect(r.tier).toBeUndefined();
	});

	it("routes audit tasks", () => {
		const r = route("Audit the codebase for security compliance");
		expect(r.agent).toBe("verifier");
	});

	it("routes code review tasks", () => {
		const r = route("Review code for the new feature branch");
		expect(r.agent).toBe("verifier");
	});
});

describe("route — planner", () => {
	it("routes planning tasks", () => {
		const r = route("Plan the architecture for the notification system");
		expect(r.agent).toBe("planner");
		expect(r.tier).toBeUndefined();
	});

	it("routes task breakdown tasks", () => {
		const r = route("Decompose the feature into a task breakdown");
		expect(r.agent).toBe("planner");
	});

	it("routes roadmap tasks", () => {
		const r = route("Create a roadmap for the next quarter");
		expect(r.agent).toBe("planner");
	});
});

// ---------------------------------------------------------------------------
// route() — Fallback and edge cases
// ---------------------------------------------------------------------------

describe("route — fallback", () => {
	it("falls back to executor-high for ambiguous input", () => {
		const r = route("Do something with the system");
		expect(r.agent).toBe("executor-high");
		expect(r.tier).toBe("high");
		expect(r.category).toBe("fallback");
	});

	it("falls back for empty-ish input", () => {
		const r = route("handle this");
		expect(r.agent).toBe("executor-high");
	});

	it("is case-insensitive", () => {
		const r1 = route("RESEARCH the best approach");
		const r2 = route("research the best approach");
		expect(r1.agent).toBe(r2.agent);
	});

	it("returns confidence between 0 and 1", () => {
		const r = route("Implement a complex authentication system with JWT");
		expect(r.confidence).toBeGreaterThanOrEqual(0);
		expect(r.confidence).toBeLessThanOrEqual(1);
	});

	it("returns higher confidence for more signal matches", () => {
		const r1 = route("implement");
		const r2 = route("implement and build a new feature with authentication");
		expect(r2.confidence).toBeGreaterThan(r1.confidence);
	});

	it("includes matched signals in the result", () => {
		const r = route("Research and compare alternatives for caching");
		expect(r.matchedSignals.length).toBeGreaterThan(0);
	});

	it("includes a human-readable reason", () => {
		const r = route("Debug the login issue");
		expect(r.reason).toBeTruthy();
		expect(typeof r.reason).toBe("string");
	});
});

// ---------------------------------------------------------------------------
// route() — Anti-signal disambiguation
// ---------------------------------------------------------------------------

describe("route — anti-signal disambiguation", () => {
	it("prefers explorer over researcher for 'search codebase'", () => {
		const r = route("Search codebase for authentication patterns");
		expect(r.agent).toBe("explorer");
	});

	it("prefers debugger over researcher for 'investigate error'", () => {
		const r = route("Investigate error in the payment handler");
		expect(r.agent).toBe("debugger");
	});
});

// ---------------------------------------------------------------------------
// detectAutoDelegation() — MH18
// ---------------------------------------------------------------------------

describe("detectAutoDelegation — research intents", () => {
	it("detects 'research' keyword", () => {
		const r = detectAutoDelegation(
			"Can you research the best caching strategy?",
		);
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("researcher");
		expect(r.intent).toBe("research");
	});

	it("detects 'compare alternatives'", () => {
		const r = detectAutoDelegation("Compare alternatives for the ORM library");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("researcher");
		expect(r.intent).toBe("research");
	});

	it("detects 'feasibility'", () => {
		const r = detectAutoDelegation("Check the feasibility of using WebSockets");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("researcher");
	});

	it("detects 'proof of concept'", () => {
		const r = detectAutoDelegation("Build a proof of concept for the new auth");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("researcher");
	});

	it("detects 'which library'", () => {
		const r = detectAutoDelegation(
			"Which library should we use for validation?",
		);
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("researcher");
	});

	it("detects 'pros and cons'", () => {
		const r = detectAutoDelegation("What are the pros and cons of GraphQL?");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("researcher");
	});

	it("detects 'trade-off'", () => {
		const r = detectAutoDelegation(
			"Analyze the trade-off between REST and gRPC",
		);
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("researcher");
	});
});

describe("detectAutoDelegation — debug intents", () => {
	it("detects 'debug' keyword", () => {
		const r = detectAutoDelegation("Debug the authentication flow");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("debugger");
		expect(r.intent).toBe("debug");
	});

	it("detects 'fix bug'", () => {
		const r = detectAutoDelegation("Fix bug in the payment module");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("debugger");
		expect(r.intent).toBe("debug");
	});

	it("detects 'troubleshoot'", () => {
		const r = detectAutoDelegation("Troubleshoot the connection timeout");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("debugger");
	});

	it("detects 'root cause'", () => {
		const r = detectAutoDelegation("Find the root cause of the crash");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("debugger");
	});

	it("detects 'why failing'", () => {
		const r = detectAutoDelegation("Why is the test suite failing?");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("debugger");
	});

	it("detects 'why not working'", () => {
		const r = detectAutoDelegation("The login page is not working, help");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("debugger");
	});

	it("detects 'diagnose'", () => {
		const r = detectAutoDelegation("Diagnose the memory leak in production");
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("debugger");
	});

	it("detects 'regression'", () => {
		const r = detectAutoDelegation(
			"There's a regression in the search feature",
		);
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("debugger");
	});
});

describe("detectAutoDelegation — debug takes priority over research", () => {
	it("prefers debug when both signals present", () => {
		const r = detectAutoDelegation(
			"Research and debug the authentication issue",
		);
		expect(r.detected).toBe(true);
		expect(r.agent).toBe("debugger");
		expect(r.intent).toBe("debug");
	});
});

describe("detectAutoDelegation — no match", () => {
	it("returns not detected for generic prompts", () => {
		const r = detectAutoDelegation("Implement the user profile feature");
		expect(r.detected).toBe(false);
		expect(r.agent).toBeUndefined();
		expect(r.intent).toBeUndefined();
		expect(r.matchedPattern).toBeUndefined();
	});

	it("returns not detected for empty input", () => {
		const r = detectAutoDelegation("");
		expect(r.detected).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// ROUTING_CATEGORIES — structural checks
// ---------------------------------------------------------------------------

describe("ROUTING_CATEGORIES", () => {
	it("contains all 12 categories (7 specialists + 5 executors)", () => {
		expect(ROUTING_CATEGORIES.length).toBe(12);
	});

	it("covers all 5 executor tiers", () => {
		const tiers = ROUTING_CATEGORIES.filter((c) => c.tier !== undefined).map(
			(c) => c.tier,
		);
		expect(tiers).toContain("low");
		expect(tiers).toContain("medium");
		expect(tiers).toContain("high");
		expect(tiers).toContain("frontend-low");
		expect(tiers).toContain("frontend-high");
	});

	it("covers all 7 specialist agents", () => {
		const agents = ROUTING_CATEGORIES.filter((c) => c.tier === undefined).map(
			(c) => c.agent,
		);
		expect(agents).toContain("researcher");
		expect(agents).toContain("explorer");
		expect(agents).toContain("debugger");
		expect(agents).toContain("tester");
		expect(agents).toContain("writer");
		expect(agents).toContain("verifier");
		expect(agents).toContain("planner");
	});

	it("every category has at least one signal", () => {
		for (const cat of ROUTING_CATEGORIES) {
			expect(cat.signals.length).toBeGreaterThan(0);
		}
	});

	it("default agent is executor-high", () => {
		expect(DEFAULT_AGENT).toBe("executor-high");
	});
});
