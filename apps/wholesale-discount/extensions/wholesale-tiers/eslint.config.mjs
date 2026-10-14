import preset from '@repo/config/eslint-preset';

export default [...preset, { ignores: ['generated/**'] }];
