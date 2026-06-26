import { ConfirmInput, Spinner } from "@inkjs/ui";
import { Box, Text, render, useApp, useInput } from "ink";
import { useEffect, useMemo, useState } from "react";
import { Header, KeyHints, Panel, StaticLog } from "../components/index.js";
import {
	type RemovalTarget,
	type UninstallTier,
	executeUninstall,
	planUninstall,
} from "../lib/uninstall.js";
import { colors } from "../theme.js";

type UninstallState =
	| "tier-select"
	| "dry-run"
	| "confirm"
	| "executing"
	| "done"
	| "cancelled";

const EXIT_DELAY_MS = 2000;

const TIER_OPTIONS: Array<{
	tier: UninstallTier;
	label: string;
	description: string;
}> = [
	{
		tier: "config-only",
		label: "Config only",
		description: "remove config.json only (safe, keeps workflow data)",
	},
	{
		tier: "config-and-data",
		label: "Config + data",
		description: "remove config, database, and workflow history",
	},
	{
		tier: "config-data-and-dashboard",
		label: "Config + data + dashboard files",
		description: "full cleanup including dashboard build artifacts",
	},
];

const SELECT_HINTS = [
	{ key: "↑/↓", label: "navigate" },
	{ key: "⏎", label: "select" },
	{ key: "esc", label: "cancel" },
];

const CONFIRM_HINTS = [{ key: "esc", label: "cancel" }];

interface ProgressState {
	index: number;
	total: number;
}

function pluralizeItems(count: number): string {
	return `${count} item${count === 1 ? "" : "s"}`;
}

function TierSelectView({ selectedIndex }: { selectedIndex: number }) {
	return (
		<Box flexDirection="column">
			<Text color={colors.text}>What would you like to remove?</Text>
			<Box marginTop={1} flexDirection="column">
				{TIER_OPTIONS.map((option, index) => {
					const active = index === selectedIndex;
					return (
						<Box key={option.tier}>
							<Text color={active ? colors.highlight : colors.muted}>
								{active ? "▸ " : "  "}
							</Text>
							<Text
								color={active ? colors.highlight : colors.text}
								bold={active}
							>
								{option.label}
							</Text>
							<Text color={colors.muted}> — {option.description}</Text>
						</Box>
					);
				})}
			</Box>
			<KeyHints hints={SELECT_HINTS} />
		</Box>
	);
}

function PreviewView({
	targets,
	dryRunOnly,
	onConfirm,
	onCancel,
}: {
	targets: RemovalTarget[];
	dryRunOnly: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}) {
	return (
		<Box flexDirection="column">
			<Panel title="Preview (dry run — nothing deleted yet)" variant="subtle">
				{targets.length > 0 ? (
					targets.map((target) => (
						<Box key={target.path} flexDirection="column" marginBottom={1}>
							<Text color={colors.text}>• {target.path}</Text>
							<Text color={colors.muted}> {target.description}</Text>
						</Box>
					))
				) : (
					<Text color={colors.muted}>
						No matching files or directories found.
					</Text>
				)}
				<Box marginTop={1}>
					<Text color={colors.highlight}>
						{pluralizeItems(targets.length)} would be removed
					</Text>
				</Box>
			</Panel>


			{dryRunOnly ? (
				<Box marginTop={1}>
					<Text color={colors.success}>Dry run complete. Nothing was removed.</Text>
				</Box>
			) : (
				<>
					<Box marginTop={1}>
						<Text color={colors.highlight}>Proceed with removal? </Text>
						<ConfirmInput onConfirm={onConfirm} onCancel={onCancel} />
					</Box>
					<KeyHints hints={CONFIRM_HINTS} />
				</>
			)}
		</Box>
	);
}

function DoneView({ hadDashboardPid }: { hadDashboardPid: boolean }) {
	return (
		<Panel title="Uninstall complete" variant="success">
			<Text color={colors.success} bold>
				Uninstall complete.
			</Text>
			{hadDashboardPid ? (
				<Box marginTop={1}>
					<Text color={colors.warning}>
						The dashboard process (if running) was not stopped — run &apos;goop
						dashboard stop&apos; first
					</Text>
				</Box>
			) : null}
		</Panel>
	);
}

interface UninstallScreenProps {
	dryRun: boolean;
}

