import { describe, expect, it } from "bun:test";
import goopspec, { goopspec as namedExport } from "./index.js";
import { createMockPiApi } from "./test-utils.js";

describe("goopspec extension factory", () => {
	it("exports a function as default", () => {
		expect(typeof goopspec).toBe("function");
	});

	it("exports a named export matching the default", () => {
		expect(namedExport).toBe(goopspec);
	});

	it("can be called with a mock Pi API without throwing", () => {
		const mockPi = createMockPiApi();
		expect(() => goopspec(mockPi)).not.toThrow();
	});

	it("registers all 7 tools", () => {
		const mockPi = createMockPiApi();
		goopspec(mockPi);
		const names = mockPi.getRegisteredToolNames();
		expect(names).toContain("goop_read_db");
		expect(names).toContain("goop_write_db");
		expect(names).toContain("goop_save_note");
		expect(names).toContain("goop_search_notes");
		expect(names).toContain("goop_state");
		expect(names).toContain("goop_task");
		expect(names).toContain("goop_web_search");
		expect(names.length).toBe(7);
	});

	it("registers all 5 commands", () => {
		const mockPi = createMockPiApi();
		goopspec(mockPi);
		const names = mockPi.getRegisteredCommandNames();
		expect(names).toContain("goop-discuss");
		expect(names).toContain("goop-plan");
		expect(names).toContain("goop-execute");
		expect(names).toContain("goop-accept");
		expect(names).toContain("goop-status");
		expect(names.length).toBe(5);
	});

	it("registers 2 lifecycle hooks", () => {
		const mockPi = createMockPiApi();
		goopspec(mockPi);
		const events = mockPi.getRegisteredEvents();
		expect(events).toContain("before_agent_start");
		expect(events).toContain("tool_call");
		expect(events.length).toBe(2);
	});

	it("registers tools with valid name and description", () => {
		const mockPi = createMockPiApi();
		goopspec(mockPi);
		for (const tool of mockPi.getRegisteredTools()) {
			expect(tool.name).toBeTruthy();
			expect(tool.description).toBeTruthy();
			expect(typeof tool.execute).toBe("function");
			expect(tool.parameters).toBeTruthy();
		}
	});
});
