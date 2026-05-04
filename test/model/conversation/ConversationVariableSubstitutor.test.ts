import { describe, it, expect } from 'vitest';
import { ConversationVariableSubstitutor } from '@model/conversation/ConversationVariableSubstitutor';
import type { ConversationSpec } from '@model/conversation/ConversationData';

function makeSpec(glyphs: string): ConversationSpec {
  return {
    nodes: {
      start: {
        npc: { glyphs },
        choices: [],
      },
    },
  } as unknown as ConversationSpec;
}

describe('ConversationVariableSubstitutor', () => {
  it('replaces a single variable with its value', () => {
    const spec = makeSpec('You have {{count}} jewels.');
    ConversationVariableSubstitutor.applyTo(spec, { count: '3' });
    expect(spec.nodes['start'].npc!.glyphs).toBe('You have 3 jewels.');
  });

  it('replaces multiple variables in one string', () => {
    const spec = makeSpec('{{a}} and {{b}}');
    ConversationVariableSubstitutor.applyTo(spec, { a: 'alpha', b: 'beta' });
    expect(spec.nodes['start'].npc!.glyphs).toBe('alpha and beta');
  });

  it('leaves unknown variables intact', () => {
    const spec = makeSpec('Hello {{name}}, you have {{count}} items.');
    ConversationVariableSubstitutor.applyTo(spec, { count: '5' });
    expect(spec.nodes['start'].npc!.glyphs).toBe('Hello {{name}}, you have 5 items.');
  });

  it('does nothing when there are no placeholders', () => {
    const spec = makeSpec('No substitution needed.');
    ConversationVariableSubstitutor.applyTo(spec, { count: '1' });
    expect(spec.nodes['start'].npc!.glyphs).toBe('No substitution needed.');
  });

  it('does nothing when the variables map is empty', () => {
    const spec = makeSpec('Value is {{x}}.');
    ConversationVariableSubstitutor.applyTo(spec, {});
    expect(spec.nodes['start'].npc!.glyphs).toBe('Value is {{x}}.');
  });

  it('handles nodes without an npc block', () => {
    const spec: ConversationSpec = {
      nodes: {
        start: {
          choices: [{ text: 'go', next: 'end' }],
        } as any,
        end: {
          npc: { glyphs: 'You got {{count}} coins.' },
          choices: [],
        } as any,
      },
    } as unknown as ConversationSpec;

    ConversationVariableSubstitutor.applyTo(spec, { count: '7' });

    expect((spec.nodes['start'] as any).npc).toBeUndefined();
    expect(spec.nodes['end'].npc!.glyphs).toBe('You got 7 coins.');
  });

  it('mutates the spec in place', () => {
    const spec = makeSpec('{{x}}');
    const originalNodes = spec.nodes;
    ConversationVariableSubstitutor.applyTo(spec, { x: 'hello' });
    expect(spec.nodes).toBe(originalNodes);
  });

  it('handles repeated occurrences of the same variable', () => {
    const spec = makeSpec('{{n}}, {{n}}, {{n}}');
    ConversationVariableSubstitutor.applyTo(spec, { n: 'go' });
    expect(spec.nodes['start'].npc!.glyphs).toBe('go, go, go');
  });
});
