import { describe, expect, it } from 'vitest';

import {
  bottomNavNavigateIcon,
  bottomNavProfileIcon,
  bottomNavSocialIcon,
} from './bottom-nav-icons';

describe('bottom nav icons', () => {
  it('paints as inline SVGs instead of mask image URLs', () => {
    for (const html of [
      bottomNavNavigateIcon,
      bottomNavSocialIcon,
      bottomNavProfileIcon,
    ]) {
      expect(html).toContain('<svg');
      expect(html).toContain('currentColor');
      expect(html).not.toContain('.png');
      expect(html).not.toContain('url(');
    }
  });
});
