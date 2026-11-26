// Assembles the control plane: Log, registry, decisions, living message, MCP hub, WS server.
import { createPreviews, loopbackOf } from "./preview.ts";
import { createBackgroundIndex } from "./background.ts";
import { createWbFrames } from "./workbench.ts";
import { createMentions } from "./mentions.ts";
import { effectiveBrain } from "./brain.ts";
import { createBrainHold } from "./brain-hold.ts";
import { createFreeBudget } from "./free-budget.ts";
import { createFreshLook, diffFromWorkbench } from "./fresh-look.ts";
import { createDocCheck } from "./doc-check.ts";
import { createMediaStore } from "./media.ts";
import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { thisComputer } from "./this-computer.ts";
import { basename, join, resolve, sep } from "node:path";
import { randomBytes } from "node:crypto";
import { APP_SANDBOX, appCsp, HARNESSES, TASK_STEP_ACTIONS, MEM_AUTO_SESSION, MEM_BRIDGE_SKILL,MEM_CONNECT_TOOLS, agentBack, fill, harnessName, normalizeTag, sameComputer, pickTag, words, type Bodies, type HarnessId, type LangTag, type HelperWork, type LogEvent, type OnHand, type PartnerAsk, type Place, type TaskCard, type TaskNeeds } from "@ducter/protocol";
import { intlLocale, talkLang } from "./lang.ts";
import type { CoreApi, ListedModel, MemIdentity, MemLookPort, Partner, Runner, TaskMemoryPort } from "@ducter/protocol/src/internal.ts";
import { jsonArg } from "@ducter/protocol/src/tool-schema.ts";
import { migrateKeys, readKeys, scrubKeysFromEnv } from "@ducter/protocol/src/keys.ts";
import { realClock, type Clock } from "./clock.ts";
import { createDecisions, forwardFrom, plainAsk, type Decisions } from "./decisions.ts";
import { createLiving, type Living } from "./living.ts";
import { openLog, type SqliteLog } from "./log.ts";
import { createMcpHub, type CoreMcpHub } from "./mcp.ts";
import { DEFAULT_IDENTITY, otherIdentity, type Persona } from "./persona.ts";
import { createRegistry, type CoreRegistry } from "./registry.ts";
import { createMarks, createPast } from "./past.ts";
import { createTidied, holdOf } from "./tidied.ts";
import { createResourceProbe, resourcesMoved } from "@ducter/protocol/src/resources.ts";
import { roomFor } from "./candidates.ts";
import { createPlacementMem, HINTS_EVERY_MS, type PlacementMemClient } from "./placement-mem.ts";
import { createRedo } from "./redo.ts";
import { createOutside } from "./outside.ts";
import { createMade, type Made } from "./made.ts";
import { createMemFiles, type MemFiles, type MemFilesDeps } from "./mem-files.ts";
import { createLocalAgents, type LocalAgents } from "./local-agents/index.ts";
import { bridgeOnWords, connectsByItself, createBridgeAuto } from "./bridge-auto.ts";
import { createDid } from "./did.ts";
import { registerDidTool } from "./did-tool.ts";
import { recentFolders } from "./first-words.ts";
import { createOngoing } from "./ongoing.ts";
import { registerCoreTools } from "./tools.ts";
import type { Waiters } from "./waiters.ts";
import { createWork, type Work } from "./work.ts";
import { createHarnessAsk, createHarnessJudge } from "./judge.ts";
import { createWebLook } from "./web-look.ts";
import { createProactive, type Proactive } from "./proactive/engine.ts";
import { replayProactive } from "./proactive/replay.ts";
import { readShadowEvents, readWeekEvents, weekReport, weeksSince, WEEKS_DEFAULT, WEEKS_MAX } from "./proactive/week.ts";
import { modelTriage, type Triage } from "./proactive/triage.ts";
import { modelDrafter } from "./proactive/reply.ts";
import { modelJudge, type FindJudge } from "./proactive/judge.ts";
import { gatherLeads, modelSpotter } from "./proactive/wider.ts";
import { modelCross } from "./proactive/cross.ts";
import { registerProactiveTools } from "./proactive/tools.ts";
import { createWsHandler, type WsData } from "./ws.ts";
import { createKeyCopy } from "./key-copy.ts";
import { MCP_CALL_WAIT } from "@ducter/protocol/src/harness-facts.ts";
import { openPartners, type Partners, type PartnerError } from "./partners.ts";
import { registerPartnerTool } from "./partner-tool.ts";
import { DEFAULT_PARTNER, channelOf, isOtherChannel } from "@ducter/protocol/src/partners.ts";
import { asSeenBy, createWhose, partnerView } from "./partner-view.ts";
import { createGate, openDeviceAuth, type DeviceAuth } from "./auth.ts";
import { createWorkers, deviceRoutes, splitSockets, type Workers, type WorkerSocketData } from "./workers.ts";
import { createPusher, openPushStore, type Pusher, type PushStore } from "./push.ts";
import { createApnsSender, createAppPushSender, http2Transport, loadApnsConfig, type ApnsSender, type ApnsTransport } from "./apns.ts";
import { createActivitySender, createAmbient, openAmbientStore } from "./ambient.ts";
import { createRelayClient, relayUrl, type RelayFetch } from "./push-relay.ts";
import { webApi, webStatic } from "./web.ts";
import { CHECK_PATH, createAnywhere, type AnywhereCtl, type TunnelSys } from "./anywhere.ts";
import { createLend } from "./lend.ts";
import { callAbility, createDevicesView, publicAddress, qrRows, homeName as savedHomeName, type DeviceProbes, type DevicesView } from "./devices.ts";
import { openSettings, type SettingsStore } from "./settings.ts";
import { createHelpers, HELPER_RETRY_MS, helperItems, helperSaidWords, type Helpers } from "./helpers.ts";
import { createKeeps, keepEndAsk, keepRoundAsk, keepRulesAsk, nextRoundLine, registerKeepTools, type Keeps } from "./keeps.ts";
import { createBridgeLink, nmemCall, type NmemCall } from "./bridge-link.ts";
import { connectLinkFrom } from "./mem-cli.ts";
import { createMemGlance } from "./mem-glance.ts";
import { createMemCheck } from "./mem-check.ts";
import { createMemHealth } from "./mem-health.ts";
import { scrub as scrubMem } from "./worker-mem.ts";
import { createMemRelay, homeClaudeMemPlugin, readMemCredential } from "./mem-relay.ts";
import { createWorkingMemory } from "./working-memory.ts";
import { identityIdFor, readMemIdentity } from "./mem-identity.ts";
import { keepSaidAtOnce, keepSaidOnGo, openSaid, type SaidStore } from "./said.ts";
import { openStanding, type StandingStore } from "./standing.ts";
import { takeBackAtOnce } from "./mem-takeback.ts";
import { openRules, type RulesStore } from "./rules.ts";
import { openPins, type PinsStore } from "./pins.ts";
import { openApps, type AppsStore } from "./apps.ts";
import { appIconResponse } from "./app-icon.ts";
import { APP_DATA_SCHEMA, createBoards } from "./boards.ts";
import { createLoadout, isRuleHint, registerRuleTools, registerSwitchTool, registerBrainSwitchTool, registerNewTasksTool, type Loadout } from "./loadout.ts";
import { createKindRetry, type KindRetry } from "./kind-retry.ts";
import { createMender } from "./mend.ts";
import { hostAlias } from "./bound.ts";
import { readRepairEvents, repairReport, repairSince, REPAIR_WEEKS_DEFAULT, REPAIR_WEEKS_MAX } from "./mend-week.ts";
import { usageDays } from "./usage-days.ts";
import { openConnections, type ConnectionsStore, type Linker, type OoSource } from "./connections.ts";
import { callWakes, neverCall, openPhone, type Phone } from "./phone.ts";
import { openOwnPhone } from "./phone-own/index.ts";
import { providerOf } from "./phone-provider.ts";
import { registerConnectionTools } from "./connection-tools.ts";
import { createCalendar, type Calendar } from "./calendar.ts";
import { briefOf, createTaskSources, placeForRepo, type TaskSources, type TaskSourcesDeps } from "./task-sources/index.ts";
import { dayKey } from "./proactive/detect.ts";
import { createChanges, type Changes } from "./changes.ts";
import { createModelCatalog, type ModelCatalog } from "./models.ts";
import { browseFolders, cloneProject, createFoundRepos, ghInstallHome, gitLoginOn, isOldOp, newFolderProject, languageOf, newTaskOptions, openYourTask, type FolderProjects, type GitLoginAction, type GitRun, type NewTaskComputers, type NewTaskInput } from "./newtask.ts";
import { BROWSE_MAX, folderRoots, insideRoots, listFolders, projectRepos, realFs, type BrowseResult } from "@ducter/protocol/src/repos.ts";
import { cloneRepo, type CloneResult } from "@ducter/protocol/src/clone.ts";
import { answerClones, remoteKey, type ClonesAnswer } from "@ducter/protocol/src/clones.ts";
import { folderInfo, realGit as realGitInfo, type FolderInfo } from "@ducter/protocol/src/folder-info.ts";
import { createPlaces, createRepoWhere, type WhereComputer } from "./repo-where.ts";
import { newProjectFolder, type NewFolderResult } from "@ducter/protocol/src/new-folder.ts";
import { createGitLogin, type GitLogin, type GitLoginState } from "@ducter/protocol/src/git-login.ts";
import { createGhInstaller, useOwnTools, type GhInstaller } from "./gh-install.ts";
import { ducterFolder } from "@ducter/protocol/src/ducter-folder.ts";
import { createProjects } from "./projects.ts";
import { createTaskGroups, type TaskGroups } from "./task-groups.ts";
import { createOnHandAway } from "./onhand-away.ts";
import { createAsks, type Asks } from "./asks.ts";
import { PLAN_SCHEMA } from "./task-sources/handover.ts";
import { createReleaseWatch, type Fetch as ReleaseFetch, type ReleaseWatch } from "./release.ts";
import { createUpdates, type Updates, type UpdatesDeps } from "./updates.ts";
import { createAgentLatest, createAgentUpdates, type AgentUpdates, type AgentUpdatesDeps } from "./agents.ts";
import { createUpdateAll, type UpdateAll } from "./update-all.ts";
import { bundledPiVersion, detectAgent, probeHarnesses, signedInNow } from "./harness-probe.ts";
import { createMemPlugins, type MemPlugins } from "./mem-plugins.ts";
import { checkMemPluginUpdates, inspectMemBridge, inspectMemPlugins, nmemInspectExec } from "@ducter/protocol/src/mem-plugins.ts";
import { realSys, updateHow, writeAlive, type UpdateSys } from "./update.ts";
import { DUCTER_VERSION } from "@ducter/protocol/src/version.ts";
import { createAutofill, type Autofill } from "./saved/index.ts";
import { createKeys } from "./saved/keys.ts";
import { createDucterBrowser, type DucterBrowser, type DucterBrowserOptions } from "./browser/index.ts";
import { createDucterPhone, type DucterPhone, type DucterPhoneOptions } from "./android/index.ts";
import { createHandsets } from "./handset/index.ts";
import { createComputerUse, type ComputerUse, type ComputerUseOptions } from "./computer/index.ts";
import { readSites } from "./browser/sites.ts";
import { createClosing, registerClosingTool } from "./closing.ts";
import { createAccountUsage } from "./account-usage.ts";
import { createAgentLimits } from "./agent-limits.ts";
import { replaceTask } from "./replaces.ts";
import { createLimitWaits } from "./limits.ts";
import { workerProfile } from "./browser/remote.ts";
import { profileName } from "@ducter/protocol/src/browser-profile.ts";
import { createChannels, type ChannelDeps, type Channels } from "./channels/index.ts";
import { homeIdentity, okNonce } from "./home-key.ts";
import { addWay, bookHas, createReach, removeWay, viaOf, type ReachWatch } from "./reach-book.ts";
import { CHALLENGE_PATH, STANDING_PATH } from "@ducter/protocol/src/reach.ts";
import { proveHome } from "@ducter/protocol/src/reach-verify.ts";
import { whichNow } from "@ducter/protocol/src/which.ts";
import { createAgentSetup, installAndWait, realAgentSetupSys } from "./agent-setup.ts";
import { agentSignature, widenAgentPath } from "./agent-path.ts";

declare const DUCTER_COMMIT: string | undefined; // set by packages/cli/build.sh via --define
/** The build this core runs ("dev" from a checkout): /health says it, so Ducter.app can tell a background
 *  Ducter still on the helper it replaced (the app dragged in by hand) and restart it. */
/**
 * D540: model-visible: what every round of a review task hears when the person said reviews go
 * without asking: the fact (where, their words) and the one means (review_report posts at once).
 */
const REVIEW_GO = {
  zh: {
    line: "对方说过 PR 评审不用问、直接发（{where}，原话：「{said}」）。写好的评审都用 review_report 交上来，Ducter 当场发到 GitHub：挑不出问题的，也把结论写在 body 里发出去；一个 PR 这一轮没有新提交但还没发过评审，也照样交（changed 填 true）。不要自己跑 gh pr review，不要把草稿写进报告等别人发，也不要留到下一轮。",
    where: "{orgs} 下的 PR",
    any: "所有 PR",
    sep: "、",
  },
  en: {
    line: 'The person said PR reviews go without asking ({where}; their words: "{said}"). Send every finished review through review_report and Ducter posts it to GitHub at once: when you find nothing to change, the body with your conclusion is the review and goes too; a PR with no new commit this round but no review posted yet goes the same way (changed: true). Never run gh pr review yourself, never leave a draft in a report for someone else to post, never hold it for the next round.',
    where: "PRs in {orgs}",
    any: "every PR",
    sep: ", ",
  },
};

/** D394: what a review task's round says (review_report). */
const REVIEW_WORDS = /\breview|code review|\bPRs?\b.*\b(look|check)|评审|审查|审一下|审核|review 一下/i;
const REVIEW_ROUND_SCHEMA = {
  type: "object",
  properties: {
    prs: {
      type: "array",
      description: "Every pull request waiting on the person this round, reviewed again or not",
      items: {
        type: "object",
        properties: {
          ref: { type: "string", description: "owner/repo#number" },
          title: { type: "string", description: "The PR's title" },
          head: { type: "string", description: "The head commit you looked at (sha)" },
          ci: { type: "string", enum: ["passing", "failing", "pending", "none"], description: "Its checks at that head" },
          changed: { type: "boolean", description: "true: you reviewed it this round (its head moved, it is new, the person asked, or no review of yours is on it at this head yet)" },
          gist: { type: "string", description: "One line in the person's language: what the PR does" },
          mention: { type: "boolean", description: "true when it only mentions or assigns the person and didn't ask for their review" },
          body: { type: "string", description: "Only when changed: the review's own words in the PR's language: your conclusion and what you checked, a few lines. With no notes it is the whole review (nothing to change still gets one)" },
          notes: {
            type: "array",
            description: "Only when changed: your drafted review comments, at most 6",
            items: {
              type: "object",
              properties: { kind: { type: "string", enum: ["problem", "suggestion"] }, path: { type: "string" }, line: { type: "number" }, text: { type: "string" } },
              required: ["kind", "text"],
            },
          },
        },
        required: ["ref", "changed"],
      },
    },
  },
  required: ["prs"],
} as const;

const BUILD = typeof DUCTER_COMMIT === "string" ? DUCTER_COMMIT : "dev";

/** D228: the Go card for a tunnel in the person's own Cloudflare account (D292: zh and en; ko → en). */
const ANYWHERE_ASK = {
  zh: {
    question: "在你的 Cloudflare 账号里建一条通道，把 {hostname} 指到 {name}？以后在哪儿打开 {hostname}，都是这台电脑上的 Ducter。想用别的名字，直接回我。",
    go: "建好它",
  },
  en: {
    question: "Create a tunnel in your Cloudflare account and point {hostname} at {name}? Opening {hostname} anywhere will then reach Ducter on this computer. Want another name? Just reply with it.",
    go: "Set it up",
  },
};

export interface CoreOptions {
  /** D299: the reader of the person's own agents' sessions (Past tasks' 也在这台电脑上). Default:
   *  this computer's, at DUCTER_OUTSIDE_HOME or the home folder; none under `bun test` or with
   *  DUCTER_OUTSIDE=0 (tests never read a real person's sessions). */
  localAgents?: LocalAgents;
  dataDir?: string;
  port?: number; // 0 = random (tests)
  hostname?: string; // default env DUCTER_HOST or 127.0.0.1; anything else is an explicit choice
  persona?: Persona;
  /** D309: more than one partner (tests); D486 default: on unless DUCTER_PARTNERS=off. */
  partners?: boolean;
  clock?: Clock;
  defaultDelayMs?: number;
  /** D233: how long ask_for_key waits in the call for the person (tests); default per harness. */
  keyWaitMs?: number;
  /**
   * D539 test and eval seams: the home's shelf of kept keys, and how an op is called on a computer
   * ("local" = the home), so fake workers answer keys_has, keys_offer, keys_seal and keys_take.
   */
  keyCopy?: { shelf?: import("@ducter/protocol/src/key-shelf.ts").KeyShelf; call?: import("./key-copy.ts").KeyCall };
  batchMs?: number;
  sweepMs?: number; // how often live device sockets are re-checked for revocation (default 10 s)
  push?: boolean; // send Web Push (default on; env DUCTER_PUSH=off turns it off)
  pushHoldMs?: number;
  pushFetch?: (url: string, init: RequestInit) => Promise<Response>; // tests
  /** Sends to the iPhone app (tests pass a fake; default: <dataDir>/apns.json or DUCTER_APNS_*). */
  apns?: ApnsSender;
  /** Test seam: how the notification relay is called (default fetch to DUCTER_PUSH_RELAY or ducter.ai). */
  relayFetch?: RelayFetch;
  /** D306 test seam: how Live Activity pushes reach Apple with this home's own key. */
  ambientTransport?: ApnsTransport;
  /** Test seams for Your devices and abilities (cua-driver, harness logins, device kind). */
  deviceProbes?: Partial<DeviceProbes>;
  /** D228: test seam for 从外面连's tunnel (cloudflared, its metrics, the network). */
  anywhereSys?: TunnelSys;
  anywherePollMs?: number;
  /** D293 test seam: how the home checks one of its ways (none in tests: no network). */
  reachCheck?: (url: string) => Promise<boolean>;
  anywhereStartMs?: number;
  anywhereStepWaitMs?: number;
  /** Test seams for connections: the MCP link, and the oo CLI's config. */
  connectionLinker?: Linker;
  ooSource?: OoSource;
  /** D193 test seams: how OAuth sign-in reaches the server, and ms per second of its poll interval. */
  oauthFetch?: (url: string, init?: RequestInit) => Promise<Response>;
  signInMsPerSec?: number;
  /** Test seam for New task (D128): how newtask.ts runs its repo commands. */
  git?: GitRun;
  /** D197 test seam: the workers as New task and projects see them (names, a folder read there). */
  newTaskComputers?: NewTaskComputers;
  /**
   * D298: the partner's first words. Present: said once when an app opens a fresh conversation
   * (main.ts turns them on); `home` and `env` say whose agents' records to read (tests: a scratch
   * home with fake Claude Code and Codex folders). Absent: no first words.
   */
  firstWords?: { home?: string; env?: Record<string, string | undefined> };
  /** D566 test seams: how `nmem` runs for keeping files in Mem (a fake nmem). */
  memFiles?: Partial<Pick<MemFilesDeps, "run" | "bin">>;
  /** D298 test seams for a pasted key: the network, and which agents this computer can run. */
  keyFetch?: typeof fetch;
  keyCanRun?: (h: HarnessId) => boolean;
  /** D440 test seams: putting the agent a key needs on the home (default: D363's install of pi into its tools folder), and its time zone. */
  keyPrepare?: (h: HarnessId) => Promise<boolean>;
  keyTz?: () => string | undefined;
  /** D204 test seam: the home's own Ducter folder and its projects (default: <Ducter folder>/projects here). */
  homeRepos?: () => FolderProjects;
  /** D395 test seam: the home's own clones of a repository, and whether its git can read it (default: this computer's code folders; none in tests). */
  homeClones?: (remote: string, probe: boolean) => Promise<ClonesAnswer>;
  /** D395 test seam: what a folder on the home is (default: git here). */
  homeFolderInfo?: (path: string) => Promise<FolderInfo>;
  /** D476 test seam: the other names the home is called by (default: its host name; none in tests). */
  hostAliases?: string[];
  /** D204 test seam: clone into the home's own Ducter folder (default: git, with this computer's sign-in). */
  cloneHome?: (address: string) => Promise<CloneResult>;
  /** D203 test seam: the home's own subfolders for 找一个文件夹… (default: this computer's home folder). */
  browseHome?: (path: string | undefined) => BrowseResult;
  /** D272 test seam: make a folder in the home's own Ducter folder (default: <Ducter folder>/projects here). */
  newFolderHome?: (name: string) => NewFolderResult;
  /** D272 test seam: the home's own GitHub sign-in (default: this computer's gh). */
  gitLoginHome?: GitLogin;
  /** D345 test seam: puts gh on the home (default: Homebrew or GitHub's own build; tests: none). */
  ghInstaller?: GhInstaller;
  /** D341: 待办来源 / To-do sources: the seams (a fake gh, a scratch home for Obsidian's vault list, the look's pace). Tests default to no gh and no vaults. */
  taskSources?: Partial<Pick<TaskSourcesDeps, "ghRun" | "ghEnv" | "home" | "pollMs" | "boundMs" | "quietMs" | "today" | "now">> & { /** D359: the model the pile sorts and pre-reads with (tests, demos: a fake). */ ask?: import("./task-sources/pile.ts").Ask };
  /** D202 test seam: each agent's models on each computer (else read from the agents themselves). */
  models?: ModelCatalog;
  /** D148 test seams: the release feed, the update side effects, how this process updates. */
  /** D205: the persona's Bridge connection (bridge-link.ts): tests pass a fake nmem. */
  /** D340: whether this home connects to the person's Mem by itself (default: connectsByItself(dataDir)). */
  bridgeByItself?: boolean;
  bridgeLink?: { run?: NmemCall; env?: Record<string, string | undefined>; exec?: import("./bridge-link.ts").MemExec; sys?: import("./mem-cli.ts").MemSys };
  /** D368: Nowledge Mem's Working Memory, read-only: tests and the eval pass a fake nmem (else bridgeLink's, else none in tests). */
  workingMemory?: { run?: NmemCall; ttlMs?: number };
  /** D569: the partner's judge for Nowledge Mem's asks (tests and demos: a fake; else the cheap model, never in a test). */
  memAdvise?: (prompt: string) => Promise<string>;
  /** D380: the quick web look (tests, the eval and demos: a fake; else one on the agent the partner thinks with). */
  webLook?: import("@ducter/protocol/src/internal.ts").WebLookPort;
  /** D218: seams for the own-number phone (tests and demos: a fake phone, a loopback cable, a fake voice engine). */
  ownNumber?: Partial<import("./phone-own/index.ts").OwnPhoneDeps>;
  update?: { fetch?: ReleaseFetch; sys?: UpdateSys; run?: UpdatesDeps["run"]; how?: import("@ducter/protocol").UpdateHow; version?: string; homeName?: string; execPath?: string; autoEveryMs?: number; graceMs?: number; criticalWaitMs?: number };
  /** D156 test seams: the channels' feed, the agents' updaters, this machine's copies. */
  /** D224 test seams: how often a running plan looks again, and the night's look. */
  updateAll?: { tickMs?: number; nightEveryMs?: number; tz?: string };
  agents?: { fetch?: ReleaseFetch; sys?: UpdateSys; which?: (c: string) => string | null; detect?: AgentUpdatesDeps["detect"]; loggedIn?: AgentUpdatesDeps["loggedIn"]; exists?: (p: string) => boolean; settleMs?: number; autoEveryMs?: number };
  /** D363 test seams: putting agents on the home (default: the real network and npm, never in tests). */
  /** D363 test seams; D518: signedIn (the agent's own check), waitMs and checkMs (how long a sign-in and a pasted code wait). */
  agentSetup?: { sys?: import("./agent-setup.ts").AgentSetupSys; signedIn?: (h: string) => Promise<boolean | "unknown">; waitMs?: number; checkMs?: number };
  /** D169 test seams: the Mem plugin check on the home (default: the real `nmem`, never in tests). */
  /** D393: test seams for the Mem relay (mem-relay.ts): the home's credential, the upstream fetch, the plugin's folder. */
  memRelay?: { credential?: () => import("./mem-relay.ts").MemCredential | undefined; fetch?: typeof fetch; kitDir?: (harness: string) => string | undefined };
  memPlugins?: { inspectLocal?: () => Promise<Record<string, import("@ducter/protocol").MemPluginView> | undefined>; checkUpdates?: () => Promise<Record<string, string> | undefined>; everyMs?: number; now?: () => number; connected?: () => boolean; connectLocal?: (args: string[]) => Promise<{ code: number; out: string; err: string } | undefined>; /** D480: the mailbox look on the home itself (demos, tests; never the real nmem then). */ bridgeLookLocal?: () => Promise<import("@ducter/protocol/src/mem-plugins.ts").MemBridgeLook | undefined> };
  /** D151 test seams for Ducter's own browser (false: none). */
  browser?: false | Partial<Omit<DucterBrowserOptions, "mcp" | "log" | "tasks" | "decisions" | "persona" | "dataDir">>;
  /** D217: Ducter's phone (用手机); false leaves it out (tests). */
  ownPhone?: false | Partial<Omit<DucterPhoneOptions, "mcp" | "log" | "tasks" | "decisions" | "dataDir">>;
  /** D253: test seams for the person's own phone's loan (its timings). */
  handset?: Partial<Pick<import("./handset/index.ts").HandsetsOptions, "callMs" | "beatMs" | "quietMs" | "lostMs" | "graceMs" | "idleMs" | "recordWaitMs" | "recordAskMs" | "endedMs" | "pauseMs">>;
  /** D235: 用电脑 / Use the computer test seams (a fake cua-driver; false leaves it out). */
  computer?: false | Partial<Omit<ComputerUseOptions, "mcp" | "log" | "tasks" | "dataDir">>;
  /** The machine's platform as Devices sees it (tests: "linux"). */
  platform?: string;
  /** Work over time test seams (D112-D114): fake commands, a lower look floor, the judge. */
  /** D511: the cheap model's reading of a Keep's end (tests and demos pass a fake; else the partner's agent's). */
  keeps?: { endAsk?: import("./keeps.ts").KeepEndAsk; roundAsk?: import("./keeps.ts").KeepRoundAsk; rulesAsk?: import("./keeps.ts").KeepRulesAsk };
  /** D522 test seam: the slug writer's model (a fake in tests; else the cheapest model of the partner's agent). */
  branchAsk?: (prompt: string) => Promise<string>;
  work?: { exec?: import("@ducter/protocol/src/checks-run.ts").Exec; /** D429 test seam: the move of a late loop to an awake computer (the real one is task_switch's). */ loopsMove?: import("./loops.ts").LoopWhere["move"]; minEveryMs?: number; judgeMinMs?: number; restartLookMs?: number; ownedEveryMs?: number; defaultZone?: string; judge?: import("./waiters.ts").Judge; connectionFetch?: (url: string, init: RequestInit) => Promise<Response> };
  /** D165 test seams: the cheap triage and the bar (faked in tests; real ones need the runner's harness), the month's budget. */
  proactive?: { triage?: Triage; judge?: FindJudge; drafter?: import("./proactive/reply.ts").Drafter; spotter?: import("./proactive/wider.ts").Spotter; cross?: import("./proactive/cross.ts").CrossAsk; monthTokens?: number; zone?: string };
  /** D458 test seam: a fake Mem the offers read (the partner sets the real one with setMemLook). */
  memLook?: MemLookPort;
  /** D276 test seams for 聊天软件 / Chat apps: the adapters against fake servers, the outbox's sleep. */
  channels?: Pick<ChannelDeps, "make" | "sleep" | "gapMs" | "openUrl" | "wechat">;
}