function UninstallScreen({ dryRun }: UninstallScreenProps) {
	const { exit } = useApp();
	const [state, setState] = useState<UninstallState>(dryRun ? "dry-run" : "tier-select");
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [selectedTier, setSelectedTier] = useState<UninstallTier>(
		TIER_OPTIONS[0]?.tier ?? "config-only",
	);
	const [targets, setTargets] = useState<RemovalTarget[]>([]);
	const [removedPaths, setRemovedPaths] = useState<string[]>([]);
	const [progress, setProgress] = useState<ProgressState>({
		index: 0,
		total: 0,
	});

	const hadDashboardPid = useMemo(
		() => targets.some((target) => target.path === ".goopspec/dashboard.pid"),
		[targets],
	);

	useInput(
		(_input, key) => {
			if (key.escape) setState("cancelled");
		},
		{
			isActive:
				!dryRun &&
				state !== "done" && state !== "cancelled" && state !== "executing",
		},
	);

	useInput(
		(_input, key) => {
			if (key.upArrow) {
				setSelectedIndex((current) => Math.max(0, current - 1));
			} else if (key.downArrow) {
				setSelectedIndex((current) =>
					Math.min(TIER_OPTIONS.length - 1, current + 1),
				);
			} else if (key.return) {
				const selected = TIER_OPTIONS[selectedIndex];
				if (!selected) return;
				setSelectedTier(selected.tier);
				setState("dry-run");
			}
		},
		{ isActive: !dryRun && state === "tier-select" },
	);

	useEffect(() => {
		if (state !== "dry-run") return;

		let active = true;
		void (async () => {
			const plannedTargets = await planUninstall(selectedTier);
			if (!active) return;
			setTargets(plannedTargets);
			setState("confirm");
		})();

		return () => {
			active = false;
		};
	}, [state, selectedTier]);

	useEffect(() => {
		if (state !== "executing") return;

		let active = true;
		setRemovedPaths([]);
		setProgress({ index: 0, total: targets.length });

		void (async () => {
			await executeUninstall(targets, (target, index, total) => {
				if (!active) return;
				setRemovedPaths((current) => [...current, target.path]);
				setProgress({ index, total });
			});
			if (active) setState("done");
		})();

		return () => {
			active = false;
		};
	}, [state, targets]);

	useEffect(() => {
		if (!dryRun || state !== "confirm") return undefined;

		const timer = setTimeout(() => {
			exit();
			process.exit(0);
		}, EXIT_DELAY_MS);
		return () => clearTimeout(timer);
	}, [dryRun, state, exit]);

	useEffect(() => {
		if (state === "cancelled") {
			const timer = setTimeout(() => exit(), 400);
			return () => clearTimeout(timer);
		}
		if (state === "done") {
			const timer = setTimeout(() => {
				exit();
				process.exit(0);
			}, EXIT_DELAY_MS);
			return () => clearTimeout(timer);
		}
		return undefined;
	}, [state, exit]);

	return (
		<Box flexDirection="column">
			<Header subtitle="Uninstall GoopSpec" />

			{state === "tier-select" ? (
				<TierSelectView selectedIndex={selectedIndex} />
			) : null}

			{state === "dry-run" ? (
				<Box>
					<Spinner label="Planning removal..." />
				</Box>
			) : null}

			{state === "confirm" ? (
				<PreviewView
					targets={targets}
					dryRunOnly={dryRun}
					onConfirm={() => setState("executing")}
					onCancel={() => setState("cancelled")}
				/>
			) : null}

			{state === "executing" ? (
				<Box flexDirection="column">
					<StaticLog items={removedPaths}>
						<Text color={colors.highlight}>
							Removing {Math.min(progress.index + 1, progress.total)} of{" "}
							{progress.total}...
						</Text>
					</StaticLog>
				</Box>
			) : null}

			{state === "done" ? <DoneView hadDashboardPid={hadDashboardPid} /> : null}

			{state === "cancelled" ? (
				<Panel title="Cancelled" variant="warning">
					<Text color={colors.warning}>
						Uninstall cancelled. Nothing was removed.
					</Text>
				</Panel>
			) : null}
		</Box>
	);
}

export async function renderUninstallScreen(options: { dryRun?: boolean } = {}): Promise<void> {
	const { waitUntilExit } = render(<UninstallScreen dryRun={options.dryRun ?? false} />);
	await waitUntilExit();
}
