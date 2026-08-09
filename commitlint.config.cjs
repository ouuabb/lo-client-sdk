module.exports = {
  extends: ['@commitlint/config-conventional'],

  plugins: [
    {
      rules: {
        // type 必须为英文小写
        'type-english': (parsed) => {
          const { type } = parsed;
          if (!type) return [true];
          if (/^[a-z]+$/.test(type)) {
            return [true];
          }
          return [false, 'type 必须为英文小写，如: feat, fix, docs, chore'];
        },
        // subject 必须包含中文
        'subject-chinese': (parsed) => {
          const { subject } = parsed;
          if (!subject) return [false, 'subject 不能为空'];
          if (/[\u4e00-\u9fa5]/.test(subject)) {
            return [true];
          }
          return [false, 'subject 必须包含中文'];
        },
      },
    },
  ],

  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat', 'fix', 'docs', 'style', 'refactor',
        'perf', 'test', 'build', 'ci', 'chore', 'revert',
      ],
    ],
    'type-case': [2, 'always', 'lower-case'],
    'type-empty': [2, 'never'],

    'scope-case': [0],
    'scope-empty': [0],
    'scope-enum': [0],

    'subject-empty': [2, 'never'],
    'subject-full-stop': [0, 'never'],
    'subject-case': [0],

    'type-english': [2, 'always'],
    'subject-chinese': [2, 'always'],

    'header-max-length': [2, 'always', 72],
  },
};