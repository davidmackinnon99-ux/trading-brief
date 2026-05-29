import { register } from '../router.js';
import * as core from '../../core/ui.js';

register('layout', {
  description: 'Layout tools (list, switch, wait-for)',
  subcommands: new Map([
    ['list', {
      description: 'List saved chart layouts',
      handler: () => core.layoutList(),
    }],
    ['switch', {
      description: 'Switch to a saved layout by name or ID',
      handler: (opts, positionals) => {
        if (!positionals[0]) throw new Error('Layout name required. Usage: tv layout switch "My Layout"');
        return core.layoutSwitch({ name: positionals.join(' ') });
      },
    }],
    ['wait-for', {
      description: 'Poll until a specific indicator name appears, confirming layout load complete. Usage: tv layout wait-for "indicator name" [--timeout 300] [--poll 10]',
      options: {
        timeout: { type: 'string', description: 'Max wait in seconds (default 300)' },
        poll:    { type: 'string', description: 'Poll interval in seconds (default 10)' },
      },
      handler: (opts, positionals) => {
        if (!positionals[0]) throw new Error('Indicator name required. Usage: tv layout wait-for "SID Trading Signals"');
        return core.layoutWaitFor({
          indicator: positionals[0],
          timeout_ms: (Number(opts.timeout) || 300) * 1000,
          poll_ms:    (Number(opts.poll)    ||  10) * 1000,
        });
      },
    }],
  ]),
});
