# ltoh

gitLab To gitHub. A dead simple script for migrating a project from GitLab to GitHub, including code repository, issues, and variables. Additionally creating a mirrored project on a self-hosted Forgejo server to the GitHub repository. Workflow in detail:

1. Fetch the GitLab project
2. Create a new GitHub repository
3. Pull the GitLab repository and push it to the GitHub repository (requires SSH access to both repositories)
4. Fetch the GitLab variables, and create them on the GitHub repository if any
5. Fetch the GitLab issues, and create them on the GitHub repository if any
6. Create a mirrored project on the Forgejo server to the new GitHub repository
7. Create the variables on the Forgejo server if any
8. Done

To install dependencies:

```bash
# This project uses bun runtime
# To install bun, please refer to https://bun.sh
bun install
```

To prepare `.env`:

```env
# Gitlab personal access token for read
GITLAB_TOKEN=your-gitlab-personal-access-token

# Github personal access token for read/write
GITHUB_TOKEN=your-github-personal-access-token
# Github personal access token for read (will be persisted in forgejo for future repo syncing)
GITHUB_FORGEJO_TOKEN=also-github-token-but-for-forgejo-to-mirror-the-github-repo
GITHUB_USER=your-github-username
GITHUB_ORG=your-github-organization

FORGEJO_HOST=your-forgejo-hostname-for-example-https://code.example.com
# Forgejo personal access token for read/write
FORGEJO_TOKEN=your-forgejo-personal-access-token
FORGEJO_USER=your-forgejo-username
FORGEJO_ORG=your-forgejo-organization
```

To run:

```bash
# gitlab_project_id: required, the id of the project to migrate
# personal_owner_flag: optional, if set to anything, the owner of the GitHub repository will be the personal access token owner, otherwise the owner will be the organization specified in the .env file
bun run app.ts <gitlab_project_id> <personal_owner_flag>

# Example, to migrate project with id 123456 to a GitHub organization:
bun run app.ts 123456

# Example, to migrate project with id 123456 to a GitHub user:
bun run app.ts 123456 meh
```

# License

See [LICENSE.md](LICENSE.md).
