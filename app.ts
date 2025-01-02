import { $ } from 'bun'

const {
  GITLAB_TOKEN,
  GITHUB_TOKEN,
  GITHUB_FORGEJO_TOKEN,
  FORGEJO_TOKEN,
  GITHUB_ORG,
  FORGEJO_HOST,
  FORGEJO_ORG,
  GITHUB_USER,
  FORGEJO_USER,
} = process.env

if (!GITLAB_TOKEN) {
  throw new Error('GITLAB_TOKEN is required')
}

if (!GITHUB_TOKEN) {
  throw new Error('GITHUB_TOKEN is required')
}

if (!GITHUB_FORGEJO_TOKEN) {
  throw new Error('GITHUB_FORGEJO_TOKEN is required')
}

if (!FORGEJO_TOKEN) {
  throw new Error('FORGEJO_TOKEN is required')
}

if (!GITHUB_ORG && !GITHUB_USER) {
  throw new Error('either GITHUB_ORG or GITHUB_USER is required')
}

if (!FORGEJO_ORG && !FORGEJO_USER) {
  throw new Error('either FORGEJO_ORG or FORGEJO_USER is required')
}

if (process.argv.length < 3) {
  throw new Error('gitlab repo Id is required')
}

const gitlabRepoId = process.argv[2]

// pass anything in the args after gitlab repo Id to override the org setting in env and make this repo owner the current user
let isOwnerOrg = true
if (process.argv.length >= 4) {
  isOwnerOrg = false
}

console.log('fetching gitlab repo info...')

const gitlabRepoRes = await fetch(`https://gitlab.com/api/v4/projects/${gitlabRepoId}`, {
  headers: {
    'PRIVATE-TOKEN': GITLAB_TOKEN,
  },
})

if (!gitlabRepoRes.ok) {
  throw await gitlabRepoRes.text()
}

const { path: repoName, description = '', ssh_url_to_repo: sshUrl, visibility } = await gitlabRepoRes.json()

console.log('cloning gitlab repo code...')

const cloneRes = await $`rm -rf ${repoName} && git clone --mirror ${sshUrl} ${repoName}`.text()
console.log(cloneRes || 'ok')

console.log('creating github repo...')

let githubRepoRes = await fetch(
  `https://api.github.com/${GITHUB_ORG && isOwnerOrg ? 'orgs/' + GITHUB_ORG : 'user'}/repos`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({
      name: repoName,
      // remove any control characters from description
      description: description?.trim().replace(/[\x00-\x1F\x7F-\x9F]/g, ' ') || '',
      private: visibility !== 'public',
      allow_merge_commit: false,
      allow_rebase_merge: false,
      delete_branch_on_merge: true,
    }),
  },
)

if (!githubRepoRes.ok) {
  if (githubRepoRes.status !== 422) {
    console.log(`POST https://api.github.com/${GITHUB_ORG && isOwnerOrg ? 'orgs/' + GITHUB_ORG : 'user'}/repos`)
    throw await githubRepoRes.text()
  } else {
    const url = `https://api.github.com/repos/${GITHUB_ORG && isOwnerOrg ? GITHUB_ORG : GITHUB_USER}/${repoName}`
    githubRepoRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    if (!githubRepoRes.ok) {
      console.error(`GET`, url)
      throw await githubRepoRes.text()
    }
  }
}

console.log('pushing code to github...')

const githubRepo = await githubRepoRes.json()
const githubRepoSshUrl = githubRepo.ssh_url
const githubRepoHtmlUrl = githubRepo.html_url

// add "git lfs fetch --all &&" before "git remote add github" if you have lfs files
const pushRes = await $`cd ${repoName} &&  git remote add github ${githubRepoSshUrl} && git push --mirror github`.text()
console.log(pushRes || 'ok')

console.log('copying gitlab repo variables to github...')

const gitlabVarsRes = await fetch(`https://gitlab.com/api/v4/projects/${gitlabRepoId}/variables`, {
  headers: {
    'PRIVATE-TOKEN': GITLAB_TOKEN,
  },
})

if (!gitlabVarsRes.ok) {
  console.error(`https://gitlab.com/api/v4/projects/${gitlabRepoId}/variables`)
  throw await gitlabVarsRes.text()
}