export interface Core extends CoreApi {
  /** D277: a chat app reaches the person now (a Mac app's iMessage bridge says on). */
  channelUp(via: string): boolean;
  /** D226: the harness and model the partner thinks with now (triage, the bar and the cheap judge use it). */
  brainInUse(): { harness: HarnessId; model?: string };
  log: SqliteLog;
  tasks: CoreRegistry;
  mcp: CoreMcpHub;
  decisions: Decisions;
  living: Living;
  devices: DeviceAuth;
  workers: Workers;
  /** 你的设备和本事 / Your devices and abilities. */
  devicesView: DevicesView;
  waiters: Waiters;
  /** Waiters, until loops and routines (D112-D114). */
  work: Work;
  /** D285, D427: 一直在跑的 / Ongoing (routines and tasks in rounds, their health). */
  ongoing: import("./ongoing.ts").Ongoing;
  push: PushStore;
  pusher: Pusher;
  /** D276: 聊天软件 / Chat apps (channels/). */
  channels: Channels;
  /** The partner's settings (D71). */
  settings: SettingsStore;
  /** D205: the persona's Bridge connection (bridge-link.ts). */
  bridgeLink: import("./bridge-link.ts").BridgeLink;
  /** 你的规则 / Your rules and who does the tasks (D89). */
  rules: RulesStore;
  /** D381: 置顶 / Pinned, at the top of the default conversation. */
  pins: PinsStore;
  /** D405: 小应用 / Apps the partner made for the person (apps.ts). */
  apps: AppsStore;
  /** D379: who does which work, said and never saved as a rule. */
  said: SaidStore;
  /** D413: 不用问我的 / Without asking: what the person said may go without asking. */
  standing: StandingStore;
  loadout: Loadout;
  /** The user's connections (D96). */
  connections: ConnectionsStore;
  /** D193: phone calls through the calling connection. */
  phone: Phone;
  /** D218: calls from the owner's own phone and number. */
  ownNumber: import("./phone-own/index.ts").OwnPhone;
  /** D165: what Ducter notices in them, and how it says so. */
  proactive: Proactive;
  /** D222: the person's calendars as one day, and changes behind a Go. */
  calendar: Calendar;
  /** D341: 待办来源 / To-do sources: the person's to-dos in other apps and the tasks bound to them. */
  taskSources: TaskSources;
  /** D360: groups of tasks that are one piece of work, and the members held in line. */
  taskGroups: TaskGroups;
  /** D426: what one message asked for, line by line, under it; and the hold on single lines' successes. */
  asks: Asks;
  /** D299: the sessions the person ran in their own agents here; D376: found and carried on from the conversation. */
  outside: import("./outside.ts").Outside;
  /** D383: 给你做的 / Made for you: what Ducter made, found again by words, kind and time (read from the Log). */
  made: Made;
  /** D566: what Ducter made, kept in the person's Nowledge Mem (on a tap, the partner's word, or the Settings default). */
  memFiles: MemFiles;
  /** D391: 做过的事 / Past tasks for the partner (task_find), and 从这一步重来 / Redo from here (task_fork). */
  past: import("./past.ts").Past;
  /** D285: the person's marks on tasks (a star, a name; D514: keep the working copy). */
  marks: import("./past.ts").Marks;
  redo: import("./redo.ts").Redo;
  /** What each repo task changed so far (D128). */
  changes: Changes;
  /** D148: updating devices in place, and the newest release. */
  updates: Updates;
  release: ReleaseWatch;
  /** D156: the AI agents' own versions and their updates. */
  agents: AgentUpdates;
  /** D224: 全部更新 / Update all. */
  updateAll: UpdateAll;
  /** D169: Nowledge Mem's plugin in each device's own agents. */
  memPlugins: MemPlugins;
  /** D151: Ducter's own browser. */
  ducterBrowser?: DucterBrowser;
  /** D217: Ducter's phone (用手机). */
  ducterPhone?: DucterPhone;
  /** D238: the person's own phones (用这台手机). */
  handsets: import("./handset/index.ts").Handsets;
  /** D235: 用电脑 / Use the computer. */
  computer?: ComputerUse;
  /** D191: 密码和银行卡 / Passwords & cards (D336; Autofill in code). */
  autofill: Autofill;
  /** D539: keys copied between the person's computers. */
  keyCopy: import("./key-copy.ts").KeyCopy;
  port: number;
  url: string; // ws URL for clients
  setRunner(r: Runner): void;
  /** D228: 从外面连 / From outside (the tunnel and its guided setup). */
  anywhere: AnywhereCtl;
  setPartner(p: Partner): void;
  /** D524: memory is low: drop what can be read again (the outside agents' session records). */
  shedCaches(): void;
  stop(): Promise<void>;
  /** D309: 伙伴们 / Partners. */
  partners: Partners;
  /**
   * D312: how another partner's session is made (main.ts: createPartner on its view). Each one
   * starts on its first trigger (or at once when it ran before, so a restart picks up what it
   * was doing) and parks itself when idle, like the default.
   */
  setPartnerFactory(make: PartnerFactory): void;
  /** D312: the core another partner's session runs on (tests, the eval). */
  partnerView(id: string): CoreApi;
  /** D312: another partner's own folder (session state, its Mem identity): <dataDir>/partners/<id>. */
  partnerDir(id: string): string;
  /** D312: its Mem identity, once bound (main.ts binds it when Mem is on). */
  setPartnerMem(id: string, mem: MemIdentity | undefined): void;
  /** D312: the other partners' sessions running now, by id (tests). */
  partnerSessions(): Map<string, Partner>;
  /** D486: another partner's own Mem bundle as identity text (main.ts reads it at its session's start). */
  setPartnerBundle(id: string, text: string | undefined): void;
  /** D538: the Mem client the person's computer rules are mirrored through, while Mem is on (main.ts). */
  setPlacementMem?(c: PlacementMemClient | undefined): void;
  /** D486: removes another partner: its session ends, its conversation stays, its tasks become the default's. */
  removePartner(id: string): { ok: true } | { ok: false; error: PartnerError };
}

/** D312: makes another partner's session on its own view of core. */
export type PartnerFactory = (view: CoreApi, id: string, o: { dir: string; boot: boolean }) => Partner | Promise<Partner>;

export const defaultDataDir = () => process.env.DUCTER_DATA_DIR || join(homedir(), ".ducter");

/** D587: a done report made in a turn the person opened with their own words in the task. */
export const directDone = (r: Bodies["report"]): boolean => r.state === "done" && !!r.direct;

/** Events that wake the partner (principle 6): user messages, resolutions, non-progress reports, fired waiters. */
export function triggersPartner(e: LogEvent): boolean {
  if (e.kind === "user_msg") return true;
  // D380: a quick web look came back (its answer, or why a browsing task should take it).
  if (e.kind === "web_look") return (e.body as Bodies["web_look"]).state !== "looking";
  // D236: a question answered by a reply wakes it through the reply, which says so.
  // D481: a question closed by what happened (by "ended") wakes nobody.
  // D499: one Ducter said Go to for them (by "said") came from the partner's own turn: it wakes nobody.
  // D585: one closed by the person's own words in the task (inTask) wakes nobody: the task heard them.
  if (e.kind === "decision_resolved") return !(e.body as Bodies["decision_resolved"]).msgSeq && !(e.body as Bodies["decision_resolved"]).inTask && (e.body as Bodies["decision_resolved"]).by !== "ended" && (e.body as Bodies["decision_resolved"]).by !== "said";
  // D222: a calendar change the person said Go to that didn't go through (core ran it; success is the card's).
  if (e.kind === "connection_call") {
    const c = e.body as Bodies["connection_call"];
    return c.op === "write" && c.state === "failed" && !!c.decisionId && /calendar/.test(c.action);
  }
  // D341: new to-dos in a source the person wants told (or taken under the standing go); a write
  // they said Go to that didn't go through. A closed or edited to-do is told to its task and asked
  // on its own card, so it doesn't wake the partner.
  if (e.kind === "source_seen") return (e.body as Bodies["source_seen"]).change === "new";
  if (e.kind === "source_write") {
    const w = e.body as Bodies["source_write"];
    return w.state === "failed" && w.by === "go";
  }
  if (e.kind === "waiter") {
    const w = e.body as Bodies["waiter"];
    // A routine's watch starts a run; a task's own check wakes that task, not the partner.
    if (w.routineId) return false;
    // D297: a task waiting on its agent's limit is the task's own wait; the partner hears it only
    // when it matters (no reset time and nobody else to take it), once.
    if (w.limit) return w.state === "armed" && !!w.limit.tell;
    if (w.wakes === "task") return false; // D267: the task's own timer wakes the task
    // D483: a task's own wait that runs out goes back to the task, which decides; the partner hears its report.
    if (w.state === "expired") return !w.taskId;
    // D145: it can no longer come true (a check failed): said once, by the partner.
    if (w.state === "cancelled" && w.unmet && e.origin === "waiter" && !w.taskId) return true;
    return w.state === "fired" && !(w.taskId && (w.check || w.event));
  }
  // An `until` loop that ends (met or stopped short) is said once, by the partner (D113).
  if (e.kind === "until") return (e.body as Bodies["until"]).state !== "on" && (e.body as Bodies["until"]).stop !== "user";
  // A routine Ducter paused by itself (failures, unread, budget) is said once (D114); one that
  // keeps hitting an account error, and then works again, is said once each (D245).
  if (e.kind === "routine") {
    const r = e.body as Bodies["routine"];
    if (r.news) return r.state === "active";
    return r.state === "paused" && r.pausedBy === "system" && r.pauseReason !== "review";
  }
  // D587: a done made in a turn the person opened in the task (direct) wakes nobody: they read it
  // there, the card says it, and an ask it carries is its own card.
  if (e.kind === "report") return (e.body as Bodies["report"]).state !== "progress" && !directDone(e.body as Bodies["report"]);
  // D473: a failure Ducter couldn't mend by itself goes to the partner to rethink, with what was tried.
  if (e.kind === "mend") return (e.body as Bodies["mend"]).rung === "rethink";
  // An incoming Bridge message wakes the partner, unless it was set aside or predates Bridge (D170).
  if (e.kind === "bridge_msg") return (e.body as Bodies["bridge_msg"]).direction === "in" && !(e.body as Bodies["bridge_msg"]).state;
  // The second switch the same way: the partner offers a rule once (loadout.ts).
  if (isRuleHint(e)) return true;
  // D193: a call that ended on its own (not the owner's hang-up or Not now) is said once.
  if (e.kind === "phone_call") return callWakes(e.body as Bodies["phone_call"]);
  return false;
}

/**
 * No Origin (a native client), or this server's own origin as the browser reached it: the Host
 * itself, or another loopback name for it on the same port (localhost vs 127.0.0.1).
 */
export function sameOriginWs(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin == null) return true;
  try {
    const o = new URL(origin);
    const h = new URL(`http://${req.headers.get("host") ?? ""}`);
    if ((o.protocol !== "http:" && o.protocol !== "https:") || o.pathname !== "/") return false;
    if (o.host === h.host) return true;
    const loop = (n: string) => n === "127.0.0.1" || n === "localhost" || n === "[::1]";
    return loop(o.hostname) && loop(h.hostname) && o.port === h.port;
  } catch {
    return false;
  }
}

function loadSecret(dataDir: string): string {
  const p = join(dataDir, "mcp.secret");
  if (existsSync(p)) return readFileSync(p, "utf8").trim();
  const s = randomBytes(32).toString("base64url");
  writeFileSync(p, s, { mode: 0o600 });
  chmodSync(p, 0o600);
  return s;
}

