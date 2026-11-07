// Pins a suite to the classic interface, which it was written against, now the new one is the default (#735). Imported
//  straight after `./dom`. The release that removes the classic components moves each suite importing this onto the
//  new ones.

import { document } from './dom';

import { applyInterface } from '../../../src/js/UI/lib/interfaceMode';

applyInterface('classic', null, document.documentElement as HTMLElement);
