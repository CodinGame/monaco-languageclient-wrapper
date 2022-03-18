module.exports = {
  branches: [
    'main'
  ],
  plugins: [
    ['@semantic-release/commit-analyzer', {
      preset: 'conventionalcommits',
      releaseRules: [
        { type: 'ci', release: 'patch' },
        { type: 'style', release: 'patch' },
        { type: 'refactor', release: 'patch' },
        { type: 'cleanup', release: 'patch' },
        { type: 'docs', release: 'patch' },
        { type: 'perfs', release: 'patch' },
        { type: 'test', release: 'patch' },
        { type: 'libs', release: 'patch' },
        { type: 'chore', release: 'patch' },
      ]
    }],
    '@semantic-release/release-notes-generator',
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md'
      }
    ],
    '@semantic-release/npm',
    '@semantic-release/github',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'dist/**', 'package.json'],
        message: 'chore(release): set `package.json` to ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}'
      }
    ]
  ]
}