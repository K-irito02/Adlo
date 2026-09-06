/**
 * GSAP Skills plugin for OpenCode.ai
 *
 * Registers GSAP animation skills directory via config hook.
 * Skills are auto-discovered from .opencode/skills/gsap-*/
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const GsapSkillsPlugin = async ({ client, directory }) => {
  const gsapSkillsDir = path.resolve(__dirname, '../skills');

  return {
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(gsapSkillsDir)) {
        config.skills.paths.push(gsapSkillsDir);
      }
    },
  };
};