export function startCore(opts: CoreOptions = {}): Core {
  const dataDir = opts.dataDir ?? defaultDataDir();
  // Owner-only when we create it: it holds the Log, worktrees, browser profiles, the key file.
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  // An existing dir from an older install (0755/0775) is tightened too, when it is ours.
  try {
    const st = statSync(dataDir);
    if (process.getuid && st.uid === process.getuid() && (st.mode & 0o077) !== 0) chmodSync(dataDir, 0o700);
  } catch {
    /* not ours or not a plain dir: leave it */
  }
  // D102: keys live in <dataDir>/keys.env (0600), read only by the code that passes each one to
  // its harness. Keys an older install left in <dataDir>/env move there, and any a server's unit
  // already loaded from that file leave this process's environment.
  try {
    const moved = migrateKeys(dataDir).moved;
    if (moved.length) console.log(`[ducter] moved ${moved.length} key(s) from ${join(dataDir, "env")} to ${join(dataDir, "keys.env")}`);
    scrubKeysFromEnv(readKeys(dataDir));
  } catch (err) {
    console.warn(`[ducter] could not move keys to keys.env: ${(err as Error).message}`);
  }
  const clock = opts.clock ?? realClock;
  const persona = opts.persona ?? { id: "default", name: "Ducter", identity: DEFAULT_IDENTITY };

  const log = openLog({ path: join(dataDir, "ducter.db"), persona: persona.id, clock });
  const tasks = createRegistry(log, clock, () => settings.get().quiet?.tz ?? opts.work?.defaultZone);
  let runner: Runner | undefined;
  let partner: Partner | undefined;
  const push = openPushStore(dataDir);
  const settings = openSettings({ dataDir, log, push, persona, memoryPinnedOff: process.env.DUCTER_MEMORY === "off" });
  // D309: the partners on this home (the default is persona; more only in the preview).
  const partners = openPartners({ dataDir, log, persona, ...(opts.partners !== undefined ? { on: opts.partners } : {}) });
  // D312: whose an event is, and where core's own writes to the conversation go: a write that
  // belongs to another partner's task, question, wait, call or routine (or is made while that
  // partner's tool call is handled) lands in that partner's conversation. One partner: as before.
  const isOther = (id: string | undefined) => !!id && id !== DEFAULT_PARTNER && id !== persona.id && partners.has(id);
  const whose = createWhose({ log, tasks, isOther });
  if (partners.on()) {
    const append = log.append.bind(log);
    log.append = ((input: Parameters<typeof append>[0]) => append(whose.route(input))) as typeof log.append;
    log.subscribe(whose.learn);
  }
  let limitsDecorate = (o: OnHand) => o; // D297: set once the limit waits are made (below)
  /** D292: the conversation's language now (the setting, else what the person writes in, else English). */
  const langNow = (): LangTag => talkLang(settings, log) ?? "en";
  let workRef: Work | undefined; // set below: until loops hold their tries' done reports (D113)
  const decisions = createDecisions({
    log,
    tasks,
    clock,
    // DUCTER_DECISION_DEFAULT_MS: how long a reversible default waits (soak runs and demos use seconds).
    defaultDelayMs: opts.defaultDelayMs ?? (Number(process.env.DUCTER_DECISION_DEFAULT_MS) || undefined),
    delayMs: () => settings.defaultAfterMs(),
    holds: (taskId) => Boolean(workRef?.untils.active(taskId)),
    rests: (taskId) => Boolean(workRef?.waiters.views().some((w) => w.taskId === taskId && w.state === "armed" && (w.check || w.event || w.watch || w.judge || w.wakes === "task"))),
    keeps: (taskId) => Boolean(workRef?.loops.keeps(taskId)),
    onDecision: async (taskId, text, r) => {
      if (!runner) return console.warn(`[core] no runner: decision for ${taskId} not forwarded`);
      await runner.send(taskId, text, undefined, forwardFrom(r)); // D284: a Go relayed is Ducter's words, a reply the person's
    },
  });
  const living = createLiving({ log, tasks, decisions, clock, ...(partners.on() ? { streamOf: (c: TaskCard) => channelOf(whose.ofTask(c.taskId)) } : {}) });
  const mcpSecret = loadSecret(dataDir);
  const mcp = createMcpHub({ secret: mcpSecret });
  registerCoreTools(mcp, log, tasks, partners.on() ? whose : undefined);
  // D486: make, pass to and rename partners from the conversation.
  if (partners.on()) registerPartnerTool(mcp, { log, partners });
  // D312: a task's tool calls carry the partner it is for (its memory_search is that partner's).
  mcp.setTaskPersona((taskId) => {
    const p = whose.ofTask(taskId);
    return p === DEFAULT_PARTNER ? undefined : p;
  });
  const rules = openRules(dataDir);
  // D538: a computer rule names one of the home's computers (checked when the rule is saved).
  registerRuleTools(mcp, rules, { computers: () => whereComputers() });
  // D381: what the person pinned at the top of the conversation.
  const pins = openPins({ dataDir, log });
  // D405: the apps the partner made (the partner frees an app's ask when it answers it).
  const apps = openApps({ dataDir });
  // D379: who does which work, said and never saved: read from the Log and recalled memories; Go keeps it.
  const said = openSaid({ log, rules, dataDir });
  keepSaidOnGo(log, rules);
  // D401: what the person says about who does which work is their rule the moment it lands (before
  // the partner's turn); what they said before this was built is kept now.
  keepSaidAtOnce(log, said);
  // D413: what the person says may go without asking (不用问我的), bounded by where the review routine
  // looks now. D495: the partner records it (without_asking); no code reads their words for it.
  // D499: a go kept for one task ends with it (listed and honoured while the task is open).
  const standing = openStanding({ log, dataDir, reviewOrgs: () => taskSourcesRef?.pile.reviewOrgs() ?? [], alive: (id) => ((a) => !!a && !["done", "done_claimed", "superseded", "dropped", "failed"].includes(a))(tasks.get(id)?.attention) });
  // D444: 别记这个, said right after the partner noted something, takes it back the moment it lands.
  const takeBack = takeBackAtOnce({ log, undo: (seq) => settings.undo(seq) });
  try {
    const back = said.backfill();
    if (back.length) console.log(`[said] kept ${back.length} rule(s) from what you said earlier: ${back.map((r) => r.text).join(" | ")}`);
  } catch (err) {
    console.warn("[said] couldn't keep earlier sayings:", (err as Error).message);
  }
  const connections = openConnections({ dataDir, log, linker: opts.connectionLinker, oo: opts.ooSource, fetcher: opts.work?.connectionFetch, oauthFetch: opts.oauthFetch, signInMsPerSec: opts.signInMsPerSec, clientName: "Ducter", knownName: (ts) => providerOf(ts)?.name });
  registerConnectionTools(mcp, connections);
  let workersRef: Workers | undefined;
  // D234, D235: an ability as a worker last said it (its hello, then its abilities frames).
  const workerAbility = (id: string, ability: "phone" | "computer") => workersRef?.online().find((w) => w.deviceId === id)?.hello?.abilities?.find((a) => a.id === ability);
  const work = createWork({
    log,
    tasks,
    mcp,
    runner: () => runner,
    workers: () => workersRef,
    connections,
    clock,
    persona: persona.id,
    exec: opts.work?.exec,
    minEveryMs: opts.work?.minEveryMs,
    ownedEveryMs: opts.work?.ownedEveryMs,
    judgeMinMs: opts.work?.judgeMinMs,
    restartLookMs: opts.work?.restartLookMs,
    defaultZone: opts.work?.defaultZone,
    // D528: the person's zone (theirs from Settings or their device), not the server's clock.
    zone: () => zone(),
    lang: () => langNow(),
    // D540: a round's wake carries the person's one-off ask for it (keep_change next_round) and,
    // for a review task, the standing permission to post reviews with its means.
    roundNote: (taskId, l) => {
      const ask = keepsRef?.takeNext(taskId);
      const lines = [ask ? nextRoundLine(ask, l) : "", reviewGoLine(taskId, l)].filter(Boolean);
      return lines.length ? lines.join("\n\n") : undefined;
    },
    // D429: the late line names the computer, and offers another awake one (the home first: it is the one keeping time).
    loopsWhere: {
      nameOf: (dev) => (dev === "local" ? computers.homeName() : computers.nameOf(dev)),
      awake(taskId) {
        const c = tasks.get(taskId);
        // A folder lives on its computer; a repo's move pushes its branch, which waits for its own Go (task_switch).
        if (!c || c.place.kind === "folder" || c.place.kind === "repo") return undefined;
        const on = c.place.device && c.place.device !== "local" ? c.place.device : "local";
        if (on !== "local") return { device: "local", name: computers.homeName() };
        const fits = (hs?: { id: string; installed: boolean; loggedIn: boolean }[]) => !hs?.length || hs.some((h) => h.id === c.harness && h.installed && h.loggedIn);
        const w = (workersRef?.list() ?? []).find((x) => x.id !== on && x.online && fits(x.harnesses));
        return w ? { device: w.id, name: w.name } : undefined;
      },
      async move(taskId, device) {
        if (opts.work?.loopsMove) return opts.work.loopsMove(taskId, device);
        const c = tasks.get(taskId);
        if (!c) return { ok: false, message: "I can't find that task." };
        const comps = (await loadout.computers()) ?? [];
        const to = device === "local" ? comps.find((x) => x.home) : comps.find((x) => x.id === device || x.name === device);
        if (!to) return { ok: false, message: "That computer isn't one of this home's any more." };
        return loadout.switchTask(taskId, c.harness, c.model, runner, to.id);
      },
    },
  });
  workRef = work;
  const waiters = work.waiters;
  // D128: what each repo task changed (cached counts), for On hand by project.
  let onHandChanged = () => {};
  const changes = createChanges({ log, tasks, runner: () => runner, onChange: () => onHandChanged() });
  let decorateBrowsing = (o: OnHand) => o; // D190: set once Ducter's browser is made (below)
  // D186: the projects the user added by hand; On hand shows them before their first task.
  // D197: a folder on a worker (the user's Mac, for a home on a server) is read there.
  const computers: NewTaskComputers = opts.newTaskComputers ?? {
    nameOf: (dev) => workersRef?.link(dev)?.name,
    homeName: () => savedHomeName(dataDir) ?? thisComputer(opts.update?.homeName),
    async folderInfo(dev, path, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<import("@ducter/protocol/src/folder-info.ts").FolderInfo>("folderInfo", { path }, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return "offline";
        if (isOldOp(err)) throw Object.assign(new Error(`${link.name} runs an older Ducter that can't read its folders for this home yet; update it first.`), { old: true });
        throw err;
      }
    },
    // D203: the workers, the repos each one reports, and its folders one level at a time.
    workers: () => (workersRef?.list() ?? []).map((w) => ({ id: w.id, name: w.name, online: w.online })),
    async repos(dev, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<FolderProjects>("repos", {}, ms);
      } catch (err) {
        // D204: an older Ducter without the op says so (the card asks to update it); away or slow: none.
        return isOldOp(err) ? "old" : "offline";
      }
    },
    async browse(dev, path, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<BrowseResult>("browse", path ? { path } : {}, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return "offline";
        if (isOldOp(err)) return "old";
        throw err;
      }
    },
    // D272: a new folder in that worker's Ducter folder, and its GitHub sign-in, there.
    async newFolder(dev, name, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<NewFolderResult>("newFolder", { name }, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return "offline";
        if (isOldOp(err)) return "old";
        throw err;
      }
    },
    async gitLogin(dev, action, token, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return { state: "offline" };
      try {
        return await link.call<GitLoginState>("gitLogin", { action, ...(token !== undefined ? { token } : {}) }, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return { state: "offline" };
        if (isOldOp(err)) return { state: "old" };
        throw err;
      }
    },
    // D204: 从 Git 地址加… on that worker: it clones into its own Ducter folder, with its own git.
    async clone(dev, address, ms) {
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<CloneResult>("clone", { address }, ms);
      } catch (err) {
        if ((err as { offline?: boolean }).offline) return "offline";
        if (isOldOp(err)) return "old";
        throw err;
      }
    },
  };
  // D455: the folders this computer lets Ducter look through and add (DUCTER_FOLDER_ROOTS, set here).
  const homeRoots = folderRoots();
  const projects = createProjects({
    dataDir,
    ...(opts.git ? { git: opts.git } : {}),
    onChange: () => onHandChanged(),
    remote: (dev, path) => computers.folderInfo(dev, path, 15_000),
    ...(homeRoots.explicit ? { allowed: (p: string) => insideRoots(p, homeRoots.roots) } : {}),
  });
  // D193: phone calls (the partner drafts; the owner's Go places; Ducter polls and keeps the rails).
  let autofillRef: Autofill | undefined;
  const savedPhone = () => {
    try {
      return autofillRef?.store.secret("me.phone") ?? undefined;
    } catch {
      return undefined;
    }
  };
  const callZone = () => settings.get().quiet?.tz ?? opts.work?.defaultZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  // D218: calls from the owner's own Android phone and SIM, plugged into this home.
  const ownNumber = openOwnPhone({
    dataDir,
    clock,
    where: () => savedHomeName(dataDir) ?? thisComputer(opts.update?.homeName),
    partnerName: () => persona.name,
    savedNumber: savedPhone,
    zone: callZone,
    neverCall,
    // D278: a Linux home is a server (devices.ts's rule): never offered as the place for the phone.
    ...(opts.platform ? { platform: opts.platform } : {}),
    ...(opts.ownNumber ?? {}),
    onChange: () => onHandChanged(), // the live call's row in On hand
  });
  const phone = openPhone({
    own: ownNumber,
    dataDir,
    log,
    connections,
    clock,
    quiet: () => push.settings().quiet,
    zone: () => settings.get().quiet?.tz ?? opts.work?.defaultZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
    partnerName: () => persona.name,
    // D208: the owner's saved phone (Your details) is their own number: no callee hours for it.
    ownNumbers: () => {
      try {
        const n = autofillRef?.store.secret("me.phone");
        return n ? [n] : [];
      } catch {
        return [];
      }
    },
    onChange: () => onHandChanged(),
    onCalling: () => devicesView?.changed(), // D199: the home's 打电话
  });
  // D360: groups of tasks that are one piece of work; the later members of a line are held here.
  // D426: the lines one message asked for; a held part that opens takes its lines with it.
  let asksRef: Asks | undefined;
  const taskGroups = createTaskGroups({ dataDir, tasks, runner: () => runner, now: () => clock.now(), changed: () => onHandChanged(), opened: (taskId, bind, group) => taskSourcesRef?.handover?.opened(taskId, bind, group), heldOpened: (key, taskId) => asksRef?.heldOpened(key, taskId) });
  log.subscribe((e) => taskGroups.onEvent(e));
  // D454: 移走 / Remove: finished cards and groups the person took off On hand.
  const onHandAway = createOnHandAway({ dataDir, now: () => clock.now(), groupOf: (id) => taskGroups.of(id)?.id, changed: () => onHandChanged() });
  log.subscribe((e) => onHandAway.onEvent(e));
  // D473, D471: a failure or a stop Ducter is mending right now is said so on its card (On hand
  // stands it at work), from the task's own newest event: a repair under way, never the rethink.
  const mendingDecorate = (o: OnHand): OnHand => ({
    ...o,
    tasks: o.tasks.map((c) => {
      if (c.attention !== "failed" && c.attention !== "blocked") return c;
      const last = log.read({ stream: `task:${c.taskId}`, kinds: ["mend", "task_state", "report"], limit: 1 })[0];
      if (last?.kind !== "mend") return c;
      const b = last.body as Bodies["mend"];
      if (b.state !== "going" || b.rung === "rethink" || b.cls === "round") return c;
      return { ...c, mending: { cls: b.cls, ...(b.how ? { how: b.how } : {}), ...(b.name ? { name: b.name } : {}) } };
    }),
  });
  // D498 (D210, D427): a working card says when this turn began (never since the task opened), and a
  // task in rounds carries its rhythm and where its rounds stand, so On hand says it as Ongoing.
  let ongoingRef: import("./ongoing.ts").Ongoing | undefined;
  // D507 (D494): which task is which helper's work (the helper's claim went out naming it), kept as the
  // Log grows, and the first messages each helper took (its week): On hand stands a helper's tasks under it.
  let helpersRef: Helpers | undefined;
  // D511: 照看 / Looking after: every routine, task in rounds and helper is a Keep (keeps.ts).
  let keepsRef: Keeps | undefined;
  let wsUp = false;
  const helperIndex = { tasks: new Map<string, string>(), ins: [] as { helper: string; at: number }[] };
  const indexHelper = (e: LogEvent) => {
    if (e.kind !== "bridge_msg") return;
    const b = e.body as Bodies["bridge_msg"];
    if (!b.helper) return;
    if (b.direction === "out" && b.taskId) helperIndex.tasks.set(b.taskId, b.helper);
    if (b.direction === "in" && !b.inReplyTo && (!b.state || b.state === "held")) helperIndex.ins.push({ helper: b.helper, at: Date.parse(e.ts) });
  };
  for (const e of log.read({ stream: "channel", kinds: ["bridge_msg"], limit: 5000 })) indexHelper(e);
  log.subscribe((e) => {
    if (e.kind !== "bridge_msg") return;
    indexHelper(e);
    onHandChanged();
  });
  /** D507: what each helper keeps now (the one model: On hand's sheet reads it, a helper's app will too). */
  const helperItemsOf = (id: string) => helperItems(id, { tasksOf: () => helperIndex.tasks, card: (t) => tasks.get(t) });
  const helperHolds = (taskId: string): boolean => {
    const id = helperIndex.tasks.get(taskId);
    return !!id && helperItemsOf(id).some((x) => x.taskId === taskId);
  };
  const helperWorks = (): HelperWork[] => (helpersRef?.views(helperCount) ?? []).filter((h) => h.state === "on").map((h) => ({ ...h, items: helperItemsOf(h.id) }));
  const helpersDecorate = (o: OnHand): OnHand => {
    const hs = helpersRef?.list() ?? [];
    if (!hs.length) return o;
    const name = new Map(hs.map((h) => [h.id, h.name]));
    const on = helperWorks();
    return {
      ...o,
      tasks: o.tasks.map((c) => {
        const id = helperIndex.tasks.get(c.taskId);
        return id && name.has(id) ? { ...c, helper: { id, name: name.get(id)! } } : c;
      }),
      ...(on.length ? { helpers: on } : {}),
    };
  };
  // D511: 看守中 / Looking after: each Keep its own sheet, and every task it owns names it.
  const keepsDecorate = (o: OnHand): OnHand => {
    const ks = keepsRef;
    if (!ks) return o;
    // D546: every partner's Keeps (D24: one On hand), each sheet carrying its own persona.
    const others = partners.on() ? partners.list().map((p) => p.id).filter((id) => isOther(id)) : [];
    const sheets = [persona.id, ...others].flatMap((id) => ks.sheets(id));
    if (!sheets.length) return o;
    const of = new Map<string, { id: string; name: string }>();
    for (const s of sheets) for (const t of s.taskIds) of.set(t, { id: s.id, name: s.title });
    return { ...o, tasks: o.tasks.map((c) => (of.has(c.taskId) ? { ...c, keep: of.get(c.taskId)! } : c)), keeps: sheets };
  };
  const turnsDecorate = (o: OnHand): OnHand => ({
    ...o,
    tasks: o.tasks.map((c) => {
      const loop = work.loops.get(c.taskId);
      const rounds = loop && loop.state !== "ended" ? ongoingRef?.rounds(c.taskId) : undefined;
      let turnAt: string | undefined;
      if (c.attention === "working" || c.attention === "queued") {
        for (const e of log.read({ stream: `task:${c.taskId}`, kinds: ["task_state"], limit: 12 }).reverse()) {
          const a = (e.body as Bodies["task_state"]).attention;
          if (a !== "working" && a !== "queued") break;
          turnAt = e.ts;
        }
      }
      return rounds || turnAt ? { ...c, ...(rounds ? { rounds } : {}), ...(turnAt ? { turnAt } : {}) } : c;
    }),
  });
  // D521: each task's background work, from its Log (its agent's background shells, subagents, watches, jobs).
  const backgroundIndex = createBackgroundIndex(log);
  log.subscribe((e) => {
    if (backgroundIndex.onEvent(e)) onHandChanged();
  });
  tasks.setDecorator((o0) => {
    const awayIds = onHandAway.tasks();
    const o = awayIds.length ? { ...o0, tasks: o0.tasks.filter((c) => !onHandAway.isTask(c.taskId)), away: awayIds } : o0;
    const on = backgroundIndex.decorate(keepsDecorate(helpersDecorate(turnsDecorate(mendingDecorate(decorateBrowsing(changes.decorate(limitsDecorate(work.decorate(o)))))))));
    const added = projects.list();
    const calls = phone.calls();
    // D312: every partner's own open questions, so On hand lists another partner's (a client leaves out the one it shows).
    const asks: PartnerAsk[] = partners.questions();
    const groups = taskGroups.list().filter((g) => !onHandAway.isGroup(g.id));
    // D481: every question open at the home, as of now: the one source of truth every client closes its stale cards by.
    const openAsks = { ids: decisions.openIds(), asOf: log.head() };
    return { ...on, ...(added.length ? { projects: added } : {}), ...(calls.length ? { calls } : {}), ...(asks.length ? { asks } : {}), ...(groups.length ? { groups } : {}), openAsks };
  });
  if (opts.work?.judge) work.setJudge(opts.work.judge);

  let proactiveRef: Proactive | undefined;
  // D388: `ducter proactive replay`, one at a time (set once the engine and its sources exist).
  let weekRef: (n?: number) => import("@ducter/protocol").WeekReport = () => {
    throw new Error("not ready yet");
  };
  let replayRef: ((o: { days?: number; web?: boolean }) => Promise<import("@ducter/protocol").ReplayReport>) | undefined;
  let calendarRef: Calendar | undefined;
  let taskSourcesRef: TaskSources | undefined;
  // D407: a routine fills a small app: the review board written from review_report, app_data for others, the offer once.
  let isReview: (taskId: string) => boolean = () => false;
  /** D540: the standing permission to post reviews, as a fact with its means, for a review task (or nothing). */
  function reviewGoLine(taskId: string, l: LangTag): string {
    if (!isReview(taskId)) return "";
    const s = standing.list().find((x) => x.action === "pr_review" && !x.taskId);
    if (!s) return "";
    const w = words(REVIEW_GO, l);
    const where = s.orgs?.length ? fill(w.where, { orgs: s.orgs.join(w.sep) }) : w.any;
    return fill(w.line, { where, said: s.text.slice(0, 200) });
  }
  const boards = createBoards({
    log,
    apps,
    persona: () => persona.id,
    lang: () => (langNow().startsWith("zh") ? "zh" : "en"),
    title: (id) => tasks.get(id)?.title,
    pile: () => taskSourcesRef?.pile,
    repeats: (id) => work.waiters.views().some((w) => w.taskId === id && w.wakes === "task" && w.state === "armed" && !w.limit),
    isReview: (id) => isReview(id),
    tell: (id, text) => void runner?.send(id, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${id} about its app:`, (e as Error).message)),
  });
  // D407: a task given an app writes its data (never its file), once a round.
  mcp.registerWhen(
    "task",
    "app_data",
    "Write this round's results into the person's small app you were given (its id came in a [Ducter] message): set {key: whole JSON value}, null removes a key. Data only; the app's look is the person's. Once a round, then wait_for the next; a round that only updated the app needs no report_to_main.",
    APP_DATA_SCHEMA,
    async (args, ctx) => {
      if (!ctx.taskId) throw new Error("app_data requires a task token");
      const a = args as { app?: unknown; set?: unknown };
      // D479: the keys come as JSON text (a schema every model family can hold).
      let set: Record<string, unknown>;
      try {
        set = jsonArg(a.set, "set") ?? {};
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
      const r = apps.fill(String(a.app ?? ""), ctx.taskId, set);
      return r.ok ? `Kept: ${r.keys.join(", ")}. Every device with the app open shows it now. Now wait_for the next round and end your turn.` : r.error;
    },
    (ctx) => !!ctx.taskId && apps.byTask(ctx.taskId).some((m) => !m.kind),
  );
  // D276: 聊天软件 / Chat apps: the person's own Telegram bot and Slack app, more windows on this
  // one conversation (channels/hub.ts). Their quiet hours and "notifications off" are push's.
  const channels = createChannels({
    dataDir,
    log,
    decisions,
    media: { put: (b, o) => media.put(b, o), path: (id) => media.path(id) },
    clock,
    quiet: () => push.settings().quiet,
    notifyOff: () => push.settings().off === true,
    // D292: the conversation's language, else this computer's (nothing said yet).
    lang: () => talkLang(settings, log) ?? normalizeTag(Intl.DateTimeFormat().resolvedOptions().locale) ?? "en",
    personaName: () => persona.name,
    // D516: every partner in the one thread of each chat app (the bot is the default's).
    partners: () => (partners.on() ? partners.list().map((p) => ({ id: p.id, name: p.name })) : []),
    // D531: each partner's own name and face where the chat app shows a sender per message (Slack).
    face: (id) => {
      const p = partners.get(id) ?? partners.get(DEFAULT_PARTNER);
      return p ? { name: p.name, look: p.look } : undefined;
    },
    openUrl: opts.channels?.openUrl ?? (() => {
      const v = anywhereRef?.view();
      return v?.state === "on" && v.hostname ? `https://${v.hostname}/` : undefined;
    }),
    ...(opts.channels?.make ? { make: opts.channels.make } : {}),
    ...(opts.channels?.sleep ? { sleep: opts.channels.sleep } : {}),
    ...(opts.channels?.gapMs !== undefined ? { gapMs: opts.channels.gapMs } : {}),
    ...(opts.channels?.wechat ? { wechat: opts.channels.wechat } : {}),
  });
  const early: LogEvent[] = []; // triggers that arrive before the partner is wired
  const trigger = (e: LogEvent) => {
    try {
      partner!.onTrigger(e);
    } catch (err) {
      console.error(`[core] partner.onTrigger failed on ${e.kind}#${e.seq}:`, err);
    }
  };
  // D312: the other partners' sessions, each started on its first trigger (others.ts below).
  const sessions = new Map<string, Partner>();
  const starting = new Map<string, LogEvent[]>(); // triggers that came while its session was being made
  let factory: PartnerFactory | undefined;
  const views = new Map<string, CoreApi>();
  const partnerDir = (id: string) => join(dataDir, "partners", id);
  /** D486: removes another partner: its session ends; its conversation stays in the Log; its tasks and routines are the default's now. */
  const removeOther = (id: string): { ok: true } | { ok: false; error: PartnerError } => {
    const r = partners.remove(id);
    if (!r.ok) return r;
    const p = sessions.get(id) as (Partner & { close?: () => Promise<void> | void }) | undefined;
    sessions.delete(id);
    views.delete(id);
    bundleOf.delete(id);
    void Promise.resolve(p?.close?.()).catch((err) => console.warn(`[core] closing partner ${id}:`, (err as Error).message));
    return { ok: true };
  };
  const startOther = (id: string, boot: boolean) => {
    if (!factory || sessions.has(id) || starting.has(id)) return;
    starting.set(id, []);
    void Promise.resolve()
      .then(() => factory!(viewOf(id), id, { dir: partnerDir(id), boot }))
      .then((p) => {
        sessions.set(id, p);
        for (const e of starting.get(id) ?? []) triggerOther(id, e);
      })
      .catch((err) => console.error(`[core] couldn't start partner ${id}:`, err))
      .finally(() => starting.delete(id));
  };
  const triggerOther = (id: string, e: LogEvent) => {
    const p = sessions.get(id);
    if (!p) {
      const q = starting.get(id);
      if (q) return void (q.length < 100 && q.push(e));
      if (!factory) return; // no way to answer yet (a stub home): its conversation is kept
      startOther(id, false);
      return void starting.get(id)?.push(e);
    }
    try {
      p.onTrigger(asSeenBy(id, e));
    } catch (err) {
      console.error(`[core] partner ${id} onTrigger failed on ${e.kind}#${e.seq}:`, err);
    }
  };
  const wake = (e: LogEvent) => {
    // D312: another partner's conversation, task, wait or routine wakes that partner, never the default.
    const who = partners.on() ? whose.ofEvent(e) : DEFAULT_PARTNER;
    if (who !== DEFAULT_PARTNER) return triggerOther(who, e);
    if (isOtherChannel(e.stream)) return;
    if (partner) trigger(e);
    else if (early.length < 100) early.push(e);
  };
  // D372: an errand's failed report that Ducter answers by retrying it on the smartest (set below).
  let kindRetryRef: KindRetry | undefined;
  // D426: before the wake below, so a report's lines are counted before it decides to hold it.
  const asks = createAsks({ log, tasks, release: (evs) => evs.forEach((e) => wake(e)) });
  asksRef = asks;
  log.subscribe((e) => asks.onEvent(e));
  const unsubscribePartner = log.subscribe((e) => {
    if (!triggersPartner(e) || !asks.wakes(e) || !work.wakes(e) || (proactiveRef && !proactiveRef.wakes(e)) || (calendarRef && !calendarRef.wakes(e)) || (taskSourcesRef && !taskSourcesRef.wakes(e)) || (kindRetryRef && !kindRetryRef.wakes(e)) || !boards.wakes(e)) return;
    wake(e);
  });

  // D191: 密码和银行卡 / Passwords & cards (D336; Autofill in code): saved sign-ins, cards and details, filled by reference in Ducter's browser.
  const autofill = createAutofill({ dataDir, persona: persona.id, mcp, log, tasks: tasks as never, ...(opts.platform ? { platform: opts.platform } : {}) });
  autofillRef = autofill;
  // D233: 密钥 / Keys a task asks the person for. No key value ever enters the Log: every event's
  // body is scrubbed of them on the way in (a command that printed one shows dots everywhere).
  // D539: keys copied between the person's computers on their Go; a task's ask_for_key looks there too.
  const keyWait = (h: string) => opts.keyWaitMs ?? MCP_CALL_WAIT[h as HarnessId]?.value ?? 50_000;
  const keyCopy = createKeyCopy({
    dataDir,
    log,
    decisions,
    tasks,
    mcp,
    workers: () => workersRef,
    homeName: () => computers.homeName(),
    computers: () => computers.workers?.() ?? [],
    lang: () => langNow(),
    waitMs: keyWait,
    ...(opts.keyCopy?.shelf ? { shelf: opts.keyCopy.shelf } : {}),
    ...(opts.keyCopy?.call ? { call: opts.keyCopy.call } : {}),
  });
  const keys = createKeys({ dataDir, mcp, log, decisions, store: autofill.store, tasks, copy: keyCopy, ...(opts.keyWaitMs !== undefined ? { waitMs: () => opts.keyWaitMs! } : {}) });
  autofill.keys = keys;
  {
    const append = log.append.bind(log);
    log.append = ((input: Parameters<typeof log.append>[0]) => append({ ...input, body: keys.scrub(input.body) })) as typeof log.append;
  }
  // D436: the media store is made further down; the browser keeps the checkout picture through this.
  const mediaRef: { store?: ReturnType<typeof createMediaStore> } = {};
  // D151: Ducter's own browser (a server's 上网): its tools are listed only for tasks attached to it.
  const browser =
    opts.browser === false
      ? undefined
      : createDucterBrowser({ dataDir, mcp, log, tasks, decisions, persona: persona.id, device: () => thisComputer(opts.update?.homeName), ...(opts.platform ? { platform: opts.platform } : {}), lang: () => { const l = settings.get().language; return intlLocale(l === "auto" ? undefined : l); }, workers: () => workersRef, workerBrowserVersion: (id) => workersRef?.online().find((w) => w.deviceId === id)?.hello?.abilities?.find((a) => a.id === "web")?.detail, scrub: (t) => autofill.scrub(t), wants: (taskId, brief, needs) => { const open = log.read({ stream: `task:${taskId}`, fromSeq: 0, limit: 1, kinds: ["task_open"] })[0]?.body as { brief?: string; needs?: TaskNeeds } | undefined; return !!(needs ?? open?.needs)?.buy || autofill.wants(brief !== undefined ? { brief } : open); }, mayPay: (taskId, site) => autofill.fill?.mayPay(taskId, site) ?? false, media: () => mediaRef.store, signInElsewhere: (taskId, site) => loadout.signInElsewhere(taskId, site, runner), chromeSites: { has: (site) => !!settings.get().chromeSites?.includes(site), add: (site) => settings.rememberChrome(site) }, tell: (taskId, text) => runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} the browser is back:`, (e as Error).message)), ...(opts.browser ?? {}) });
  if (browser) autofill.attachBrowser(browser.host);
  if (browser) decorateBrowsing = (o) => browser.decorate(o);
  // D238: 用这台手机 / Use this phone: the person's own Android phones, through the Ducter app on each.
  let deviceAuthRef: { list(): { id: string; name: string; kind: string }[] } | undefined;
  const handsets = createHandsets({
    dataDir,
    log,
    tasks,
    deviceName: (id) => deviceAuthRef?.list().find((d) => d.id === id && d.kind === "client")?.name,
    interrupt: (taskId) => runner?.interrupt(taskId) ?? Promise.resolve(),
    // The pill speaks the language of the lines the home sends it (zh and en tables; ko → en).
    language: () => { const l = settings.get().language; return l === "auto" ? undefined : pickTag(l, ["zh", "en"]); },
    tell: (taskId, text) => runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} about the phone:`, (e as Error).message)),
    ...(opts.handset ?? {}),
  });
  // D217: Ducter's phone (an Android emulator on a Mac), on this computer's card as 用手机.
  const ownPhone =
    opts.ownPhone === false
      ? undefined
      : createDucterPhone({ dataDir, mcp, log, tasks, decisions, deviceName: () => savedHomeName(dataDir) ?? thisComputer(opts.update?.homeName), ...(opts.platform ? { platform: opts.platform } : {}), tell: (taskId, text) => runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} the phone is back:`, (e as Error).message)), workers: () => (workersRef ? { link: (d) => workersRef!.link(d), ability: (id) => workerAbility(id, "phone") } : undefined), handsets: () => handsets, ...(opts.ownPhone ?? {}) });
  if (ownPhone) {
    const before = decorateBrowsing;
    decorateBrowsing = (o) => ownPhone.decorate(before(o));
  }
  // D235: 用电脑 / Use the computer: a task in a Mac app uses the person's apps on the Mac it runs on.
  const computer =
    opts.computer === false
      ? undefined
      : createComputerUse({
          dataDir,
          mcp,
          log,
          tasks,
          ...(opts.platform ? { platform: opts.platform } : {}),
          workers: () => (workersRef ? { link: (d) => workersRef!.link(d), ability: (id) => workerAbility(id, "computer") } : undefined),
          interrupt: (taskId) => runner?.interrupt(taskId) ?? Promise.resolve(),
          tell: (taskId, text) => runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} it was stopped:`, (e as Error).message)),
          // Tests with fake device probes never ask the real cua-driver.
          ...(opts.deviceProbes ? { perms: async () => undefined, ...(opts.deviceProbes.cua ? { cua: opts.deviceProbes.cua } : {}) } : {}),
          ...(opts.computer ?? {}),
        });
  if (computer) {
    const before = decorateBrowsing;
    decorateBrowsing = (o) => computer.decorate(before(o));
  }
  let devicesView: DevicesView | undefined;
  // D157: the sites Ducter's own browser on each computer is signed in to (the ranking prefers the
  // computer where the user already signed in, over their Chrome: least access that does the job).
  const sitesOn = (deviceId: string) => {
    const p = profileName(persona.id);
    try {
      return readSites(dataDir, deviceId === "local" ? p : workerProfile(deviceId, p)).map((s) => s.site);
    } catch {
      return [];
    }
  };
  // D202: each agent's models on each computer: the home's through the runner's harness port, a
  // worker's through its `models` op (an older worker can't say: the card keeps the tier table).
  const modelCatalog =
    opts.models ??
    createModelCatalog({
      async read(device, harness) {
        if (device === "local") return runner?.harness.models?.(harness);
        const link = workersRef?.link(device);
        if (!link?.online()) return undefined;
        const r = await link.call<ListedModel[] | null>("models", { harness }, 20_000).catch(() => null);
        return Array.isArray(r) ? r : undefined;
      },
      // D352: the home's agents' versions as last probed: an updated agent's list is read again at once.
      version: (device, harness) => (device === "local" ? devicesView?.harnessesNow()?.find((h) => h.harness === harness)?.version : undefined),
    });
  const loadout = createLoadout({ log, tasks, settings, rules, said, devices: () => devicesView, sites: sitesOn, models: modelCatalog, handset: () => handsets.any(), handsetOffer: () => handsets.offer(),
    // D503: the partner's own account, as last read, is kept for the partner when another way to the same model exists.
    // D536: and every agent another partner thinks with of its own.
    reserve: () => {
      const hs = new Set<string>([effectiveBrain(settings.get().brain, settings.brainChosen(), devicesView?.harnessesNow()).harness]);
      for (const p of partners.list()) if (p.brain) hs.add(p.brain.harness);
      return [...hs].map((h) => { const usage = accountUsage.peek(h)?.usage; return { harness: h, ...(usage ? { usage } : {}) }; });
    },
    limitsNow: () => agentLimits.now(),
  });
  // D157: 我要合电脑了 / Move before closing: one decision for a computer.
  const closing = createClosing({ log, tasks, loadout, runner: () => runner });
  registerClosingTool(mcp, closing, langNow);
  // D352: the partner's 换成 … / "use … for this": a task's model, effort or agent, as the person said it.
  registerSwitchTool(mcp, { loadout, tasks, models: modelCatalog, runner: () => runner });
  // D390: 用 astra 跟我聊 / "switch yourself to Opus": what the partner itself thinks with.
  registerBrainSwitchTool(mcp, { settings, models: modelCatalog, home: () => devicesView?.harnessesNow(), partners });
  // D372: an errand on a fast tier that fails or stalls carries on on the smartest, once.
  kindRetryRef = createKindRetry({ log, loadout, runner: () => runner, retell: wake });
  log.subscribe((e) => kindRetryRef?.onEvent(e));
  // D473: a task that couldn't start, or stopped without a report, is mended by Ducter first:
  // retried or its place repaired within budgets, then handed to the partner to rethink.
  const mender = createMender({ log, tasks, places: () => { try { return api.places; } catch { return undefined; } }, runner: () => runner, clock, taken: (e) => !!kindRetryRef?.took(e) });
  log.subscribe((e) => mender.onEvent(e));
  // D293: the home's own key pair (made before the Bridge link: D324 names its connection with it).
  const identity = homeIdentity(dataDir);
  // D205: Settings › 伙伴's one-tap Bridge connection for the persona, run by the home's nmem.
  // D340: only the person's own home connects to their Mem by itself; a scratch, demo or test home waits to be asked.
  const byItself = opts.bridgeByItself ?? connectsByItself(dataDir);
  const bridgeLink = createBridgeLink({
    dataDir,
    byItself: () => byItself,
    // D369: the partner's word that Mem must sort out its mailbox, said on the connected pane.
    trouble: () => settings.bridgeTrouble(),
    identity: () => (settings.memMissing() ? undefined : persona.mem?.agentId),
    // D225: before Mem is in, the row still offers to put it in; connect names the persona's own id.
    fallbackIdentity: () => identityIdFor(persona.id),
    // Tests never reach the machine's real nmem (or Mem): without a fake one injected, the row is off.
    memoryOn: () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && (process.env.NODE_ENV !== "test" || !!opts.bridgeLink?.run),
    home: () => computers.homeName(),
    // D324: the home's key (D293) names its connection, so Mem's list says which computer holds each one.
    homeFp: () => identity.fp,
    ...(opts.bridgeLink ?? {}),
  });
  bridgeLink.onChange(() => settings.bridgeChanged());
  // D494: 帮手 / Helpers: named addresses of the person's in Bridge, owned by this home (helpers.json).
  // Their addresses are made while the home's Bridge is connected; a scratch home (byItself false) waits too.
  const helpers = createHelpers({
    dataDir,
    link: () => (bridgeLink.context() ? bridgeLink : undefined),
    partnerName: () => persona.name || "Ducter",
    home: () => computers.homeName(),
    // D507: the partner's creation reply said the address was being made: when it is ready (or Mem
    // refused the name) the person hears it once, in the conversation, as the partner's own line.
    say: (h, how) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: helperSaidWords(langNow(), h, how) } }),
  });
  helpersRef = helpers;
  helpers.onChange(() => settings.bridgeChanged());
  helpers.onChange(() => onHandChanged());
  bridgeLink.onChange(() => void helpers.tick());
  bridgeLink.onMemReady(() => void helpers.tick());
  const helperTimer = setInterval(() => void helpers.tick(), HELPER_RETRY_MS);
  /** D494: a helper's work on hand (its tasks it still holds, D507) and what it took in the last 7 days, from the Log. */
  const helperCount = (id: string) => {
    const since = Date.now() - 7 * 86_400_000;
    const week = helperIndex.ins.filter((x) => x.helper === id && x.at >= since).length;
    const open = [...helperIndex.tasks].filter(([t, h]) => h === id && helperHolds(t)).length;
    return { open, week };
  };
  (helperTimer as { unref?: () => void }).unref?.();
  // D295: a glance at Mem itself for Settings › 记忆 (its count, what other AI tools saved), gated like the row.
  const memGlance = createMemGlance({
    run: opts.bridgeLink?.run ?? nmemCall({ env: opts.bridgeLink?.env }),
    on: () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && process.env.DUCTER_BRIDGE !== "0" && !settings.memMissing() && (process.env.NODE_ENV !== "test" || !!opts.bridgeLink?.run),
    changed: () => settings.bridgeChanged(),
  });
  settings.setGlance(() => memGlance.get(), memGlance);
  // D465: what Mem would like the person to settle, and the rules on, for the same page, gated like the glance.
  const memCheck = createMemCheck({
    run: opts.bridgeLink?.run ?? nmemCall({ env: opts.bridgeLink?.env }),
    on: () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && process.env.DUCTER_BRIDGE !== "0" && !settings.memMissing() && (process.env.NODE_ENV !== "test" || !!opts.bridgeLink?.run),
    changed: () => settings.bridgeChanged(),
    // D569: the partner's suggestion for each ask, on its cheap model, judged from Mem's own facts.
    advise: opts.memAdvise ?? (process.env.NODE_ENV === "test" ? undefined : async (prompt) => (await createHarnessAsk({ harness: () => runner?.harness, pick: () => brainInUse(), dataDir, cheap: true, dir: "judge", timeoutMs: 60_000, system: "You answer with one line of JSON and nothing else. You never use tools." })(prompt)).text),
    lang: () => langNow(),
  });
  settings.setCheck(() => memCheck.get(), (id, answer) => memCheck.answer(id, answer));
  // D375: Mem's own health on the home (its doctor) for the same page's Nowledge Mem head, gated like the glance.
  const memHealth = createMemHealth({
    run: opts.bridgeLink?.run ?? nmemCall({ env: opts.bridgeLink?.env }),
    on: () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && process.env.DUCTER_BRIDGE !== "0" && !settings.memMissing() && (process.env.NODE_ENV !== "test" || !!opts.bridgeLink?.run),
    agents: async () => ((await devicesView?.frame())?.devices ?? []).find((x) => x.home)?.harnesses.filter((h) => h.installed).map((h) => h.harness) ?? [],
    changed: () => settings.bridgeChanged(),
  });
  settings.setHealth(() => memHealth.get());
  // D368: the person's Working Memory (their day's focus in Mem), for the partner's L4 and the morning note; gated like the glance.
  const wmRun = opts.workingMemory?.run ?? opts.bridgeLink?.run;
  const workingMemory = createWorkingMemory({
    run: wmRun ?? nmemCall({ env: opts.bridgeLink?.env }),
    on: () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && !settings.memMissing() && (process.env.NODE_ENV !== "test" || !!wmRun),
    space: () => persona.mem?.space,
    now: () => clock.now(),
    today: () => dayKey(clock.now(), zone()),
    ...(opts.workingMemory?.ttlMs !== undefined ? { ttlMs: opts.workingMemory.ttlMs } : {}),
  });
  // D206: pictures and files, content-addressed on the home (media.ts).
  const media = createMediaStore(dataDir);
  mediaRef.store = media;
  // D293: its ways to be reached (the address book, reach-book.ts); the home's own key is made above.
  let reachRef: ReachWatch | undefined;
  const waysFrame = () => ({ t: "ways" as const, ways: reachRef?.ways() ?? [], key: identity.key, fp: identity.fp });
  // D288: each agent's account usage limits on the home, read by the agent itself and kept current by its sessions.
  const accountUsage = createAccountUsage({ read: async (h) => (await runner?.harness.accountUsage?.(h)) ?? { why: "unsupported" } });
  // D297: a task whose agent hits its usage limit waits for the reset (or is handed on) and carries on.
  // D503: first the same agent and model another way (another account on another computer), from every agent's limits as last known.
  const limitWaits = createLimitWaits({ log, tasks, waiters: work.waiters, loadout, settings, usage: accountUsage, runner: () => runner, clock, limitsNow: () => agentLimits.now() });
  limitsDecorate = (o) => ({ ...o, waiters: o.waiters.map((w) => limitWaits.decorate(w)) });
  // D478: each agent's limit per computer, a fact in the partner's world line (agent-limits.ts).
  const agentLimits = createAgentLimits({ log, tasks, waiters: () => work.waiters.views(), usage: accountUsage, home: () => devicesView?.harnessesNow(), clock });
  // D435: the partner's own agent, held after a turn failed on it; another signed-in agent answers meanwhile.
  const brainHold = createBrainHold({ log, clock, base: () => effectiveBrain(settings.get().brain, settings.brainChosen(), devicesView?.harnessesNow()).harness as HarnessId, home: () => devicesView?.harnessesNow(), rules: () => rules.list(), usage: accountUsage,
    // D446: tasks on the home waiting for their agent's reset share the partner's account there.
    waits: () =>
      work.waiters
        .views()
        .filter((w) => w.state === "armed" && w.limit && w.taskId && ((tasks.get(w.taskId)?.place as { device?: string } | undefined)?.device ?? "local") === "local")
        .map((w) => ({ harness: w.limit!.harness, ...(w.at ? { at: w.at } : {}), resetKnown: w.limit!.resetKnown })),
  });
  const workFrames: typeof work.frames = { ...work.frames, waiter: (id, action) => limitWaits.act(id, action) ?? (action === "handoff" ? Promise.resolve(false) : work.frames.waiter(id, action)) };
  // D388: the pages the last noticed call rested on (a holder: the Core is a copy of api).
  const noticedSources: { links?: { label: string; url: string }[]; whys?: { text: string; why: string }[] } = {};
  // D449: a free key's day: known, spent on what the person sees first, its reset said truly.
  const freeBudget = createFreeBudget({ dataDir, clock, log, brain: () => settings.get().brain, taskHarness: (id) => tasks.get(id)?.harness, lang: langNow });
  // D437: another AI's one look before a result goes out: its agent is the home's, its turn tool-less.
  const freshLook = createFreshLook({
    log,
    tasks,
    rules: () => rules.list(),
    home: () => devicesView?.harnessesNow(),
    ask: (who, prompt) => createHarnessAsk({ harness: () => runner?.harness, pick: () => who, dataDir, cheap: false, dir: "fresh-look", timeoutMs: 120_000, system: "You answer with one line of JSON and nothing else. You never use tools." })(prompt),
    diff: async (id) => {
      const r = runner;
      return r?.workbench ? diffFromWorkbench((req) => r.workbench!(id, req)) : undefined;
    },
    send: (id, text) => (runner ? runner.send(id, text, "queue", "ducter") : Promise.reject(new Error("no runner yet"))),
    off: () => (process.env.DUCTER_FRESH_LOOK ?? process.env.DUCTER_SECOND_LOOK) === "off",
    // D449: on a free key a result's look is skipped; an outward Go's still gets one until the day runs low.
    frugal: (by, what) => freeBudget.frugal(by.harness) && (what === "code" || freeBudget.low()),
    onFrugal: () => void freeBudget.lookSkipped(),
  });
  // D439: a document to send is checked page by page before it reaches the person; the pages are
  // drawn into the task's own evidence folder when it works on this computer.
  const docCheck = createDocCheck({
    log,
    path: (id) => media.path(id),
    picturesDir: (id, open) => {
      const dev = open?.place && "device" in open.place ? open.place.device : undefined;
      return !dev || dev === "local" ? join(dataDir, "evidence", id, "pages") : undefined;
    },
    off: () => process.env.DUCTER_DOC_CHECK === "off",
    // D449: a task on the free key: the pages are checked, never sent back for another round.
    codeOnly: (id) => freeBudget.frugal(tasks.get(id)?.harness ?? ""),
  });
  const api = { log, tasks, mcp, persona, dataDir, settings, connections, phone, bodies: loadout, said, standing, spine: log.spine, bridgeLink, helpers, media, limits: accountUsage, workingMemory, pins, apps, boards: { makeReviewBoard: (id: string) => boards.makeReviewBoard(id), isReview: (id: string) => isReview(id), offer: (id: string, k: "reviews" | "reports") => boards.offer(id, k) }, noticedSources, brainHold, freeBudget, freshLook, takenBackFrom: (seq: number) => takeBack.heardFrom(seq), docCheck: (id: string, body: Bodies["report"]) => docCheck.check(id, body), ...(opts.branchAsk ? { branchAsk: opts.branchAsk } : {}), ...(browser ? { browser: browser.port } : {}) } as CoreApi;
  // D312: with more than one partner, the default partner keeps to its own too, and a task's
  // brief and Mem identity are those of the partner it is for.
  const memOf = new Map<string, MemIdentity | undefined>();
  const otherMem = (id: string) => {
    if (!memOf.has(id)) memOf.set(id, process.env.DUCTER_MEMORY === "off" ? undefined : readMemIdentity(partnerDir(id)));
    return memOf.get(id);
  };
  if (partners.on()) api.mine = { event: (e) => whose.ofEvent(e) === DEFAULT_PARTNER, task: (c) => whose.ofTask(c.taskId) === DEFAULT_PARTNER };
  api.personaFor = (id) => (isOther(id) ? { name: partners.nameOf(id), ...(otherMem(id!) ? { mem: otherMem(id!) } : {}) } : { name: persona.name, ...(persona.mem ? { mem: persona.mem } : {}) });
  // A task's memory is recalled by the partner it is for (each partner's own Mem client).
  const taskMemOf = new Map<string, TaskMemoryPort>();
  let defaultTaskMemory: TaskMemoryPort | undefined;
  const taskMemory: TaskMemoryPort = {
    on: () => defaultTaskMemory?.on() ?? [...taskMemOf.values()].some((p) => p.on()),
    recall: (w) => (isOther(w.persona) ? taskMemOf.get(w.persona) : defaultTaskMemory)?.recall(w) ?? Promise.resolve(undefined),
  };
  Object.defineProperty(api, "taskMemory", {
    enumerable: true,
    get: () => (defaultTaskMemory || taskMemOf.size ? taskMemory : undefined),
    set: (p: TaskMemoryPort | undefined) => void (defaultTaskMemory = p),
  });
  // D458: the default partner's own read of Mem (memory_search's path), for the morning's offers; read-only.
  let memLookRef: MemLookPort | undefined = opts.memLook;
  api.setMemLook = (m) => void (memLookRef = m ?? opts.memLook);
  // D486: who the person's partners are, for every partner's [partners] line (the view sets `me`).
  if (partners.on()) api.partnersNow = () => ({ me: DEFAULT_PARTNER, list: partners.list() });
  // D486: another partner's own Mem bundle (the person's profile, its own rules), read at its session's start.
  const bundleOf = new Map<string, string>();
  /** The L1 identity of another partner: its own name, what it looks after, that the person has others, and its own Mem bundle. */
  const identityOf = (id: string) => {
    const me = partners.get(id);
    const name = me?.name ?? partners.nameOf(id);
    const others = partners.list().filter((p) => p.id !== id).map((p) => p.name);
    const base = otherIdentity(name, others, me?.about);
    const bundle = bundleOf.get(id);
    return bundle ? `${base}\n\n${bundle}` : base;
  };
  function viewOf(id: string): CoreApi {
    let v = views.get(id);
    if (!v) {
      v = partnerView({
        core: api,
        id,
        whose,
        mcp,
        name: () => partners.nameOf(id),
        identity: () => identityOf(id),
        mem: () => otherMem(id),
        activity: { set: (a) => ws.setActivity(a, id) },
        setTaskMemory: (p) => (p ? taskMemOf.set(id, p) : taskMemOf.delete(id)),
        // D536: what it thinks with, when the person gave it its own.
        brain: () => partners.get(id)?.brain,
      });
      views.set(id, v);
    }
    return v;
  }
  // D150: the one helper (brain.ts) the runner and the settings frame share.
  api.partnerFallback = () => {
    // D435: its own agent held, the next that can answer does (none: it waits, the drain holds the messages).
    const held = brainHold.now();
    if (held?.to) return { harness: held.to };
    const e = effectiveBrain(settings.get().brain, settings.brainChosen(), devicesView?.harnessesNow());
    return e.why ? { harness: e.harness } : undefined;
  };
  /** D226: what the partner thinks with now: the fallback (D150) when it applies, else the setting. */
  const brainInUse = (): { harness: HarnessId; model?: string } => api.partnerFallback?.() ?? settings.get().brain;
  // D380: a quick web look runs on the agent the partner thinks with, holding only its web tools.
  api.webLook = opts.webLook ?? createWebLook({ harness: () => runner?.harness, pick: brainInUse, dataDir });
  // 开一个任务 / New task (D128): the one opening path the card and `ducter task` share.
  // D204: the home's own Ducter folder (~/ducter, or <dataDir>/ducter for a Ducter with a data
  // folder of its own) and the projects in it; clones go there with this computer's own git.
  const homeFolder = () => ducterFolder({ dataDir }).path;
  const found = createFoundRepos({ computers, home: opts.homeRepos ?? (() => ({ folder: homeFolder(), repos: projectRepos(realFs.real(join(homeFolder(), "projects"))) })) });
  const cloneHome = opts.cloneHome ?? ((address: string) => cloneRepo(address, { dataDir }));
  // D272: a new folder in the home's own Ducter folder, and the home's own GitHub sign-in.
  const newFolderHome = opts.newFolderHome ?? ((name: string) => newProjectFolder(name, { dataDir }));
  const gitLoginHome = opts.gitLoginHome ?? createGitLogin();
  // D345: gh Ducter put in its own folder is first on its PATH (its gh calls and every task's).
  useOwnTools(dataDir);
  const ghInstaller = opts.ghInstaller ?? (process.env.NODE_ENV === "test" ? { plan: () => undefined, install: async () => ({ ok: false as const, how: "release" as const, where: "", reason: "unsupported" as const, message: "not in tests" }) } : createGhInstaller({ dataDir }));
  const newTaskDeps = { log, tasks, runner: () => runner, persona, dataDir, loadout, settings, routines: work.routines, untils: work.untils, projects, computers, models: modelCatalog, found, cloneHome, newFolderHome, gitLoginHome, ghInstaller, browseHome: opts.browseHome ?? ((p: string | undefined) => listFolders(p, homedir(), realFs, BROWSE_MAX, homeRoots.roots)), ...(opts.git ? { git: opts.git } : {}) };
  // D395: where a repository task works, from the repository itself: every computer is asked
  // which clones of it it has (the home here, a worker by its clones op), the best one wins, and
  // with none anywhere it is cloned where git can read it. task_open checks its place with it first.
  const whereTesting = process.env.NODE_ENV === "test";
  const homeClones =
    opts.homeClones ??
    ((remote: string, probe: boolean) =>
      whereTesting ? Promise.resolve({ clones: [], canRead: false }) : answerClones({ remote, probe }, { home: homedir(), ducterProjects: join(homeFolder(), "projects") }));
  const whereComputers = (): WhereComputer[] => {
    const online = new Map((workersRef?.online() ?? []).map((w) => [w.deviceId, w] as const));
    const away = workersRef?.away();
    const platform = opts.platform ?? process.platform;
    const homeServer = platform === "linux";
    return [
      // D476: the home's host name is a name the person calls it by ("hel").
      { id: "local", name: computers.homeName(), home: true, online: true, build: homeServer ? 0 : 2, aliases: opts.hostAliases ?? (whereTesting ? [] : hostAlias()), os: platform },
      // The same computers New task and the hand-over sheet list (their workers, away ones too).
      ...(computers.workers?.() ?? []).map((w) => {
        const hello = online.get(w.id)?.hello ?? away?.get(w.id)?.hello;
        const os = (hello?.os ?? "").toLowerCase();
        return { id: w.id, name: w.name, home: false, online: w.online, build: os.startsWith("darwin") || os.startsWith("mac") ? 2 : 1, ...(os ? { os } : {}) };
      }),
    ];
  };
  // D538: the awake computers without room for heavy work now, with their free memory (no frame: none).
  const noRoomNow = async () => ((await loadout.computers().catch(() => undefined)) ?? []).filter((c) => c.state === "awake" && !roomFor(c)).map((c) => ({ id: c.id, ...(c.mem ? { free: c.mem.free } : {}) }));
  const repoWhere = createRepoWhere({
    computers: whereComputers,
    async clones(dev, remote, probe, ms) {
      if (dev === "local") return homeClones(remote, probe);
      if (computers.clones) return computers.clones(dev, remote, probe, probe ? ms + 15_000 : ms);
      const link = workersRef?.link(dev);
      if (!link?.online()) return "offline";
      try {
        return await link.call<ClonesAnswer>("clones", { remote, probe }, probe ? ms + 15_000 : ms);
      } catch (err) {
        return isOldOp(err) ? "old" : "offline";
      }
    },
    async folder(dev, path, ms) {
      if (dev === "local") return (opts.homeFolderInfo ?? ((p: string) => folderInfo(p, opts.git ?? realGitInfo)))(path);
      return computers.folderInfo(dev, path, ms).catch(() => "offline" as const);
    },
    rules: () => rules.list(),
    // D510: New tasks start's computer, preferred for a repository whenever it can have the code.
    prefer: () => settings.get().newTasks?.where,
    // D538: heavy work goes where there is room (each computer's own measured memory, its heavy tasks).
    noRoom: async () => (await noRoomNow()).map((x) => x.id),
  });
  // D510: 以后默认在 hel 上跑，用 Codex: the partner sets New tasks start from the person's words.
  registerNewTasksTool(mcp, { settings, computers: whereComputers });
  // D476: the home in the partner's [devices] line: its name, the names the person calls it, its agents.
  api.homeDevice = () => {
    const home = whereComputers()[0]!;
    const hs = devicesView?.harnessesNow();
    return { name: home.name, ...(home.aliases?.length ? { aliases: home.aliases } : {}), ...(hs ? { harnesses: hs.map((h) => ({ id: h.harness, ...(h.installed !== undefined ? { installed: h.installed } : {}), loggedIn: h.loggedIn, ...(h.version ? { version: h.version } : {}), ...(h.trouble ? { trouble: h.trouble } : {}) })) } : {}), ...(homeLook ? { resources: homeLook } : {}) };
  };
  // D538: the person's computer rules (Ducter's own rules.json is their source of truth), mirrored to
  // Mem as the person's preferences while Mem is on; Mem's own labelled ones come back as hints.
  const placementMem = createPlacementMem({ dataDir, rules, on: () => (memOnRef?.() ?? false) && !!placementClient, client: () => placementClient, persona: () => persona.id });
  rules.onChange(() => void placementMem.sync().catch(() => {}));
  const hintsTimer = setInterval(() => void placementMem.refreshHints().catch(() => {}), HINTS_EVERY_MS);
  (hintsTimer as { unref?: () => void }).unref?.();
  api.placement = () => ({
    rules: rules.list().filter((r) => r.where && r.device).map((r) => ({ device: r.device!, text: r.text, ...(r.where!.avoid ? { avoid: true } : {}), ...(r.where!.heavy ? { heavy: true } : {}), ...(r.where!.web ? { web: true } : {}) })),
    hints: placementMem.takeHints(),
    heavy: Object.fromEntries(loadout.heavyNow()),
  });
  // D560: whether the partner's replies reach each of the person's agents whose Mem plugin carries Bridge,
  // as Settings › Agent messaging says it (agentBack): only what isn't whole, every turn while so.
  api.agentMail = () => {
    if (!settings.get().memory || !bridgeLink?.context()) return [];
    const open = new Set((bridgeLink.mailboxesNow?.() ?? []).filter((m) => m.open).map((m) => m.harness));
    const heard = new Set(
      log
        .read({ stream: "channel", kinds: ["bridge_msg"], limit: 2000 })
        .map((e) => e.body as Bodies["bridge_msg"])
        .filter((b) => b.direction === "in" && b.host)
        .map((b) => b.host),
    );
    const out: { harness: string; back: "next" | "old"; version?: string; update?: true }[] = [];
    // D576: pi too (MEM_BRIDGE_SKILL): 0.8.20+ is whole (nothing said); older can't pass a message at all.
    for (const h of [...Object.keys(MEM_AUTO_SESSION), ...Object.keys(MEM_BRIDGE_SKILL)]) {
      const lines = (memPluginsRef?.lines(h) ?? []).filter((x) => x.line.state === "installed" || x.line.state === "update");
      if (!lines.length) continue;
      const back = agentBack(h, { open: open.has(h), heard: heard.has(harnessName(h)), versions: lines.map((x) => x.line.version) });
      if (back !== "next" && back !== "old") continue;
      const v = lines.find((x) => x.line.version)?.line;
      out.push({ harness: h, back, ...(v?.version ? { version: v.version } : {}), ...(lines.some((x) => x.line.state === "update") ? { update: true as const } : {}) });
    }
    return out;
  };
  api.places = createPlaces({
    where: repoWhere,
    computers: whereComputers,
    rules: () => rules.list(),
    noRoom: () => noRoomNow(),
    tasks,
    opened: (id) => {
      const b = log.read({ stream: `task:${id}`, kinds: ["task_open"], limit: 50 }).at(-1)?.body as Bodies["task_open"] | undefined;
      return b ? { title: b.title, brief: b.brief, ...(b.language ? { language: b.language } : {}) } : undefined;
    },
    lang: () => langNow(),
    staged: () => taskSourcesRef?.stagedItem(),
    fs: { isDir: (p) => realFs.isDir(p), readText: (p) => realFs.readText?.(p), home: homedir() },
    // D472: a folder task's folder looked for there first.
    folder: (dev, path, ms) => (dev === "local" ? (opts.homeFolderInfo ?? ((p: string) => folderInfo(p, opts.git ?? realGitInfo)))(path) : computers.folderInfo(dev, path, ms).catch(() => "offline" as const)),
    // D477: the person's word on where, as the partner recorded it on the task (its task_open's bound).
    boundKept: (id) => {
      for (const e of log.read({ stream: `task:${id}`, kinds: ["task_open"], limit: 50 }).reverse()) {
        const b = (e.body as Bodies["task_open"]).bound;
        if (b) return b;
      }
      return undefined;
    },
  });
  // D477: the code Ducter knows is on each computer, for the partner's [devices] line: the person's
  // projects (with their origin when kept) and the repositories tasks worked in (a clone's address),
  // never a place that turned out not to be there. A fact to place work by; nothing here decides.
  api.agentLimits = () => agentLimits.now();
  // D483: what each task owns outside (its PRs), for the partner's [live] line.
  api.owned = () => work.owned.all();
  // D499: a task's ask answered for the person under what they said. The partner judges that the
  // ask is the step a kept permission names (the model judges); code checks the invariants: a task's
  // plain question, open, not the floor (plainAsk), a step a task's ask can go under, and a kept
  // permission covering that step for this task (kept for it, or for its repo's owner).
  const ownerOfTask = (taskId: string): string | undefined => {
    const p = tasks.get(taskId)?.place;
    const clone = p?.kind === "repo" ? p.clone : undefined;
    const fromClone = clone?.match(/^(?:https?:\/\/github\.com\/|git@github\.com:)?([A-Za-z0-9][\w.-]*)\/[\w.-]+?(?:\.git)?\/?$/)?.[1];
    return (fromClone ?? work.owned.of(taskId)[0]?.split("/")[0])?.toLowerCase();
  };
  // D528: the person's zone for a task's brief (a server's own clock is often UTC).
  api.zone = () => zone();
  // D539: the keys a task holds, put in its session on the computer it runs on.
  api.keyCopy = { refsFor: (id) => keyCopy.refsFor(id), withKeys: (spec) => keyCopy.withKeys(spec) };
  api.goesFor = (taskId) => [
    ...TASK_STEP_ACTIONS.flatMap((a) => {
      const s = standing.covers(a, { taskId, ...((o) => (o ? { owner: o } : {}))(ownerOfTask(taskId)) });
      return s ? [s] : [];
    }),
    // D540: a review task's brief says the person let reviews go without asking, and how they go.
    ...(isReview(taskId) ? standing.list().filter((s) => s.action === "pr_review" && !s.taskId).slice(0, 1) : []),
  ];
  api.askOf = (decisionId) => {
    const d = decisions.get(decisionId);
    if (!d?.taskId) return undefined;
    const owner = ownerOfTask(d.taskId);
    return { taskId: d.taskId, title: tasks.get(d.taskId)?.title ?? d.taskId, ...(owner ? { owner } : {}), open: decisions.isPending(decisionId) };
  };
  api.answerFor = (decisionId, action) => {
    const d = decisions.get(decisionId);
    if (!d?.taskId) return { ok: false, error: "That isn't a task's open question." };
    if (!decisions.isPending(decisionId)) return { ok: false, error: "That question was answered already." };
    if (!plainAsk(d)) return { ok: false, error: "This one is the user's own to answer (a payment, a sign-in, a key, a tap on a phone or computer, deleting, or something another AI flagged): it stays on its card." };
    if (!TASK_STEP_ACTIONS.includes(action)) return { ok: false, error: `A task's question can go only under ${TASK_STEP_ACTIONS.join(", ")}.` };
    const s = standing.covers(action, { taskId: d.taskId, ...((o) => (o ? { owner: o } : {}))(ownerOfTask(d.taskId)) });
    if (!s) return { ok: false, error: "Nothing the user said covers that step for this task. It stays on its card: ask it as usual." };
    decisions.goOnTheirWord(decisionId, { said: s.text, action, standing: s.id });
    return { ok: true, standing: s, question: d.question };
  };
  // D478, D479: a task_open that records `replaces` retires that task (replaces.ts): by its id, never by title.
  log.subscribe((e) => {
    if (e.kind !== "task_open" || e.origin !== "partner") return;
    const b = e.body as Bodies["task_open"];
    if (b.replaces) replaceTask({ tasks, away: onHandAway }, b.taskId, b.replaces);
  });
  api.codeOn = () => {
    const out = new Map<string, { device: string; name: string; remote?: string }>();
    const add = (device: string, name: string, remote?: string) => {
      const r = remote ? remoteKey(remote).replace(/^github\.com\//, "") : undefined;
      const k = `${device}\u0000${r ?? name}`;
      const had = out.get(k);
      if (!had || (!had.remote && r)) out.set(k, { device, name, ...(r ? { remote: r } : {}) });
    };
    for (const p of projects.list()) if (p.place.kind === "repo") add(p.place.device || "local", p.name, p.remote);
    for (const c of tasks.list()) {
      if (c.place.kind !== "repo" || !c.place.repoPath) continue;
      if (c.cant && (c.cant.why === "no_folder" || c.cant.why === "no_repo" || c.cant.why === "clone_failed")) continue;
      add(c.place.device || "local", basename(c.place.repoPath), c.place.clone);
    }
    return [...out.values()];
  };
  // D285: 做过的事 / Past tasks: the person's marks, and every task findable again.
  const marks = createMarks({ dataDir });
  tasks.setMarks((p, id) => marks.get(p, id));
  const past = createPast({ log, tasks, marks, computerName: (dev) => computers.nameOf(dev), round: (id) => !!keepsRef?.isRound(id) });
  // D383: 给你做的 / Made for you: the files, pictures, tables and links Ducter made, from the Log.
  const made = createMade({ log, tasks, pins: () => pins.list(), app: (id) => apps.get(id), now: () => clock.now() });
  (api as { made?: Made }).made = made;
  // D566: files kept in the person's Nowledge Mem (mem-files.ts): on a tap, when asked, or by the Settings default.
  const memFiles = createMemFiles({
    dataDir,
    log,
    media,
    memory: () => settings.get().memory && process.env.DUCTER_MEMORY !== "off",
    autoOn: () => settings.get().memFiles === true,
    memState: () => (settings.memMissing() ? "missing" : "connected"),
    identity: () => persona.mem,
    taskTitle: (id) => tasks.get(id)?.title,
    changed: () => settings.memChanged(),
    ...(opts.memFiles ?? {}),
  });
  settings.setFiles(() => {
    const trouble = memFiles.trouble();
    return { files: memFiles.view(), ...(trouble ? { fileTrouble: trouble } : {}) };
  });
  (api as { memFiles?: MemFiles }).memFiles = memFiles;
  // D299: the sessions the person ran in their own agents here (read only when Past tasks asks).
  const outsideReader = opts.localAgents ?? (process.env.NODE_ENV === "test" || process.env.DUCTER_OUTSIDE === "0" ? createLocalAgents({ home: join(dataDir, "no-outside"), env: {} }) : createLocalAgents(process.env.DUCTER_OUTSIDE_HOME ? { home: process.env.DUCTER_OUTSIDE_HOME, env: {} } : {}));
  // D298: the first words read the same records (D299's reader), or a scratch home's in tests.
  const firstReader = opts.firstWords?.home ? createLocalAgents({ home: opts.firstWords.home, env: opts.firstWords.env ?? {} }) : outsideReader;
  const outside = createOutside({ reader: outsideReader, dataDir, log, tasks, ducterFolder: homeFolder, language: () => languageOf("", settings), looks: () => settings.localAgents(), computer: () => computers.homeName(), workers: () => workersRef });
  // D327: what the first words may say about the records: whether there are any (file times alone),
  // what they offer once the person asks, the home's name, and forgetting what was read.
  const firstWordsDeps = opts.firstWords
    ? {
        projects: () => recentFolders(firstReader, { exclude: [dataDir, homeFolder()], leftOut: outside.leftOut, ...(opts.firstWords?.home ? { home: opts.firstWords.home } : {}) }),
        has: () => firstReader.active({ since: Date.now() - 14 * 86_400_000, skip: [dataDir, homeFolder(), tmpdir(), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"] }),
        computer: () => computers.homeName(),
        forget: () => {
          firstReader.forget();
          outsideReader.forget();
        },
        ...(opts.firstWords.home ? { home: opts.firstWords.home } : {}),
      }
    : undefined;
  // D332: whether the person runs their own AI agents here (Claude Code, Codex, pi): the agents with a
  // record changed in the last 14 days, by file times alone (D327's rule), Ducter's own and temporary
  // folders left out (unless the records read are themselves in one: a test's, the demo's). Settings
  // shows 和你的其他 agent 通信 / Talk with your other agents to them; read only while looking at records is on; a minute's cache.
  let ownCache: { at: number; agents: import("./local-agents/index.ts").LocalAgent[] } | undefined;
  const ownAgents = () => {
    if (!settings.localAgents()) return [];
    if (ownCache && Date.now() - ownCache.at < 60_000) return ownCache.agents;
    const roots = Object.values(outsideReader.roots()).map((r) => resolve(r));
    const under = (p: string, root: string) => p === root || p.startsWith(root.endsWith(sep) ? root : root + sep);
    const skip = [dataDir, homeFolder(), tmpdir(), "/tmp", "/private/tmp", "/var/folders", "/private/var/folders"].map((p) => resolve(p)).filter((t) => !roots.some((r) => under(r, t)));
    let agents: import("./local-agents/index.ts").LocalAgent[] = [];
    try {
      agents = outsideReader.active({ since: Date.now() - 14 * 86_400_000, skip });
    } catch {
      /* unreadable records: nothing to say */
    }
    ownCache = { at: Date.now(), agents };
    return agents;
  };
  // D332: the partner connects with the person's own agents by itself once Mem is ready (no tap), says so
  // once, and the one switch (peers.reach) connects or revokes.
  const bridgeAuto = createBridgeAuto({
    link: bridgeLink,
    on: () => settings.get().peers?.reach !== "off",
    own: () => ownAgents().map((a) => harnessName(a)),
    dataDir,
    byItself: () => byItself,
    say: (agents) => log.append({ stream: "channel", origin: "partner", kind: "ai_msg", body: { text: bridgeOnWords(langNow(), agents) } }),
  });
  let reachWas = settings.get().peers?.reach;
  settings.onChange(() => {
    const r = settings.get().peers?.reach;
    if (r === reachWas) return;
    reachWas = r;
    void bridgeAuto.switched(r !== "off");
  });
  let autoAt: ReturnType<typeof setTimeout> | undefined;
  const autoSoon = () => {
    clearTimeout(autoAt);
    autoAt = setTimeout(() => void bridgeAuto.tick(), 1500);
    (autoAt as { unref?: () => void }).unref?.();
  };
  bridgeLink.onChange(autoSoon);
  autoSoon();
  // D300: 替你做过的 / Done for you: every outward action, read from the Log and Autofill's uses.
  const did = createDid({ log, tasks, uses: () => autofill.store.view().uses, deviceName: (dev) => (dev === "local" ? computers.homeName() : computers.nameOf(dev)), folder: (id) => changes.folder(id), now: () => clock.now() });
  registerDidTool(mcp, did, () => clock.now());
  // D285: 一直在跑的 / Ongoing: routines and tasks that look again on their own, paused and resumed.
  const ongoing = (ongoingRef = createOngoing({ dataDir, log, tasks, waiters: work.waiters, routines: work.routines, marks, clock, onChange: () => (ws.ongoingChanged(), apps.liveMoved()), reviews: (id) => taskSourcesRef?.pile.standing(id), asking: (id) => !!taskSourcesRef?.pile.asking(id), app: (id) => ((m) => (m ? { id: m.id, name: m.name } : undefined))(boards.appOf(id)), loops: work.loops, deviceName: (dev) => (dev === "local" ? computers.homeName() : computers.nameOf(dev)) }));
  // D511: 照看 / Looking after. Every routine, task in rounds and helper becomes a Keep on start (the
  // migration: their own records stay as they are), and whatever becomes one later is kept at once.
  const keeps = (keepsRef = createKeeps({
    log,
    tasks,
    routines: work.routines,
    loops: work.loops,
    helpers: () => helpersRef,
    ongoing: () => ongoingRef,
    helperTasks: () => helperIndex.tasks,
    helperWeek: (id) => helperCount(id).week,
    // D533: a task in rounds moved on its page (another computer, another agent), as task_switch moves it.
    move: async (taskId, to) => {
      const c = tasks.get(taskId);
      if (!c) return { ok: false, message: "I can't find that task." };
      const harness = to.harness ?? c.harness;
      return loadout.switchTask(taskId, harness, harness === c.harness ? c.model : undefined, runner, to.device);
    },
    deviceName: (dev) => (dev === "local" ? computers.homeName() : computers.nameOf(dev)),
    persona: () => persona.id,
    isOf: (p, want) => (want === persona.id ? !isOther(p) : p === want),
    lang: () => langNow(),
    zone: () => opts.work?.defaultZone,
    clock,
    onChange: () => (onHandChanged(), wsUp && ws.ongoingChanged()),
    // D540: a one-off ask while a round is under way reaches it now.
    tell: (taskId, text) => (runner ? runner.send(taskId, text, undefined, "partner").then(() => true) : Promise.resolve(false)),
  }));
  let keepSync = false;
  const syncKeeps = () => {
    if (keepSync) return;
    keepSync = true;
    queueMicrotask(() => ((keepSync = false), keeps.sync()));
  };
  log.subscribe((e) => void ((e.kind === "task_loop" || e.kind === "routine") && syncKeeps()));
  helpers.onChange(syncKeeps);
  api.keeps = keeps;
  // D514: what holds a task's working copy beyond its own state, for the runner's tidy.
  api.tidyHold = (taskId) =>
    holdOf(taskId, {
      waiting: (id) => work.waiters.views().some((w) => w.taskId === id && w.state === "armed"),
      keepLife: (id) => ((k) => (k ? keeps.get(k.id)?.life : undefined))(keeps.ofTask(id)),
      openPrs: (id) => work.owned.of(id),
      mark: (id) => ((c) => (c ? marks.get(c.persona, id) : undefined))(tasks.get(id)),
    });
  if (opts.keeps?.endAsk) keeps.setEndAsk(opts.keeps.endAsk);
  if (opts.keeps?.roundAsk) keeps.setRoundAsk(opts.keeps.roundAsk);
  if (opts.keeps?.rulesAsk) keeps.setRulesAsk(opts.keeps.rulesAsk);
  // D533: a round of a Keep the person changed hears its rules as they are now.
  work.setKeepRules((of) => keeps.rulesFor(of));
  // D511: the partner's keep_list and keep_change (keep_make is the partner's own, with its receipt card).
  registerKeepTools(mcp, keeps, () => persona.id, (name) => (name === "local" || name === computers.homeName() ? "local" : ((computers.workers?.() ?? []).find((w) => w.name === name || w.id === name)?.id ?? (computers.nameOf(name) ? name : undefined))));
  // D407: an app given to a task (or taken back) changes what its Ongoing card opens.
  apps.onChange((c) => void (c.kind === "give" && setTimeout(() => ws.ongoingChanged(), 0)));
  // D422: an app's state has one truth each. Kept current: the Ongoing card of the task that keeps
  // it (running, resting until its next time, paused, its last round failed). Being changed: the
  // person's words about it are in and the partner hasn't answered yet.
  apps.keptBy((taskId) => {
    const it = ongoing.list(persona.id).find((i) => i.id === taskId || i.taskId === taskId);
    if (!it) return undefined;
    const runs = [...it.runs].reverse();
    const lastRun = runs.find((r) => r.state !== "running" && r.state !== "skipped");
    const lastGood = runs.find((r) => r.state === "done" || r.state === "met" || r.state === "looked");
    const state = it.state === "running" ? "running" : it.state === "paused" ? "paused" : lastRun?.state === "failed" ? "failed" : "resting";
    const why = state === "failed" ? lastRun?.line : state === "paused" ? it.pauseWhy : undefined;
    return { task: taskId, title: it.title, state, of: { kind: it.kind, id: it.id }, ...(lastGood ? { last: lastGood.at } : {}), ...(it.nextAt && state !== "paused" ? { next: it.nextAt } : {}), ...(why ? { why: why.slice(0, 140) } : {}) };
  });
  log.subscribe((e) => {
    if (e.kind === "user_msg" && e.origin === "user") {
      const a = (e.body as Bodies["user_msg"]).app;
      if (a && !a.ask) apps.changing(a.id, true);
    } else if (e.kind === "ai_msg" && e.stream === "channel") apps.answeredAll();
  });
  // D394: a review round's card asked or answered moves its task between 等你 and 等下一次.
  const roundCards = new Set<string>();
  log.subscribe((e) => {
    const id = e.kind === "decision" && (e.body as Bodies["decision"]).src?.kind === "reviews" ? (e.body as Bodies["decision"]).decisionId : e.kind === "decision_resolved" ? (e.body as Bodies["decision_resolved"]).decisionId : undefined;
    if (!id || (e.kind === "decision" ? (roundCards.add(id), false) : !roundCards.delete(id))) return;
    setTimeout(() => ws.ongoingChanged(), 30);
  });
  // D391: 从这一步重来 / Redo from here: a new task from a step of an earlier one (its brief, its code from that commit).
  const redo = createRedo({ past, tasks, open: (i) => openYourTask(newTaskDeps, i), lang: (w) => languageOf(w, settings), ...(opts.git ? { git: opts.git } : {}) });
  const newTask = {
    // D285: 带着它开新任务 / New task from this: the brief carries what that task found.
    open: (i: NewTaskInput) => openYourTask(newTaskDeps, i.from && tasks.get(i.from) ? { ...i, brief: past.seed(i.from, i.words, languageOf(i.words, settings)) } : i),
    options: (p?: Place) => newTaskOptions(newTaskDeps, p),
    // D186: a folder becomes a project; answered as the place the card then offers.
    async addProject(path: string, device?: string) {
      const r = await projects.add(path, device);
      if (!r.ok) return { ok: false as const, reason: r.reason, message: r.message };
      const same = (p: Place) => JSON.stringify(p) === JSON.stringify(r.project.place);
      const fallback = { place: r.project.place, name: r.project.name, added: true, ...(r.info.defaultBranch ? { defaultBranch: r.info.defaultBranch } : {}), ...(r.info.branches?.length ? { branches: r.info.branches } : {}) };
      const place = (await newTaskOptions(newTaskDeps)).places.find((p) => p.added && same(p.place)) ?? fallback;
      return { ok: true as const, place };
    },
    // D203: 找一个文件夹… / Find a folder…, on the home's computer or a worker's.
    browse: (device: string | undefined, path: string | undefined) => browseFolders(newTaskDeps, device, path),
    // D204: 从 Git 地址加… / Add from a Git address…, cloned on that computer, then added there.
    clone: (device: string | undefined, address: string) => cloneProject(newTaskDeps, device, address, (path, dev) => newTask.addProject(path, dev)),
    // D272: 在 {computer} 上新建一个文件夹 / New folder on {computer}, made there, then added there.
    newFolder: (device: string | undefined, name: string) => newFolderProject(newTaskDeps, device, name, (path, dev) => newTask.addProject(path, dev)),
    // D272: 在 {computer} 上登录 GitHub / Sign in to GitHub on {computer}.
    gitLogin: (device: string | undefined, action: GitLoginAction, token?: string) => gitLoginOn(newTaskDeps, device, action, token),
    ghInstall: (onState: (s: GitLoginState) => void) => ghInstallHome(newTaskDeps, onState),
  };
  // D214: the workbench, and the previews of the pages tasks serve (each on a port of its own,
  // on the interface the home listens on).
  const hostname = opts.hostname ?? (process.env.DUCTER_HOST || "127.0.0.1");
  const previews = createPreviews({ hostname, route: (id) => runner?.pageRoute?.(id), loopback: loopbackOf });
  const workbench = createWbFrames({ log, runner: () => runner, previews, exclude: () => [port, ...(previewsPorts())] });
  const previewsPorts = () => previews.list().map((p) => p.previewPort);
  // D534: @ and / in the composers: plain lookups over what the home already holds.
  const mentions = createMentions({
    persona: () => persona.id,
    tasks: () => tasks.list(),
    task: (id) => tasks.get(id),
    past: (q, limit) => past.query(persona.id, { q, limit }).items,
    pastItem: (id) => past.item(id),
    pastReport: (id) => past.report(id),
    keeps: () => (keepsRef?.all() ?? []).map((k) => ({ id: k.keepId, title: k.title, life: k.life, persona: k.persona })),
    keep: (id) => {
      const k = keepsRef?.get(id);
      return k ? { id: k.keepId, title: k.title, life: k.life, say: keepsRef?.say(id) } : undefined;
    },
    partners: () => (partners.on() ? partners.list() : []),
    files: async (taskId, q) => {
      const a = await workbench.handle(taskId, { op: "find", q });
      return a.ok && a.answer.op === "find" ? a.answer.paths : [];
    },
    changes: async (taskId) => {
      const a = await workbench.handle(taskId, { op: "changes" });
      return a.ok && a.answer.op === "changes" ? a.answer.files.map((f) => ({ path: f.path, ...(f.adds != null ? { adds: f.adds } : {}), ...(f.dels != null ? { dels: f.dels } : {}) })) : undefined;
    },
    native: async (taskId) => runner?.native?.(taskId),
    // The person's own skills as their tasks see them: Claude Code's, else Codex's, on the home.
    skills: async () => (await runner?.inventory?.("claude-code", "skills", homedir())) ?? (await runner?.inventory?.("codex", "skills", homedir())),
  });
  const ws = createWsHandler({
    home: {
      fp: identity.fp,
      ways: waysFrame,
      // D293: a Mac app says its computer is going to sleep: so is the worker on that computer.
      sleeping: (device) => {
        const me = devices.list().find((d) => d.id === device.id);
        const computer = me?.computer || me?.name;
        for (const w of workersRef?.online() ?? []) {
          const d = devices.list().find((x) => x.id === w.deviceId);
          if (d && computer && (d.computer || d.name) === computer) workersRef?.sleeping(w.deviceId);
        }
      },
      socketsChanged: () => reachRef?.refresh(),
    },
    partners,
    removePartner: (id: string) => removeOther(id),
    core: api, workbench, bridgeLink, helpers: { views: () => helpers.views(helperCount), stop: (id: string) => helpers.stop(id), resume: (id: string) => helpers.resume(id) }, decisions, runner: () => runner, devices: () => devicesView, lend: () => lendRef, settings, connections, phone, rules, standing, pins, apps, loadout, models: modelCatalog, accountUsage, closing, work: workFrames, newTask, updates: () => updatesRef, agents: () => agentsRef, agentSetup: (device, f) => agentSetupOp(device, f), memSetup: (device, action, link) => memSetupOp(device, action, link), recordsAllow: (device, on) => recordsAllowOp(device, on), updateAll: () => updateAllRef, memPlugins: () => memPluginsRef, memHealth, anywhere: () => anywhereRef, channels, proactive: () => proactiveRef, replay: (o) => replayRef?.(o) ?? Promise.reject(new Error("not ready yet")), week: (n) => weekRef(n), repairs: (n) => { const weeks = Math.min(REPAIR_WEEKS_MAX, Math.max(1, Math.floor(n ?? REPAIR_WEEKS_DEFAULT))); const now = clock.now(); return repairReport(readRepairEvents(log, repairSince(now, weeks)), { now, weeks }); }, usage: (o) => usageDays(log, { ...o, now: clock.now() }), calendar: () => calendarRef, taskSources: () => taskSourcesRef, taskGroups: () => taskGroups, onHandAway, batchMs: opts.batchMs, autofill, keyCopy, ...(browser ? { browser } : {}), ...(ownPhone ? { ownPhone } : {}), ...(computer ? { computer } : {}), ownNumber, handsets, past: { ...past, marks, persona: () => persona.id, ongoing, keeps, outside, made, redo }, keys: { dataDir, ...(opts.keyFetch ? { fetch: opts.keyFetch } : {}), ...(opts.keyCanRun ? { canRun: opts.keyCanRun } : {}), prepare: (h) => keyPrepare(h), ...(opts.keyTz ? { tz: opts.keyTz } : {}) }, ...(firstWordsDeps ? { firstWords: firstWordsDeps } : {}), did, ownAgents, mentions });
  handsets.onChange(() => (devicesView?.changed(), ws.onHandChanged()));
  onHandChanged = ws.onHandChanged;
  wsUp = true;
  keeps.sync(); // D511: the migration, on every start (what is already a Keep is left as it is)
  // D156: a partner turn in flight keeps an update of the agent it thinks with waiting.
  let partnerTurn = false;
  api.activity = {
    set: (a) => {
      partnerTurn = !!a;
      if (!a) channels.turnEnded();
      ws.setActivity(a);
    },
  };
  const devices = openDeviceAuth(dataDir);
  deviceAuthRef = devices;
  // A device that pairs changes Your devices and abilities (远程打开 / Reach from outside).
  const gateAuth = {
    ...devices,
    redeem: (...a: Parameters<typeof devices.redeem>) => {
      const r = devices.redeem(...a);
      if (!("error" in r)) devicesView?.changed();
      return r;
    },
  };
  const gate = createGate({ auth: gateAuth, personaName: () => persona.name, pairExtra: () => ({ fp: identity.fp, key: identity.key, ways: reachRef?.ways() ?? [] }), onRedeemed: (code, d) => lendRef?.redeemed(code, d) });
  let lendRef: import("./lend.ts").Lend | undefined;
  let updatesRef: Updates | undefined;
  let agentsRef: AgentUpdates | undefined;
  let keyPrepare: (h: HarnessId) => Promise<boolean> = async () => false;
  let agentSetupOp: (device: string, f: { action: import("@ducter/protocol").AgentSetupAction; harnesses?: string[]; harness?: string; code?: string }) => Promise<{ ok: boolean; reason?: "away" | "unknown" | "failed" }> = async () => ({ ok: false, reason: "failed" });
  let updateAllRef: UpdateAll | undefined;
  let memPluginsRef: MemPlugins | undefined;
  // D366: memory on and the home's Mem connected (D169's gate), set once memPlugins is made.
  let memOnRef: (() => boolean) | undefined;
  /** D538: the Mem client computer rules are mirrored through (main.ts sets it; none in tests). */
  let placementClient: PlacementMemClient | undefined;
  let memRelayRef: import("./mem-relay.ts").MemRelay | undefined;
  let memCarriedRef: (() => boolean) | undefined;
  // D366: Nowledge Mem on a computer for tasks: the worker's own mem_setup op.
  const memSetupOp = async (device: string, action: import("@ducter/protocol").DeviceMemAction, link?: string): Promise<{ ok: boolean; reason?: "away" | "unknown" | "failed" }> => {
    if (!memOnRef?.()) return { ok: false, reason: "failed" };
    const id = devices.list().find((x) => x.kind === "worker" && (x.id === device || x.name === device))?.id;
    if (!id) return { ok: false, reason: "unknown" };
    const link0 = workers.link(id);
    if (!link0) return { ok: false, reason: "away" };
    try {
      // D370: the person pastes what Mem copies (a prompt with a token in it); the computer gets the
      // link made from it, which a Ducter there from before D370 also takes. Not one: as pasted, refused there.
      const sent = link ? (connectLinkFrom(link) ?? link) : undefined;
      await link0.call("mem_setup", { action, ...(sent ? { link: sent } : {}) }, 30_000);
      return { ok: true };
    } catch {
      // A Ducter there from before D366 doesn't know the op.
      return { ok: false, reason: "failed" };
    }
  };
  // D377: the person's yes for their own agents' records on a computer for tasks, saved there.
  const recordsAllowOp = async (device: string, on: boolean): Promise<{ ok: boolean; reason?: "away" | "unknown" | "failed" }> => {
    const id = devices.list().find((x) => x.kind === "worker" && (x.id === device || x.name === device))?.id;
    if (!id) return { ok: false, reason: "unknown" };
    const link0 = workers.link(id);
    if (!link0?.online()) return { ok: false, reason: "away" };
    try {
      await link0.call("records_allow", { on }, 15_000);
      return { ok: true };
    } catch {
      // A Ducter there from before D377 doesn't know the op.
      return { ok: false, reason: "failed" };
    }
  };
  let anywhereRef: AnywhereCtl | undefined;
  const workers = createWorkers({
    personaName: () => persona.name,
    welcome: () => ({ ways: reachRef?.ways() ?? [], key: identity.key, fp: identity.fp }),
    onUpdate: (id, name, f) => updatesRef?.fromWorker(id, name, f),
    onAgentUpdate: (id, name, f) => agentsRef?.fromWorker(id, name, f),
    // D227: a worker back after its Ducter restarted: an agent update it no longer runs died with it.
    onHello: (id, name, hello, o) => (lendRef?.hello(id), agentsRef?.reconnected(id, name, { restarted: o.restarted, running: Array.isArray(hello.agentUpdates) ? hello.agentUpdates : [], harnesses: (hello.harnesses ?? []).map((h) => ({ id: h.id, ...(h.version ? { version: h.version } : {}) })) })),
    // A disconnected (revoked) worker still resolves, as a link that is never online: its tasks
    // show 连不上 / Can't reach and new ones are refused, instead of silently running here.
    find: (d) => {
      const hit = (x: { id: string; name: string; kind: string }) => x.kind === "worker" && (x.id === d || x.name === d);
      // A renamed worker still answers to its old name (tasks placed before the rename, D84).
      const was = devices.formerly(d);
      // D310: a computer named by another of its names (its Computer Name, or its host name with or
      // without the network's domain) is still that computer, when exactly one live worker is.
      const alias = (x: { kind: string; name: string; computer?: string }) => x.kind === "worker" && (sameComputer(x.name, d) || sameComputer(x.computer, d));
      const aliased = () => {
        const all = devices.list().filter(alias);
        return all.length === 1 ? all[0] : undefined;
      };
      return devices.list().find(hit) ?? (was?.kind === "worker" ? was : undefined) ?? aliased() ?? devices.list({ all: true }).reverse().find(hit);
    },
  });
  workersRef = workers;
  api.workers = workers; // the runner places tasks on workers through this (runner/src/remote.ts)
  // D148: the newest release (no network in tests unless a feed is given) and updating in place.
  const u = opts.update ?? {};
  const testing = process.env.NODE_ENV === "test" && !u.fetch;
  const release = createReleaseWatch({ dataDir, fetch: u.fetch, timer: !testing, env: testing ? { ...process.env, DUCTER_UPDATE_CHECK: "off" } : process.env });
  const compiled = import.meta.url.includes("$bunfs") || import.meta.path.includes("$bunfs");
  const selfHow = u.how ?? updateHow({ compiled, platform: process.platform, execPath: u.execPath ?? process.execPath });
  const version = u.version ?? DUCTER_VERSION;
  const updates = createUpdates({
    dataDir,
    log,
    release,
    sys: u.sys ?? realSys,
    self: { execPath: u.execPath ?? process.execPath, how: selfHow, arch: process.arch, port: opts.port ?? Number(process.env.DUCTER_PORT || 7777), env: process.env },
    name: () => thisComputer(u.homeName),
    version,
    workers: () => ({
      online: () =>
        workers.online().map((w) => ({ id: w.deviceId, name: w.name, ...(w.hello?.version ? { version: w.hello.version } : {}), how: (w.hello?.how === "self" || w.hello?.how === "app" || w.hello?.how === "source" ? w.hello.how : "manual") as import("@ducter/protocol").UpdateHow, ...(w.hello?.asksApp ? { asksApp: true } : {}) })),
      update: async (id, args) => {
        const link = workers.link(id);
        if (!link) return { ok: false, reason: "offline" };
        return link.call<{ ok: boolean; reason?: import("@ducter/protocol").UpdateReason; detail?: string }>("update", args, 30_000);
      },
    }),
    // D227: the home's own restart also waits for an AI agent updating here (it would cut it off).
    critical: () => [...(runner?.critical?.() ?? []), ...(agentsRef?.updating("local") ?? []).map((h) => `updating ${h}`)],
    holdCritical: (why) => runner?.holdCritical?.(why),
    working: () => tasks.list().filter((c) => c.attention === "working").length,
    settings: () => settings.get(),
    ...(u.run ? { run: u.run } : {}),
    // D224: the night runs Update all's plan (home first); this one's own night look only in tests that ask.
    autoEveryMs: u.autoEveryMs ?? 0,
    ...(u.graceMs !== undefined ? { graceMs: u.graceMs } : {}),
    ...(u.criticalWaitMs !== undefined ? { criticalWaitMs: u.criticalWaitMs } : {}),
  });
  updatesRef = updates;
  // D156: the AI agents' own versions and their updates (agents.ts). No channel is read in tests
  // unless a fetch is given.
  const a = opts.agents ?? {};
  const agentTesting = process.env.NODE_ENV === "test";
  const agentSys = a.sys ?? u.sys ?? realSys;
  const agentLatest = createAgentLatest({ dataDir, ...(a.fetch ? { fetch: a.fetch } : agentTesting ? {} : { fetch: (x, i) => fetch(x, i) }), env: process.env });
  const agentProbe = { exec: (argv: string[], ms?: number) => agentSys.run(argv, { timeoutMs: ms ?? 15_000 }), which: a.which ?? ((c: string) => whichNow(c)), env: process.env, dataDir, ...(agentTesting ? {} : { piBundled: bundledPiVersion }) };
  const isWorker = (dev: string) => devices.list().some((x) => x.kind === "worker" && (x.id === dev || x.name === dev));
  const agents = createAgentUpdates({
    log,
    sys: agentSys,
    latest: agentLatest,
    name: () => thisComputer(u.homeName),
    detect: a.detect ?? ((h) => detectAgent(h, agentProbe)),
    loggedIn: a.loggedIn ?? (async (h) => (await probeHarnesses({ ...agentProbe, only: [h] }))[0]?.loggedIn ?? false),
    busy: (device, h) => agentBusy(device, h),
    hold: (h, on) => runner?.holdHarness?.(h, on),
    workers: () => ({
      online: () => workers.online().map((w) => ({ id: w.deviceId, name: w.name })),
      update: async (id, args) => {
        const link = workers.link(id);
        if (!link) return { ok: false, reason: "offline" };
        return link.call<{ ok: boolean; reason?: import("@ducter/protocol").AgentReason; detail?: string }>("agent_update", args, 30_000);
      },
      // D362: 停止; an older worker doesn't know the op (no).
      stop: async (id, args) => {
        const link = workers.link(id);
        if (!link) return { ok: false };
        return link.call<{ ok: boolean }>("agent_update_stop", args, 10_000).catch(() => ({ ok: false }));
      },
    }),
    dataDir,
    settings: () => settings.get(),
    devices: async () => ((await devicesView?.frame())?.devices ?? []).map((x) => ({ id: x.id, name: x.name, awake: x.state === "awake", harnesses: x.harnesses })),
    probed: () => devicesView?.refresh(),
    ...(a.settleMs !== undefined ? { settleMs: a.settleMs } : {}),
    autoEveryMs: a.autoEveryMs ?? 0, // D224: the night is Update all's
    ...(a.exists ? { exists: a.exists } : {}),
  });
  function agentBusy(device: string, h: string): number {
    const here = (c: { place?: Place }) => {
      const dev = c.place && "device" in c.place ? c.place.device : undefined;
      return device === "local" ? !dev || dev === "local" || !isWorker(dev) : dev === device || (!!dev && devices.list().some((x) => x.id === device && x.name === dev));
    };
    const n = tasks.list().filter((c) => c.attention === "working" && c.harness === h && here(c)).length;
    const partner = device === "local" && partnerTurn && effectiveBrain(settings.get().brain, settings.brainChosen(), devicesView?.harnessesNow()).harness === h ? 1 : 0;
    return n + partner;
  }
  agentsRef = agents;
  // D363: the person's own agent folders and Ducter's tools folder on the home's PATH too.
  if (!agentTesting) widenAgentPath({ dataDir });
  // D371: and the home looks again within seconds of a change made by hand, as a worker does (an
  // app installed or signed in since: DeepSeek Harness.app's dsh, its 登录): a cheap fingerprint
  // every 5 s (no process started), a real probe only when it moved.
  if (!agentTesting) {
    let seen = agentSignature({ dataDir, which: (c) => whichNow(c) });
    const t = setInterval(() => {
      widenAgentPath({ dataDir });
      const now = agentSignature({ dataDir, which: (c) => whichNow(c) });
      if (now === seen) return;
      seen = now;
      devicesView?.refresh();
      devicesView?.changed();
    }, 5000);
    (t as any).unref?.();
  }
  // D363: putting agents on the home itself and signing them in here (a worker has its own, the
  // agent_setup op). No network or npm in tests unless a sys is given.
  const homeSetup =
    opts.agentSetup?.sys || !agentTesting
      ? createAgentSetup({
          dataDir,
          // D416: an agent's own sign-out runs through the runner's port (OAR), once a runner is set.
          sys: opts.agentSetup?.sys ?? { ...realAgentSetupSys({ platform: process.platform, arch: process.arch, which: (c) => whichNow(c) }), logout: async (h: string) => (await runner?.harness.logout?.(h)) ?? { ok: false } },
          probe: async () => {
            widenAgentPath({ dataDir });
            devicesView?.refresh();
            devicesView?.changed();
          },
          changed: () => devicesView?.changed(),
          // D518: a sign-in is done when the agent's own check, run now, says so (never the card's
          // cached probe). Given a sys (tests, demos), only the check they give: never a real agent.
          ...(opts.agentSetup?.sys
            ? opts.agentSetup.signedIn
              ? { signedIn: opts.agentSetup.signedIn }
              : {}
            : {
                signedIn: async (h: string) => {
                  widenAgentPath({ dataDir });
                  return signedInNow(h, agentProbe);
                },
              }),
          ...(opts.agentSetup?.waitMs ? { waitMs: opts.agentSetup.waitMs } : {}),
          ...(opts.agentSetup?.checkMs ? { checkMs: opts.agentSetup.checkMs } : {}),
        })
      : undefined;
  // D440: a pasted key whose agent can't run here yet: pi goes into the home's own tools folder (no Terminal).
  keyPrepare =
    opts.keyPrepare ??
    (async (h) => {
      if (!homeSetup) return false;
      const ok = await installAndWait(homeSetup, h);
      widenAgentPath({ dataDir });
      devicesView?.refresh();
      return ok;
    });
  agentSetupOp = async (device, f) => {
    const isHome = device === "local" || device === "" || (await devicesView?.frame())?.devices.some((d) => d.home && d.id === device);
    if (isHome) {
      if (f.action === "look") {
        widenAgentPath({ dataDir });
        devicesView?.refresh();
        devicesView?.changed();
        return { ok: true };
      }
      if (!homeSetup) return { ok: false, reason: "failed" };
      if (f.action === "install") homeSetup.install(f.harnesses ?? []);
      else if (f.action === "login") homeSetup.login(f.harness ?? "");
      else if (f.action === "code") homeSetup.code(f.harness ?? "", f.code ?? "");
      else if (f.action === "cancel") homeSetup.cancel(f.harness ?? "");
      else if (f.action === "logout") homeSetup.logout(f.harness ?? "");
      return { ok: true };
    }
    const id = devices.list().find((x) => x.kind === "worker" && (x.id === device || x.name === device))?.id;
    if (!id) return { ok: false, reason: "unknown" };
    const link = workers.link(id);
    if (!link) return { ok: false, reason: "away" };
    try {
      await link.call("agent_setup", { action: f.action, ...(f.harnesses ? { harnesses: f.harnesses } : {}), ...(f.harness ? { harness: f.harness } : {}), ...(f.code ? { code: f.code } : {}) }, 30_000);
      return { ok: true };
    } catch {
      // A Ducter there from before D363 doesn't know the op.
      return { ok: false, reason: "failed" };
    }
  };
  // D224: 全部更新 / Update all: the home's one plan, kept on disk, picked up again after its restart.
  const ua = opts.updateAll ?? {};
  const updateAll = createUpdateAll({
    dataDir,
    log,
    now: () => (u.sys ?? realSys).now(),
    updates: () => updates,
    agents: () => agents,
    devices: async () => (await devicesView?.frame())?.devices ?? [],
    busy: (device, h) => agentBusy(device, h),
    working: () => tasks.list().filter((c) => c.attention === "working").length + (runner?.critical?.() ?? []).length,
    settings: () => settings.get(),
    // D329: the home's Nowledge Mem is part of the plan when it is behind and Ducter can update it.
    mem: bridgeLink.memUpdate,
    ...(ua.tickMs !== undefined ? { tickMs: ua.tickMs } : {}),
    ...(ua.nightEveryMs !== undefined ? { nightEveryMs: ua.nightEveryMs } : testing ? { nightEveryMs: 0 } : {}),
    ...(ua.tz ? { tz: ua.tz } : {}),
  });
  updateAllRef = updateAll;
  // D228: 从外面连 / From outside: the person's own Cloudflare tunnel to their own domain, set
  // up by a task they start (its agent runs `ducter anywhere step …` against this home).
  let listening = 0;
  const homeLabel = () => savedHomeName(dataDir) ?? thisComputer(u.homeName);
  const anywhere: AnywhereCtl = createAnywhere({
    dataDir,
    port: () => listening,
    // D293: an address in the book coexists with the tunnel; only one set up by hand is "own".
    own: () => {
      const p = publicAddress(dataDir);
      return p && !bookHas(dataDir, p) ? p : undefined;
    },
    ways: { add: (u) => void addWay(dataDir, "tunnel", u), remove: (u) => void removeWay(dataDir, u) },
    ...(opts.anywhereSys ? { sys: opts.anywhereSys } : {}),
    ...(opts.anywherePollMs ? { pollMs: opts.anywherePollMs } : {}),
    ...(opts.anywhereStartMs ? { startMs: opts.anywhereStartMs } : process.env.DUCTER_ANYWHERE_START_MS ? { startMs: Number(process.env.DUCTER_ANYWHERE_START_MS) || undefined } : {}),
    ...(opts.anywhereStepWaitMs ? { stepWaitMs: opts.anywhereStepWaitMs } : {}),
    setup: {
      async openTask(brief, title) {
        const home = ((await devicesView?.frame())?.devices ?? []).find((d) => d.home);
        const body = home?.harnesses.find((h) => h.installed && h.loggedIn);
        if (!runner || !body) return console.warn(`[anywhere] no agent signed in on the home to set it up (${home ? home.harnesses.map((h) => `${h.harness}:${h.installed ? "installed" : "-"}/${h.loggedIn ? "signed in" : "-"}`).join(", ") || "none probed yet" : "no home"})`), undefined;
        const card = await runner.openTask({ persona: persona.id, title, brief, place: { kind: "none" }, harness: body.harness, language: langNow(), origin: "you" });
        return card.taskId;
      },
      open: (taskId) => {
        const a = tasks.get(taskId)?.attention;
        return !!a && !["done", "done_claimed", "failed", "dropped"].includes(a);
      },
      ask(taskId, hostname) {
        const w = words(ANYWHERE_ASK, langNow());
        const name = homeLabel();
        const decisionId = "d_" + crypto.randomUUID().replaceAll("-", "").slice(0, 10);
        log.append({
          stream: "channel",
          origin: "system",
          kind: "decision",
          body: {
            decisionId,
            taskId,
            question: fill(w.question, { hostname, name }),
            goLabel: w.go,
            // Suggested, never applied by itself: it changes the person's own account (no timer).
            defaultOption: "go",
            reversible: false,
            anywhere: { hostname },
          },
        });
        const c = tasks.get(taskId);
        if (c) tasks.setState(taskId, "needs_you", c.residency);
        return decisionId;
      },
      cli: () => {
        const exe = compiled ? process.execPath : `${process.execPath} ${join(import.meta.dir, "../../cli/src/main.ts")}`;
        const q = (x: string) => (/^[\w./~-]+$/.test(x) ? x : `'${x.replaceAll("'", "'\\''")}'`);
        return `${exe.split(" ").map(q).join(" ")} --port ${listening}`;
      },
      homeName: homeLabel,
      lang: langNow,
      qr: qrRows,
    },
  });
  anywhereRef = anywhere;
  log.subscribe((e) => {
    if (e.kind !== "decision_resolved") return;
    const r = e.body as import("@ducter/protocol").Bodies["decision_resolved"];
    if (decisions.get(r.decisionId)?.anywhere) anywhere.answered(r.decisionId, r.option === "go");
  });
  // D293: the book as this home holds it; each way checked from here (never in tests: no network).
  reachRef = createReach({
    dataDir,
    tunnelHost: () => anywhere.view()?.hostname,
    ...(opts.reachCheck ? { check: opts.reachCheck } : process.env.NODE_ENV === "test" ? {} : { check: proveHome(identity.fp) }),
    inUse: () => new Set([...[...ws.vias().values()].map((v) => v.url), ...workers.online().map((w) => w.via?.url)].filter((u): u is string => !!u)),
  });
  reachRef.onChange(() => {
    const f = waysFrame();
    ws.broadcast(f);
    workers.ways(f);
    devicesView?.changed();
  });
  workers.onChange(() => reachRef?.refresh());
  // D347: 加一台做事的电脑 / Add a computer for tasks: a code, the line to paste, and when it arrives.
  lendRef = createLend({ auth: devices, dataDir, bind: hostname, port: () => listening, broadcast: (f) => ws.broadcast(f) });
  // D514: the working copies tidied on each computer, for its card's quiet line.
  const tidiedCount = createTidied(log, () => devicesView?.changed());
  // D538: the home looks at itself every 15 s (memory, cores, disk, the kernel's stops); its card
  // hears a new look only when it moved enough to show. Tests and demos that fake the probes give
  // their own look, or none.
  const homeProbe = opts.deviceProbes ? opts.deviceProbes.resources : ((p) => () => p.look())(createResourceProbe({ dir: dataDir }));
  let homeLook: import("@ducter/protocol").DeviceResources | undefined;
  const lookHome = () =>
    homeProbe?.()
      .then((r) => {
        if (!r) return;
        const moved = resourcesMoved(homeLook, r);
        homeLook = r;
        if (moved) devicesView?.changed();
      })
      .catch(() => {});
  void lookHome();
  const homeLookTimer = homeProbe ? setInterval(lookHome, 15_000) : undefined;
  (homeLookTimer as { unref?: () => void } | undefined)?.unref?.();
  devicesView = createDevicesView({ resources: () => homeLook, tidied: (id) => tidiedCount.of(id), anywhere, dataDir, auth: devices, workers, connected: () => ws.connected(), viaOf: (id) => ws.vias().get(id), ways: () => reachRef?.ways() ?? [], homeKey: identity, probes: opts.deviceProbes, ...(u.homeName ? { hostname: u.homeName } : {}), updates: () => updates, agents: () => agents, agentSetup: () => homeSetup, memOn: () => memOnRef?.() ?? false, memCarried: () => !!memRelayRef && (memOnRef?.() ?? false) && !!memCarriedRef?.(), recordsOn: () => settings.localAgents(), updateAll: () => updateAll, mem: () => memPluginsRef, ...(agentTesting ? {} : { piBundled: bundledPiVersion }), self: { version, how: selfHow, platform: `${process.platform}-${process.arch}` }, ...(browser ? { browser } : {}), ...(ownPhone ? { ownPhone } : {}), ...(computer ? { computer } : {}), handsets, ...(opts.platform ? { platform: opts.platform } : {}), call: () => callAbility(phone.available(), connections.view()), onDisconnect: (id) => {
    for (const s of push.forget(id)) void apns.revoke?.(s);
  } });
  updates.onChange(() => devicesView?.changed());
  updateAll.onChange(() => devicesView?.changed());
  connections.onChange(() => devicesView?.changed()); // D199: 打电话 signed in, signed out, removed
  agents.onChange(() => devicesView?.changed());
  // D440: a home that couldn't think and now can (a key, a sign-in): what the person said meanwhile is answered.
  devicesView.onChange(() => brainHold.seen());
  // D169: Nowledge Mem in the user's own agents, per device. Checked at start, each day, when a
  // computer comes online, and after a sign-in or an agent update (both refresh the devices).
  const mp = opts.memPlugins ?? {};
  // D169: only for someone who already has Mem connected (its identity bound, D141, and Mem not
  // answering "missing"); without Mem, nothing about its plugin shows, anywhere.
  const memConnected = mp.connected ?? (() => !!persona.mem && !settings.memMissing());
  const memOn = () => settings.get().memory && process.env.DUCTER_MEMORY !== "off" && memConnected();
  memOnRef = memOn;
  // D375: the home's own nmem for Mem's `connect --tool` (a test passes a fake; a test without one never runs nmem).
  const connectNmem = agentTesting ? undefined : nmemCall({ env: opts.bridgeLink?.env, timeoutMs: 5 * 60_000 });
  const connectLocal = mp.connectLocal ?? (connectNmem ? (args: string[]) => connectNmem(["connect", ...args]) : undefined);
  const memPlugins = createMemPlugins({
    dataDir,
    log,
    tasks,
    persona,
    runner: () => runner,
    on: memOn,
    lang: langNow,
    inspectLocal:
      mp.inspectLocal ??
      (agentTesting ? async () => undefined : () => inspectMemPlugins(nmemInspectExec(process.env))),
    // D466: the newest plugin versions out, from Mem's own `plugins check` on the home (never in a test without a fake).
    ...(mp.checkUpdates || !agentTesting ? { checkUpdates: mp.checkUpdates ?? (() => checkMemPluginUpdates(nmemInspectExec(process.env))) } : {}),
    // D480: an agent's mailbox, looked at where it runs (the person's own nmem there; read only).
    ...(mp.bridgeLookLocal || !agentTesting
      ? {
          bridgeLook: async (id: string, home: boolean) => {
              if (home) return (mp.bridgeLookLocal ?? (() => inspectMemBridge(nmemInspectExec(process.env))))();
              const link = workers.link(id);
              if (!link?.online()) return undefined;
              return link
                .call<import("@ducter/protocol/src/mem-plugins.ts").MemBridgeLook | null>("mem_bridge_look", {}, 60_000)
                .then((r) => r ?? undefined)
                .catch((err: unknown) => (/unknown op/.test(String((err as Error)?.message ?? err)) ? ("old" as const) : undefined));
            },
        }
      : {}),
    inspectWorker: async (id) => {
      const link = workers.link(id);
      if (!link?.online()) return undefined;
      return link.call<Record<string, import("@ducter/protocol").MemPluginView> | null>("mem_plugins", {}, 30_000).then((r) => r ?? undefined).catch(() => undefined);
    },
    devices: async () => ((await devicesView?.frame())?.devices ?? []).map((x) => ({ id: x.id, name: x.name, home: x.home, awake: x.state === "awake", harnesses: x.harnesses })),
    // D375: Mem's own `nmem connect --tool` (on the home here; on a worker its mem_connect op).
    ...(connectLocal || !agentTesting
      ? {
          connectTools: async (id: string, home: boolean, hs: string[]) => {
            if (home) {
              const tools = hs.flatMap((h) => (MEM_CONNECT_TOOLS[h] ? ["--tool", MEM_CONNECT_TOOLS[h]!] : []));
              if (!tools.length || !connectLocal) return undefined;
              const r = await connectLocal([...tools, "--on-conflict", "abort"]);
              void memHealth.refresh();
              if (!r) return undefined;
              const last = scrubMem(`${r.out}\n${r.err}`).split("\n").map((l) => l.trim()).filter(Boolean).pop();
              return { ok: r.code === 0, ...(r.code !== 0 && last ? { detail: last.slice(0, 160) } : {}) };
            }
            const link = workers.link(id);
            if (!link?.online()) return undefined;
            return link.call<{ ok: boolean; detail?: string }>("mem_connect", { harnesses: hs }, 6 * 60_000).catch(() => undefined);
          },
        }
      : {}),
    ...(mp.everyMs !== undefined ? { everyMs: mp.everyMs } : agentTesting ? { everyMs: 0 } : {}),
    ...(mp.now ? { now: mp.now } : {}),
  });
  memPluginsRef = memPlugins;
  api.memPluginIn = (device, harness) => memPlugins.present(device, harness); // D168: a task there has it, in any form (research/48 M1)
  // D393: Mem carried to every task from this one connection: a relay for the task's nmem and Mem's
  // plugin as the home runs it, so a computer (or a sandbox on it) needs nothing of Mem's set up.
  // A test reaches the person's real Mem never: without a seam it carries nothing.
  const mr = opts.memRelay;
  const memCred = mr?.credential ?? (agentTesting ? () => undefined : () => readMemCredential());
  const memRelay = createMemRelay({
    secret: mcpSecret,
    credential: memCred,
    on: memOn,
    taskLive: (id) => {
      const c = tasks.get(id);
      return !!c && c.residency !== "archived" && c.attention !== "dropped";
    },
    kitDir: mr?.kitDir ?? (agentTesting ? () => undefined : (h) => (h === "claude-code" ? homeClaudeMemPlugin() : undefined)),
    ...(mr?.fetch ? { fetch: mr.fetch } : {}),
    used: (id) => {
      const c = tasks.get(id);
      if (c) log.append({ persona: c.persona, stream: `task:${id}`, origin: "task", kind: "task_event", body: { taskId: id, role: "system", from: "runner", text: "Nowledge Mem reached through the home", raw: { memory: "relay" } } });
    },
  });
  memRelayRef = memRelay;
  memCarriedRef = () => !!memCred();
  api.memCarry = {
    envFor: (id, base) => memRelay.envFor(id, base),
    kitFor: (id, h, base) => memRelay.kitFor(id, h, base),
    nmemIn: (device) => {
      if (!device || device === "local") return true;
      const w = workers.online().find((x) => x.deviceId === device || x.name === device);
      const st = w?.hello?.mem?.state;
      return !!st && st !== "absent";
    },
  };
  memPlugins.onChange(() => devicesView?.changed());
  {
    // A sign-in, a sign-out or an agent update refreshes the devices: read the check again.
    const v = devicesView;
    const refresh = v.refresh.bind(v);
    let soon: ReturnType<typeof setTimeout> | undefined;
    v.refresh = () => {
      refresh();
      if (soon) clearTimeout(soon);
      soon = setTimeout(() => void memPlugins.check(), 1_500);
    };
    // A computer that comes online is checked once it said hello.
    let up = new Set(workers.online().map((w) => w.deviceId));
    // D366: and once Nowledge Mem there turns ready (signed in, its agents connected), so the
    // agents' own Mem lines and a task's plugin there follow at once.
    const memReady = new Map<string, boolean>();
    workers.onChange(() => {
      const now = new Set(workers.online().filter((w) => w.hello).map((w) => w.deviceId));
      for (const id of now) if (!up.has(id)) void memPlugins.check(id);
      up = now;
      for (const w of workers.online()) {
        const ready = w.hello?.mem?.state === "ready";
        if (ready && memReady.get(w.deviceId) === false) void memPlugins.check(w.deviceId);
        memReady.set(w.deviceId, ready);
      }
    });
    // Memory switched back on: check everything again.
    let wasOn = memOn();
    settings.onChange(() => {
      const on = memOn();
      if (on && !wasOn) void memPlugins.check();
      wasOn = on;
    });
    void memPlugins.check();
  }
  devicesView.harnessesNow(); // probe once at start, so the partner's first turn knows who is signed in
  const sockets = splitSockets(ws.websocket, workers, { isLive: (id) => devices.isLive(id), nameOf: (id) => devices.list().find((d) => d.id === id)?.name, sweepMs: opts.sweepMs });
  // The iPhone app: this home's own Apple key if it has one, else the notification relay (D159).
  const relayAt = relayUrl();
  const apns = opts.apns ?? createAppPushSender(createApnsSender(loadApnsConfig(dataDir)), relayAt ? createRelayClient(relayAt, opts.relayFetch) : undefined);
  const pusher = createPusher({
    log,
    decisionOf: (id) => decisions.get(id),
    store: push,
    clock,
    personaName: () => persona.name,
    // D309: with more than one partner, each notification names whose it is.
    partnerOf: (e) => (partners.on() && partners.list().length > 1 ? partners.nameOf(e.stream.startsWith("channel:") ? e.stream.slice(8) : e.stream.startsWith("task:") ? tasks.get(e.stream.slice(5))?.persona : e.persona) : undefined),
    taskTitle: (id) => tasks.get(id)?.title,
    lastSummary: (id) => tasks.get(id)?.lastReport?.summary,
    holdMs: opts.pushHoldMs ?? (Number(process.env.DUCTER_PUSH_HOLD_MS) || undefined),
    enabled: opts.push ?? process.env.DUCTER_PUSH !== "off",
    fetcher: opts.pushFetch,
    apns,
    alive: (s) => s.deviceId === "local" || devices.isLive(s.deviceId),
    channelUp: (via) => ws.channelUp(via), // D277
    claimed: (k) => channels.claimed(k),
  });
  // D306: the iPhone's Live Activities follow the Log, through the same key or relay as alerts.
  const ambient = createAmbient({
    log,
    store: openAmbientStore(dataDir),
    clock,
    sender: createActivitySender({ config: loadApnsConfig(dataDir), transport: opts.ambientTransport ?? http2Transport(), relayUrl: relayAt, relayFetch: opts.relayFetch }),
    alive: (d) => d === "local" || devices.isLive(d),
  });
  // D165: the person's zone: their quiet hours', else (D243) the one their app last said, else the server's.
  const zone = () => opts.proactive?.zone ?? settings.get().quiet?.tz ?? proactiveRef?.clientZone() ?? opts.work?.defaultZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  // D222: every calendar account's calendars, merged (Accounts, the partner's calendar tool, the watcher).
  const calendar = createCalendar({ dataDir, connections, zone, log });
  calendarRef = calendar;
  // D341: 待办来源 / To-do sources. Tests never reach the real gh or the person's vaults.
  const srcTesting = process.env.NODE_ENV === "test";
  const taskSources = createTaskSources({
    dataDir,
    log,
    tasks,
    platform: opts.platform ?? process.platform,
    computer: () => savedHomeName(dataDir) ?? thisComputer(opts.update?.homeName),
    tell: (taskId, text) => void runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} its to-do changed:`, (e as Error).message)),
    standing: { allows: (ref) => standing.allows("pr_review", ref), firstUse: (id) => standing.firstUse(id), allowsComment: (ref) => standing.allows("issue_comment", ref) },
    stop: async (taskId) => {
      await runner?.drop(taskId).catch(() => {});
      const c = tasks.get(taskId);
      if (c && c.attention !== "dropped") tasks.setState(taskId, "dropped", c.residency, "its to-do was closed");
    },
    // D359: the pile counts its days in the person's zone and speaks their language.
    dayOf: (ms) => dayKey(ms, zone()),
    lang: () => (langNow().startsWith("zh") ? "zh" : "en"),
    name: () => persona.name,
    // D359: a handed-over to-do opens like 交给{name} on On hand: its repository's folder, its words as the brief.
    openTask: async (item, extra) => {
      // D395: the one resolver task_open uses: the computer with its code (or a clone first).
      const where = item.kind === "github" && item.where ? await repoWhere.resolve({ remote: item.where, texts: [item.title] }).catch(() => undefined) : undefined;
      const place = where?.ok ? where.place : item.kind === "github" ? placeForRepo((await newTask.options().catch(() => ({ places: [] }))).places, item.where)?.place : undefined;
      // D508: the to-do's whole title, and the person's language (never the issue's).
      // D522: its number starts the branch (`ducter/11028-<slug>`).
      const todo = item.kind === "github" && /^#\d+$/.test(item.label) ? item.label.slice(1) : undefined;
      const r = await newTask.open({ words: item.title, title: item.title, language: langNow(), ...(place ? { place } : {}), ...(todo ? { todo } : {}), brief: `${item.title}\n\n${briefOf(item)}${extra ? `\n${extra}` : ""}` });
      if (!r.ok) return { ok: false, error: r.message ?? r.reason };
      return "card" in r ? { ok: true, taskId: r.card.taskId } : { ok: false, error: "it became a routine" };
    },
    // D359: the repository's own review guide, read from its folder on this computer when there is one.
    reviewGuide: async (repo) => {
      const p = placeForRepo((await newTask.options().catch(() => ({ places: [] }))).places, repo);
      const root = p && p.place.kind === "repo" && (!p.place.device || p.place.device === "local") ? p.place.repoPath.replace(/^~(?=\/)/, homedir()) : undefined;
      if (!root) return undefined;
      for (const f of [".claude/skills/review/SKILL.md", ".claude/commands/review.md", ".agents/skills/review/SKILL.md", "REVIEW.md", ".github/REVIEW.md"]) {
        try {
          const t = readFileSync(join(root, f), "utf8");
          if (t.trim()) return t.slice(0, 4000);
        } catch {
          // not there: the next
        }
      }
      return undefined;
    },
    // D385: handing several over: groups, New task's places and agents, the computers by name, the rules.
    handover: {
      persona: () => persona.id,
      groups: () => taskGroups,
      places: async () => {
        const o = await newTask.options().catch(() => ({ places: [], candidates: [] }) as { places: import("@ducter/protocol").PlaceChoice[]; candidates: { harness: string }[] });
        return { places: o.places, harnesses: (o.candidates ?? []).map((c) => c.harness) };
      },
      computers: () => [{ device: "local", name: computers.homeName() ?? "" }, ...(computers.workers?.() ?? []).map((w) => ({ device: w.id, name: w.name }))],
      rules: () => rules.list(),
      newTasks: () => settings.get().newTasks,
      // D395: the one resolver task_open uses, so the sheet's Where and the tasks it opens agree with it.
      repoWhere: (a) => repoWhere.resolve(a) as Promise<import("./task-sources/handover.ts").RepoWhereAnswer>,
      addRule: (r) => void rules.add(r),
      open: async (input) => {
        if (!runner) throw new Error("Tasks can't run right now.");
        return runner.openTask(input);
      },
      tell: (taskId, text) => void runner?.send(taskId, text, undefined, "ducter").catch((e) => console.warn(`[core] couldn't tell ${taskId} about its hand-over:`, (e as Error).message)),
    },
    ...(srcTesting ? { ghRun: async () => ({ code: 127, out: "", err: "", missing: true as const }), home: join(dataDir, "no-home") } : {}),
    ...(opts.taskSources ?? {}),
  });
  // D385: plan first's lead part reports its plan here (only that task sees the tool).
  mcp.registerWhen(
    "task",
    "plan_report",
    "Only for a task whose brief says it plans a hand-over: the plan, every to-do in exactly one place (fixed, one, line, side, later), and the person's limits. Call once (again after the person replies), then report_to_main done.",
    PLAN_SCHEMA,
    async (args, ctx) => {
      if (!ctx.taskId) throw new Error("plan_report requires a task token");
      const r = taskSources.handover?.planReport(ctx.taskId, args) ?? { ok: false, error: "No hand-over here." };
      if (!r.ok) return r.error ?? "Not kept.";
      return "Plan kept. Now call report_to_main with state done and one plain line; the person sees the plan as a card.";
    },
    (ctx) => !!ctx.taskId && !!taskSourcesRef?.handover?.isPlanTask(ctx.taskId),
  );
  // D394: a task that reviews pull requests every so often reports each round here: every request
  // waiting on the person, and the drafts for those it reviewed again. The drafts become those
  // PRs' pre-reads (the sheet that shows them on the phone and the Mac) and one card asks to post
  // them all; the task never posts on its own. Seen only by a task whose brief is about reviewing,
  // with GitHub connected as a to-do source.
  const reviewTasks = new Map<string, boolean>();
  const isReviewTask = (taskId: string) => {
    if (!taskSourcesRef?.view().sources.some((x) => x.kind === "github")) return false;
    const known = reviewTasks.get(taskId);
    if (known !== undefined) return known;
    const opens = log.read({ stream: `task:${taskId}`, kinds: ["task_open"], limit: 20 });
    const text = opens.map((e) => `${(e.body as Bodies["task_open"]).title ?? ""} ${(e.body as Bodies["task_open"]).brief ?? ""}`).join(" ");
    const yes = REVIEW_WORDS.test(text);
    reviewTasks.set(taskId, yes);
    return yes;
  };
  isReview = isReviewTask;
  // D528: the round a review_report belongs to: the task's own timer (or condition) that last woke
  // it. Two reports under the same wake are one round; the later is its final look.
  const roundOf = (taskId: string): string | undefined => {
    const ws = log.read({ stream: "channel", kinds: ["waiter"], limit: 2000 });
    for (let i = ws.length - 1; i >= 0; i--) {
      const w = ws[i]!.body as Bodies["waiter"];
      if (w.taskId === taskId && w.wakes === "task" && w.state === "fired" && !w.limit) return w.waiterId;
    }
    return undefined;
  };
  mcp.registerWhen(
    "task",
    "review_report",
    "For a task that reviews pull requests every so often, from your round's final look (the end-of-round check for new requests included): every PR waiting on the person (ref owner/repo#number, its title, the head commit you looked at, its ci state there, changed true when you reviewed it this round), and for each one reviewed its review: body (your conclusion, in the PR's own language; alone when there is nothing to change) and drafted comments (kind problem or suggestion, path, line, text). Ducter posts at once what the person said may go without asking, and puts the rest on one card at once; never post reviews yourself and never leave a draft in a report. Whenever a later look finds more (or the person asks about one PR between rounds), call it again with the whole list: the later call replaces the earlier one for this round. Then wait_for the next round; a round that only calls this needs no report_to_main.",
    REVIEW_ROUND_SCHEMA,
    async (args, ctx) => {
      if (!ctx.taskId) throw new Error("review_report requires a task token");
      const r = await taskSources.pile.round(ctx.taskId, args, { ...((k) => (k ? { round: k } : {}))(roundOf(ctx.taskId)) });
      if (!r.ok) return r.error ?? "Not kept.";
      // D407: its board (when the person keeps one) is written now; after a few rounds, offered once.
      boards.afterRound(ctx.taskId);
      // D413: what the person said may go without asking went now; only the rest is on the card.
      const went = r.posted?.length ? `${r.posted.length} review${r.posted.length === 1 ? "" : "s"} went to GitHub without asking, as the person said (${r.posted.map((p) => p.ref).join(", ")}). ` : "";
      const asks = r.asking && (went || r.drafted) ? `${r.asking} unsent draft${r.asking === 1 ? "" : "s"} wait on one card; Ducter posts them on Go. ` : "";
      // D528: a later call in the same round replaced the earlier one; a new request was said to the person once.
      const again = r.replaced ? "It replaces this round's earlier review_report. " : "";
      const told = r.told?.length ? `The person was told once of the new request${r.told.length === 1 ? "" : "s"} (${r.told.join(", ")}); don't report ${r.told.length === 1 ? "it" : "them"} for that alone. ` : "";
      return went || r.drafted
        ? `Kept. ${again}${told}${went}${asks}Don't post or ask yourself. Now wait_for the next round and end your turn.`
        : `Kept: nothing new to ask the person. ${again}${told}Now wait_for the next round and end your turn.`;
    },
    (ctx) => !!ctx.taskId && isReviewTask(ctx.taskId),
  );
  taskSourcesRef = taskSources;
  // D413: a standing permission kept: every draft that waits inside it goes now (its card shrinks or
  // settles), and the review task hears that Ducter posts from now on.
  standing.onGrant(() => {
    void taskSources.pile
      .postWaiting()
      .then((went) => {
        for (const w of went)
          runner
            ?.send(w.taskId, `[Ducter] The person said reviews go to GitHub without asking: ${w.posted.length} of your drafts went now. From now on Ducter posts what your review_report drafts inside that, and asks only for the rest; don't post them yourself and don't ask about them.`, undefined, "ducter")
            .catch(() => {});
      })
      .catch((err) => console.warn("[standing] couldn't post what waits:", (err as Error).message));
  });
  // D407: a round, a Go or a draft sent from its sheet: the review board shows it at once.
  taskSources.pile.onBoard((id) => boards.write(id));
  if (opts.taskSources?.ask) taskSources.setAsk(opts.taskSources.ask);
  const proactive = createProactive({
    calendarIds: (a) => calendar.seenIds(a),
    dataDir,
    log,
    clock,
    persona,
    connections,
    settings,
    push,
    pusher,
    claimed: (k) => channels.claimed(k),
    // D359: the to-dos it can clear today, inside the morning note with their own Go.
    morningFinds: (noteId) => {
      const findId = `find_${randomBytes(6).toString("hex")}`;
      const m = taskSources.pile.morning(noteId, findId);
      return m ? [{ findId, kind: "todos" as const, text: m.text, how: m.how, decisionId: m.decisionId, goLabel: m.goLabel }] : [];
    },
    rules,
    decisions,
    runner: () => runner,
    ...(opts.proactive?.triage ? { triage: opts.proactive.triage } : {}),
    ...(opts.proactive?.judge ? { judge: opts.proactive.judge } : {}),
    ...(opts.proactive?.drafter ? { drafter: opts.proactive.drafter } : {}),
    ...(opts.proactive?.monthTokens ? { monthTokens: opts.proactive.monthTokens } : {}),
    present: () => ws.present(),
    zone,
    agentName: () => HARNESSES[brainInUse().harness]?.name,
    // D368: what the person is focused on (Mem's Working Memory) ranks the morning's finds.
    workingMemory,
    // D388: a question a said find left open (a public plan's day or time) may be looked up on the web.
    webLook: () => api.webLook,
    // D458: offers from past the accounts: the default partner's finished tasks, what it was told, Mem.
    wider: (c) => {
      const mine = tasks.list().filter((t) => !isOther(t.persona));
      const talk = log
        .read({ stream: "channel", kinds: ["user_msg"], limit: 500 })
        .filter((e) => e.origin === "user" && !isOther(e.persona) && !(e.body as { forwarded?: unknown }).forwarded)
        .map((e) => ({ text: (e.body as { text?: string }).text ?? "", at: Date.parse(e.ts) }));
      const refs = [...taskSources.pile.all(), ...taskSources.pile.handedOver()].map((p) => ({ ref: p.item.ref, label: p.item.label, title: p.item.title, state: p.item.state, ...(p.item.url ? { url: p.item.url } : {}), ...(p.item.updatedAt ? { updatedAt: p.item.updatedAt } : {}) }));
      return gatherLeads({ ...c, tasks: mine, talk, refs, ...(memLookRef && settings.get().memory ? { mem: memLookRef } : {}) });
    },
    ...(opts.proactive?.spotter ? { spotter: opts.proactive.spotter } : {}),
    ...(opts.proactive?.cross ? { cross: opts.proactive.cross } : {}),
  });
  proactiveRef = proactive;
  // D388: the dry replay: a second engine on a scratch folder, the same sources and agent, nothing sent.
  let replaying = false;
  replayRef = async (o) => {
    if (replaying) throw new Error("a replay is already running");
    replaying = true;
    try {
      return await replayProactive({ connections, settings, rules, log, persona, zone, harness: () => runner?.harness, pick: brainInUse, webLook: () => api.webLook, calendarIds: (a) => calendar.seenIds(a) }, o);
    } finally {
      replaying = false;
    }
  };
  // D464: `ducter proactive week`: the offers of the last weeks, counted from the Log (read-only).
  weekRef = (n) => {
    const weeks = Math.min(WEEKS_MAX, Math.max(1, Math.floor(n ?? WEEKS_DEFAULT)));
    const now = clock.now();
    const z = zone();
    const since = weeksSince(now, z, weeks);
    return weekReport(readWeekEvents(log, since), { now, zone: z, weeks, mode: settings.get().proactive ?? "off", weights: proactive.weights(), shadow: readShadowEvents(log, since) });
  };
  // D368: read once at the start, so the partner's first turn already has the day's focus (never awaited).
  void workingMemory.refresh().catch(() => undefined);
  registerProactiveTools(mcp, rules, proactive, (links, whys) => void Object.assign(noticedSources, { links, whys }));

  const server = Bun.serve<WsData | WorkerSocketData>({
    hostname,
    port: opts.port ?? Number(process.env.DUCTER_PORT || 7777),
    idleTimeout: 120,
    async fetch(req, srv) {
      const url = new URL(req.url);
      // D228: the tunnel's self-check (does this address still lead here, also as a WebSocket?).
      // A random per-home string; nothing else.
      if (url.pathname === CHECK_PATH) {
        if (req.headers.get("upgrade")?.toLowerCase() === "websocket") return srv.upgrade(req, { data: { anywhereCheck: true } as unknown as WsData }) ? undefined : new Response("upgrade failed", { status: 400 });
        return new Response(anywhere.checkToken(), { headers: { "content-type": "text/plain", "cache-control": "no-store" } });
      }
      // D293: the home proves it is itself (its key signs the device's nonce), before the gate:
      // a device asks this of a way it hasn't used yet, before it shows that way its token.
      if (url.pathname === CHALLENGE_PATH) {
        const n = url.searchParams.get("n");
        if (!okNonce(n)) return new Response("bad nonce", { status: 400 });
        return Response.json(identity.prove(n), { headers: { "cache-control": "no-store" } });
      }
      // D520: a device whose socket was refused asks whether its credential still stands here.
      // Only this signed answer may send it back to pairing; a refused upgrade alone never does
      // (a proxy says 502 while the home restarts).
      if (url.pathname === STANDING_PATH) {
        const n = url.searchParams.get("n");
        if (!okNonce(n)) return new Response("bad nonce", { status: 400 });
        const a = req.headers.get("authorization") ?? "";
        const token = req.headers.get("x-ducter-device") ?? (a.startsWith("Bearer ") ? a.slice(7).trim() : "");
        if (!token) return new Response("no credential", { status: 400 });
        const s = devices.standing(token);
        return Response.json(identity.attest(s.standing, s.device, n), { headers: { "cache-control": "no-store" } });
      }
      // The phone/web client's own files are public (web.ts); everything it talks to is not.
      const page = await webStatic(req);
      if (page) return page;
      // D405: an app's frame for the web: by its one-app token, under the app's own policy and a
      // sandbox (an opaque origin: no cookies, no storage, no network but what the policy allows).
      const frame = /^\/app-frame\/([A-Za-z0-9_-]{16,64})$/.exec(url.pathname);
      if (frame && req.method === "GET") {
        const doc = apps.frameDoc(frame[1]!);
        if (!doc) return new Response("gone", { status: 404, headers: { "cache-control": "no-store" } });
        return new Response(doc, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": `${appCsp("message")}; sandbox ${APP_SANDBOX}`, "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" } });
      }
      // D562: an app's own icon and Home Screen manifest, by its key (a Home Screen, a manifest
      // fetch and the Mac's Dock send no token). Only its name, mark and clay: nothing it keeps.
      const icon = /^\/app-icon\/(a[0-9a-f]{1,15})\/([A-Za-z0-9_-]{22})\/(?:(icon)-(\d{2,4})\.png|manifest\.webmanifest)$/.exec(url.pathname);
      if (icon && (req.method === "GET" || req.method === "HEAD")) {
        const m = apps.byIconKey(icon[1]!, icon[2]!);
        if (!m) return new Response("gone", { status: 404, headers: { "cache-control": "no-store" } });
        const res = appIconResponse(m, !!icon[3], Number(icon[4] ?? 0), url.pathname.replace(/[^/]*$/, ""));
        return req.method === "HEAD" ? new Response(null, { status: res.status, headers: res.headers }) : res;
      }
      // D206: a picture's bytes, by its key (an <img> sends no token); everything else about it is behind the gate.
      const pic = await media.serve(req);
      if (pic) return pic;
      // D393: the Mem relay carries its own per-task key (a sandbox holds no device token).
      if (url.pathname === "/mem" || url.pathname.startsWith("/mem/")) return (await memRelayRef?.handle(req)) ?? new Response("not found", { status: 404 });
      // Off-machine callers need a paired device token (auth.ts); /pair is answered here.
      const g = await gate.check(req, srv.requestIP(req)?.address);
      if (!g.pass) return g.response;
      // D293: which way this request came in by, for the socket it may open.
      const via = () => viaOf(req, srv.requestIP(req)?.address, reachRef?.ways() ?? []);
      const d = deviceRoutes(req, g, srv, workers, via);
      if (d) return d === "upgraded" ? undefined : d;
      const api = await webApi(req, g, { decisions, push, pusher, apns, personaName: () => persona.name, version, media, handsets, ambient, deviceOf: (r) => gate.deviceOf(r), share: (b) => ws.share(b), partners: () => ws.partnerList() });
      if (api) return api;
      if (url.pathname === "/ws") {
        // Block cross-site WebSocket hijacking from browser pages; native clients send no Origin
        // (the desktop sends its own address). Only this server's own origin counts: a page from
        // another local port (a dev server, another app) is another site. Through an SSH tunnel
        // the Host is the tunnel's, and so is the page's origin.
        // A device token can't ride along ambiently (no cookies), so it needs no origin check.
        if (g.via === "local" && !sameOriginWs(req)) return new Response("forbidden", { status: 403 });
        // The device rides along so a revoked device's live socket can be closed (workers.ts).
        // D238: a paired app that dials in over loopback (an SSH tunnel) is still that device when
        // it offers its token: its phone's 用这台手机 is spoken for by it alone.
        const own = g.via === "device" ? g.device : gate.deviceOf(req);
        const data = { ...ws.newData(), ...(own ? { device: own } : {}), via: via() };
        // A browser that offered ["ducter", <token>] gets "ducter" back: Bun echoes the first
        // offered subprotocol by itself (adding the header again would send it twice).
        return srv.upgrade(req, { data }) ? undefined : new Response("upgrade failed", { status: 400 });
      }
      if (url.pathname === "/mcp") return mcp.handle(req);
      if (url.pathname === "/health") return Response.json({ ok: true, headSeq: log.head(), build: BUILD, version });
      return new Response("not found", { status: 404 });
    },
    // D228: the self-check's socket says the check string and closes; every other socket is Ducter's.
    websocket: {
      ...sockets,
      open: (w) => ((w.data as { anywhereCheck?: boolean })?.anywhereCheck ? (w.send(anywhere.checkToken()), w.close(1000, "ok")) : sockets.open!(w)),
      message: (w, m) => ((w.data as { anywhereCheck?: boolean })?.anywhereCheck ? undefined : sockets.message(w, m)),
      close: (w, code, reason) => ((w.data as { anywhereCheck?: boolean })?.anywhereCheck ? undefined : sockets.close!(w, code, reason)),
    },
  });
  const port = server.port!;
  listening = port;
  void anywhere.resume().catch((e) => console.warn("[anywhere]", e));
  // D276: the chat apps connected before (their sockets and long polls) start once the home listens.
  void channels.start();
  // Up and listening: an update's helper waiting on this restart knows it's this version (update.ts
  // waitHealthy), also when /health doesn't name the version to it.
  try {
    writeAlive(dataDir, version);
  } catch {}
  mcp.setPort(port);

  return {
    ...api,
    channelUp: (via: string) => ws.channelUp(via),
    log,
    tasks,
    mcp,
    decisions,
    living,
    devices,
    workers,
    devicesView,
    waiters,
    work,
    ongoing,
    push,
    pusher,
    partners,
    channels,
    settings,
    bridgeLink,
    rules,
    pins,
    apps,
    said,
    standing,
    loadout,
    connections,
    phone,
    ownNumber,
    proactive,
    brainInUse,
    calendar,
    taskSources,
    taskGroups,
    asks,
    outside,
    made,
    memFiles,
    past,
    marks,
    redo,
    changes,
    updates,
    release,
    agents,
    updateAll,
    memPlugins,
    ...(browser ? { ducterBrowser: browser } : {}),
    ...(ownPhone ? { ducterPhone: ownPhone } : {}),
    handsets,
    ...(computer ? { computer } : {}),
    autofill,
    keyCopy,
    port,
    url: `ws://127.0.0.1:${port}/ws`,
    anywhere,
    setRunner(r) {
      runner = r;
      // D360: what was held in line before a restart opens now if its turn came meanwhile.
      void taskGroups.pump().catch((err) => console.warn("[core] the groups' line couldn't move:", (err as Error).message));
      // The cheap judge (D112, D113) runs on the harness the partner thinks with, on its small model.
      if (!opts.work?.judge)
        work.setJudge(createHarnessJudge({ harness: () => runner?.harness, pick: brainInUse, dataDir }));
      // D511: a Keep's end, read once from the person's words on the cheapest model (tool-less, its own folder).
      if (!opts.keeps?.endAsk)
        keepsRef?.setEndAsk(keepEndAsk(createHarnessAsk({ harness: () => runner?.harness, pick: brainInUse, dataDir, cheap: true, dir: "keep-end", timeoutMs: 60_000, system: "You answer with one JSON object and nothing else. You never use tools." })));
      // D519: each round of a Keep in one line to the person, read once from its report on the same cheap model.
      // Not in tests (a fake agent would take it for a task's session): they pass a fake.
      if (!opts.keeps?.roundAsk && process.env.NODE_ENV !== "test")
        keepsRef?.setRoundAsk(keepRoundAsk(createHarnessAsk({ harness: () => runner?.harness, pick: brainInUse, dataDir, cheap: true, dir: "keep-round", timeoutMs: 60_000, system: "You answer with one JSON object and nothing else. You never use tools." })));
      // D533: the person's edited words read once into the rules they change, shown as a diff before one Go.
      if (!opts.keeps?.rulesAsk)
        keepsRef?.setRulesAsk(keepRulesAsk(createHarnessAsk({ harness: () => runner?.harness, pick: brainInUse, dataDir, cheap: true, dir: "keep-rules", timeoutMs: 60_000, system: "You answer with one JSON object and nothing else. You never use tools." })));
      // D522: a new task's branch words, once per task, on the cheapest model (tool-less, its own folder).
      // Not in tests (a fake agent would take it for a task's session): they pass a fake or get the fallback.
      if (!opts.branchAsk && process.env.NODE_ENV !== "test") {
        const ask = createHarnessAsk({ harness: () => runner?.harness, pick: brainInUse, dataDir, cheap: true, dir: "branch-name", timeoutMs: 20_000, system: "You answer with one line of JSON and nothing else. You never use tools." });
        api.branchAsk = async (prompt: string) => (await ask(prompt)).text;
      }
      // D165: triage on the cheapest model of the harness the partner thinks with; the bar on its own model.
      // D226: the harness it really thinks with (D150's fallback included), never the unset default:
      // a Codex-only home once triaged every mail on a Claude Code that wasn't there, and said nothing.
      const port = () => runner?.harness;
      const pick = brainInUse;
      proactive.setModels({
        ...(opts.proactive?.triage ? {} : { triage: modelTriage(createHarnessAsk({ harness: port, pick, dataDir, cheap: true, dir: "triage" })) }),
        ...(opts.proactive?.judge ? {} : { judge: modelJudge(createHarnessAsk({ harness: port, pick, dataDir, cheap: false, dir: "judge" })) }),
        // D403: a waiting-on-you find's reply, on the cheapest capable model (tool-less, its own folder).
        ...(opts.proactive?.drafter ? {} : { drafter: modelDrafter(createHarnessAsk({ harness: port, pick, dataDir, cheap: true, dir: "drafts", timeoutMs: 60_000, system: "You answer with one JSON object and nothing else. You never use tools." })) }),
        // D458: the leads past the accounts, picked once a morning on the cheapest model (tool-less, its own folder).
        ...(opts.proactive?.spotter ? {} : { spotter: modelSpotter(createHarnessAsk({ harness: port, pick, dataDir, cheap: true, dir: "spot", timeoutMs: 90_000, system: "You answer with one JSON array and nothing else. You never use tools." })) }),
        // D502: cross-source findings in shadow, once a day on the cheapest model (tool-less, its own folder).
        ...(opts.proactive?.cross ? {} : { cross: modelCross(createHarnessAsk({ harness: port, pick, dataDir, cheap: true, dir: "cross", timeoutMs: 120_000, system: "You answer with one JSON array and nothing else. You never use tools." })) }),
      });
      // D359: the pile is sorted and PRs pre-read on the cheapest model of the harness the partner thinks with.
      if (!opts.taskSources?.ask) taskSources.setAsk(createHarnessAsk({ harness: port, pick, dataDir, cheap: true, dir: "pile", timeoutMs: 120_000 }));
      // Answers that were resolved but never handed to their task before a restart (decisions.ts).
      for (const u of decisions.takeUnforwarded()) {
        console.warn(`[core] re-sending the answer to ${u.decisionId} that ${u.taskId} never got (restart)`);
        void Promise.resolve()
          .then(() => r.send(u.taskId, u.text, undefined, u.from))
          .catch((err) => console.error(`[core] re-sending ${u.decisionId} to ${u.taskId} failed:`, (err as Error).message));
      }
    },
    setPartner(p) {
      partner = p;
      early.splice(0).forEach(trigger);
    },
    setPartnerFactory(make) {
      factory = make;
      // One that ran before starts now (its session stays parked until it has something to do),
      // so what it was in the middle of when Ducter stopped is picked up.
      if (partners.on()) for (const p of partners.list()) if (isOther(p.id) && existsSync(partnerDir(p.id))) startOther(p.id, true);
    },
    partnerView: (id) => viewOf(id),
    partnerDir,
    setPartnerMem(id, mem) {
      memOf.set(id, mem);
    },
    setPartnerBundle(id, text) {
      if (text?.trim()) bundleOf.set(id, text.trim());
      else bundleOf.delete(id);
    },
    setPlacementMem(c) {
      placementClient = c;
      void placementMem.sync().then(() => placementMem.refreshHints(true));
    },
    removePartner: (id) => removeOther(id),
    partnerSessions: () => sessions,
    shedCaches() {
      firstReader.forget();
      outsideReader.forget();
    },
    async stop() {
      keepsRef?.stop(); // D519: its rounds' reading stops with the home
      clearInterval(homeLookTimer);
      clearInterval(hintsTimer);
      ws.stop();
      agentLimits.stop();
      loadout.stop();
      previews.close();
      await browser?.stop().catch(() => {});
      await ownPhone?.stop().catch(() => {});
      handsets.stopAll();
      computer?.close();
      autofill.stop();
      keys.stop();
      keyCopy.stop();
      devicesView?.stop();
      anywhere.close(); // the tunnel itself keeps running: the next Ducter adopts it (same address)
      workers.stop();
      reachRef?.stop();
      sockets.stop();
      unsubscribePartner();
      mender.stop();
      for (const p of sessions.values()) await (p as { close?(): Promise<void> }).close?.().catch(() => {});
      phone.stop();
      ownNumber.stop();
      decisions.stop();
      living.stop();
      work.stop();
      limitWaits.stop();
      brainHold.stop();
      freeBudget.stop();
      freshLook.stop();
      takeBack.stop();
      proactive.stop();
      calendar.stop();
      taskSources.stop();
      changes.stop();
      pusher.stop();
      channels.stop();
      updates.stop();
      agents.stop();
      updateAll.stop_();
      memPlugins.stop();
      release.stop();
      void server.stop(true); // awaiting hangs in Bun 1.3 when a WebSocket was open
      log.close();
      devices.close();
    },
  };
}
