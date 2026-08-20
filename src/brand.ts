import { brand } from '@reqly/design-system';

/**
 * Isolated from `constants.ts` so the pure request modules never pull the
 * ESM-only design system into a CommonJS test run.
 */
export const APP_NAME = brand.name;
export const APP_DESCRIPTION = brand.description;
export const REPO_URL = brand.repositoryUrl;
