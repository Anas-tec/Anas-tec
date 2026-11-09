import { readFile, writeFile } from "node:fs/promises";

const username = process.env.GITHUB_USERNAME || process.env.GITHUB_REPOSITORY_OWNER;
const token = process.env.GITHUB_TOKEN;
const readmePath = "README.md";
const startMarker = "<!-- PROFILE-AUTO-START -->";
const endMarker = "<!-- PROFILE-AUTO-END -->";

if (!username || !token) {
  throw new Error("GITHUB_USERNAME and GITHUB_TOKEN are required.");
}

async function github(path) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`GitHub API error ${response.status} for ${path}: ${await response.text()}`);
  }
  return response.json();
}

function clean(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\r?\n/g, " ")
    .trim();
}

function dateLabel(value) {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function eventSummary(event) {
  const repo = event.repo?.name || "a repository";
  const repoLink = `[${clean(repo)}](https://github.com/${repo})`;
  const payload = event.payload || {};

  switch (event.type) {
    case "PushEvent": {
      const count = payload.size || payload.commits?.length || 0;
      const message = payload.commits?.at(-1)?.message?.split("\n")[0];
      return `Pushed ${count} commit(s) to ${repoLink}${message ? ` — ${clean(message)}` : ""}`;
    }
    case "PullRequestEvent":
      return `${clean(payload.action || "Updated")} a pull request in ${repoLink}`;
    case "IssuesEvent":
      return `${clean(payload.action || "Updated")} an issue in ${repoLink}`;
    case "CreateEvent":
      return `Created ${clean(payload.ref_type || "a resource")} in ${repoLink}`;
    case "WatchEvent":
      return `Starred ${repoLink}`;
    case "ForkEvent":
      return `Forked ${repoLink}`;
    case "ReleaseEvent":
      return `Published a release in ${repoLink}`;
    default:
      return `Activity in ${repoLink}`;
  }
}

const [profile, repositories, events] = await Promise.all([
  github(`/users/${username}`),
  github(`/users/${username}/repos?per_page=100&sort=updated&type=owner`),
  github(`/users/${username}/events/public?per_page=10`),
]);

const publicRepos = repositories
  .filter((repo) => !repo.private && !repo.fork && !repo.archived)
  .slice(0, 5);

const repoList = publicRepos.length
  ? publicRepos.map((repo) => {
      const description = repo.description ? ` — ${clean(repo.description)}` : "";
      const language = repo.language ? ` · ${clean(repo.language)}` : "";
      return `- [${clean(repo.name)}](${repo.html_url})${description}${language}`;
    }).join("\n")
  : "_No public repositories to display yet._";

const recentEvents = events
  .filter((event) => event.type !== "PublicEvent")
  .slice(0, 5);

const activityList = recentEvents.length
  ? recentEvents.map((event) =>
      `- ${eventSummary(event)} · ${dateLabel(event.created_at)}`
    ).join("\n")
  : "_No recent public activity to display yet._";

const displayName = clean(profile.name || profile.login);
const bio = clean(profile.bio || "Full Stack Developer");
const location = profile.location ? `📍 ${clean(profile.location)}` : "";
const website = profile.blog
  ? `🌐 [Website](${profile.blog.startsWith("http") ? profile.blog : `https://${profile.blog}`})`
  : "";

const generated = `## 👋 ${displayName}

**GitHub:** [@${clean(profile.login)}](${profile.html_url})  
${bio}

${[location, website].filter(Boolean).join(" · ")}

| Public repositories | Followers | Following |
|:---:|:---:|:---:|
| **${profile.public_repos}** | **${profile.followers}** | **${profile.following}** |

### 🗂️ Recently Updated Public Repositories

${repoList}

### ⚡ Recent Public GitHub Activity

${activityList}

<sub>Profile data refreshed automatically by GitHub Actions.</sub>`;

const readme = await readFile(readmePath, "utf8");
const start = readme.indexOf(startMarker);
const end = readme.indexOf(endMarker);

if (start === -1 || end === -1 || end < start) {
  throw new Error(`README.md must contain ${startMarker} and ${endMarker} on separate lines.`);
}

const updated = readme.slice(0, start + startMarker.length)
  + "\n\n" + generated + "\n\n"
  + readme.slice(end);

if (updated !== readme) {
  await writeFile(readmePath, updated, "utf8");
  console.log("README dynamic profile section updated.");
} else {
  console.log("README dynamic profile section is already up to date.");
}