const gitlabVars = await gitlabVarsRes.json()

if (!gitlabVars.length) {
  console.log('no gitlab variables to copy')
}

if (gitlabVars.length) {
  for (const { key, value } of gitlabVars) {
    const url = `https://api.github.com/repos/${GITHUB_ORG && isOwnerOrg ? GITHUB_ORG : GITHUB_USER}/${repoName}/actions/variables`
    const githubVarRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        name: key,
        value,
      }),
    })
    if (!githubVarRes.ok) {
      console.error('POST', url)
      console.error('error:', await githubVarRes.text())
    } else {
      console.log(`copied ${key} to github actions variables`)
    }
  }
}

console.log('copying gitlab repo issues to github...')
const gitlabIssuesRes = await fetch(`https://gitlab.com/api/v4/projects/${gitlabRepoId}/issues`, {
  headers: {
    'PRIVATE-TOKEN': GITLAB_TOKEN,
  },
})

if (!gitlabIssuesRes.ok) {
  throw await gitlabIssuesRes.text()
}

const gitlabIssues = await gitlabIssuesRes.json()
if (!gitlabIssues.length) {
  console.log('no gitlab issues to copy')
}

if (gitlabIssues.length) {
  for (const { title, description, labels } of gitlabIssues) {
    const url = `https://api.github.com/repos/${GITHUB_ORG && isOwnerOrg ? GITHUB_ORG : GITHUB_USER}/${repoName}/issues`
    const githubIssueRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        title,
        body: description || '',
        labels,
      }),
    })
    if (!githubIssueRes.ok) {
      console.error('POST', url)
      console.error('error:', await githubIssueRes.text())
    } else {
      console.log(`copied "${title}" to github issues`)
    }
  }
}

console.log('creating forgejo repo mirroring the github repo...')

let forgejoRepoRes = await fetch(`${FORGEJO_HOST}/api/v1/repos/migrate`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `token ${FORGEJO_TOKEN}`,
  },
  body: JSON.stringify({
    service: 'github',
    mirror: true,
    private: true,
    repo_owner: FORGEJO_ORG && isOwnerOrg ? FORGEJO_ORG : FORGEJO_USER,
    repo_name: repoName,
    clone_addr: githubRepoHtmlUrl,
    auth_token: GITHUB_FORGEJO_TOKEN,
  }),
})

if (!forgejoRepoRes.ok) {
  if (forgejoRepoRes.status !== 409) {
    throw await forgejoRepoRes.text()
  }

  forgejoRepoRes = await fetch(
    `${FORGEJO_HOST}/api/v1/repos/${FORGEJO_ORG && isOwnerOrg ? FORGEJO_ORG : FORGEJO_USER}/${repoName}`,
    {
      headers: {
        Authorization: `token ${FORGEJO_TOKEN}`,
      },
    },
  )
  if (!forgejoRepoRes.ok) {
    throw await forgejoRepoRes.text()
  }
}

if (gitlabVars.length) {
  console.log('copying gitlab repo variables to forgejo...')

  for (const { key, value } of gitlabVars) {
    const url = `${FORGEJO_HOST}/api/v1/repos/${FORGEJO_ORG && isOwnerOrg ? FORGEJO_ORG : FORGEJO_USER}/${repoName}/actions/variables/${key.replace('CI_', '')}`
    const forgejoVarRes = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `token ${FORGEJO_TOKEN}`,
      },
      body: JSON.stringify({
        value,
      }),
    })
    if (!forgejoVarRes.ok) {
      console.error(url)
      console.error('error:', await forgejoVarRes.text())
    } else {
      console.log(`copied ${key} to forgejo actions variables`)
    }
  }
}

console.log('removing cloned repo...')
const rmRes = await $`rm -rf ${repoName}`.text()
console.log(rmRes || 'ok')

console.log('archiving gitlab repo...')
const archiveRes = await fetch(`https://gitlab.com/api/v4/projects/${gitlabRepoId}/archive`, {
  method: 'POST',
  headers: {
    'PRIVATE-TOKEN': GITLAB_TOKEN,
  },
})

if (!archiveRes.ok) {
  throw await archiveRes.text()
}

console.log('done')
