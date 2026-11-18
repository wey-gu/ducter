// A sanitized stand-in for what `gh api -i -X GET /issues -f filter=assigned -f per_page=50` prints:
// the status line and GitHub's headers, a blank line, then a page of issues in GitHub's full shape
// (each with its user, assignees, repository and owner, about 14 KB), so the page is as big as a
// real one (~700 KB). Every name, title and body here is invented.

const API = "https://api.github.com";

function user(login: string, id: number) {
  return {
    login,
    id,
    node_id: `U_kgDO${id.toString(36).padStart(8, "0")}`,
    avatar_url: `https://avatars.githubusercontent.com/u/${id}?v=4`,
    gravatar_id: "",
    url: `${API}/users/${login}`,
    html_url: `https://github.com/${login}`,
    followers_url: `${API}/users/${login}/followers`,
    following_url: `${API}/users/${login}/following{/other_user}`,
    gists_url: `${API}/users/${login}/gists{/gist_id}`,
    starred_url: `${API}/users/${login}/starred{/owner}{/repo}`,
    subscriptions_url: `${API}/users/${login}/subscriptions`,
    organizations_url: `${API}/users/${login}/orgs`,
    repos_url: `${API}/users/${login}/repos`,
    events_url: `${API}/users/${login}/events{/privacy}`,
    received_events_url: `${API}/users/${login}/received_events`,
    type: "User",
    user_view_type: "public",
    site_admin: false,
  };
}

function repository(full: string, id: number) {
  const [owner] = full.split("/") as [string];
  const r: Record<string, unknown> = { id, node_id: `R_kgDO${id.toString(36)}`, name: full.split("/")[1], full_name: full, private: true, owner: { ...user(owner, id + 1), type: "Organization" }, html_url: `https://github.com/${full}`, description: "An invented repository for tests", fork: false };
  for (const k of ["forks", "keys", "collaborators", "teams", "hooks", "issue_events", "events", "assignees", "branches", "tags", "blobs", "git_tags", "git_refs", "trees", "statuses", "languages", "stargazers", "contributors", "subscribers", "subscription", "commits", "git_commits", "comments", "issue_comment", "contents", "compare", "merges", "archive", "downloads", "issues", "pulls", "milestones", "notifications", "labels", "releases", "deployments"])
    r[`${k}_url`] = `${API}/repos/${full}/${k}{/id}`;
  return { ...r, created_at: "2024-03-01T08:00:00Z", updated_at: "2026-11-17T08:00:00Z", pushed_at: "2026-11-17T09:00:00Z", size: 51234, stargazers_count: 3, watchers_count: 3, language: "Go", has_issues: true, has_projects: true, has_wiki: false, has_pages: false, has_discussions: false, forks_count: 0, archived: false, disabled: false, open_issues_count: 120, license: null, allow_forking: false, is_template: false, topics: [], visibility: "private", forks: 0, open_issues: 120, watchers: 3, default_branch: "main", permissions: { admin: false, maintain: false, push: true, triage: true, pull: true } };
}

/** n invented issues assigned to `login`, newest first; every 25th is a pull request. */
export function assignedIssues(n = 50, login = "lin-dev") {
  const me = user(login, 4242);
  const repos = ["acme/engine", "acme/web", "acme/infra"];
  return Array.from({ length: n }, (_, i) => {
    const full = repos[i % repos.length]!;
    const number = 1000 + i;
    const pr = i % 25 === 3;
    const author = user(`teammate-${i % 7}`, 9000 + (i % 7));
    return {
      url: `${API}/repos/${full}/issues/${number}`,
      repository_url: `${API}/repos/${full}`,
      labels_url: `${API}/repos/${full}/issues/${number}/labels{/name}`,
      comments_url: `${API}/repos/${full}/issues/${number}/comments`,
      events_url: `${API}/repos/${full}/issues/${number}/events`,
      html_url: `https://github.com/${full}/${pr ? "pull" : "issues"}/${number}`,
      id: 3_000_000_000 + i,
      node_id: `I_kwDO${(3_000_000_000 + i).toString(36)}`,
      number,
      title: `Invented to-do number ${i + 1}: tidy the ${["parser", "planner", "scheduler", "exporter"][i % 4]}`,
      user: author,
      labels: [{ id: 77 + i, node_id: `LA_${i}`, url: `${API}/repos/${full}/labels/type%2Fbug`, name: i % 2 ? "type/bug" : "type/enhancement", color: "d73a4a", default: false, description: "An invented label" }],
      state: "open",
      locked: false,
      assignee: me,
      assignees: [me, author],
      milestone: null,
      comments: i % 5,
      created_at: "2026-10-01T08:00:00Z",
      updated_at: new Date(Date.UTC(2026, 10, 17, 12) - i * 3_600_000).toISOString().replace(/\.\d+Z$/, "Z"),
      closed_at: null,
      author_association: "MEMBER",
      type: null,
      active_lock_reason: null,
      sub_issues_summary: { total: 0, completed: 0, percent_completed: 0 },
      issue_dependencies_summary: { blocked_by: 0, total_blocked_by: 0, blocking: 0, total_blocking: 0 },
      ...(pr ? { draft: false, pull_request: { url: `${API}/repos/${full}/pulls/${number}`, html_url: `https://github.com/${full}/pull/${number}`, diff_url: `https://github.com/${full}/pull/${number}.diff`, patch_url: `https://github.com/${full}/pull/${number}.patch`, merged_at: null } } : {}),
      body: `## What\n\nAn invented description for test number ${i + 1}.\n\n${"Steps, logs and notes that make a real issue long. ".repeat(40)}\n\n\`\`\`\nstack line one\nstack line two\n\`\`\``,
      closed_by: null,
      reactions: { url: `${API}/repos/${full}/issues/${number}/reactions`, total_count: 0, "+1": 0, "-1": 0, laugh: 0, hooray: 0, confused: 0, heart: 0, rocket: 0, eyes: 0 },
      timeline_url: `${API}/repos/${full}/issues/${number}/timeline`,
      performed_via_github_app: null,
      state_reason: null,
      repository: repository(full, 600_000 + (i % repos.length)),
    };
  });
}

/** What `gh api -i` prints for that page (GitHub's own header names; no token, no real ids). */
export function assignedResponse(n = 50, login = "lin-dev", etag = 'W/"0123456789abcdef"'): string {
  const head = [
    "HTTP/2.0 200 OK",
    "Access-Control-Allow-Origin: *",
    "Cache-Control: private, max-age=60, s-maxage=60",
    "Content-Type: application/json; charset=utf-8",
    "Date: Wed, 18 Nov 2026 01:25:35 GMT",
    `Etag: ${etag}`,
    `Link: <${API}/issues?filter=assigned&per_page=50&sort=updated&state=open&page=2>; rel="next"`,
    "Server: github.com",
    "X-Github-Api-Version-Selected: 2022-11-28",
    "X-Oauth-Scopes: gist, read:org, repo",
    "X-Ratelimit-Limit: 5000",
    "X-Ratelimit-Remaining: 4415",
  ].join("\r\n");
  return `${head}\r\n\r\n${JSON.stringify(assignedIssues(n, login))}`;
}
