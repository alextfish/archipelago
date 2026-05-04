import type { ConversationSpec } from './ConversationData';

/**
 * Applies template-variable substitution to the glyph strings in a
 * {@link ConversationSpec}.
 *
 * Variables are written as `{{key}}` in glyph strings.  Each occurrence is
 * replaced with the corresponding value from the supplied `variables` map.
 * Unknown keys are left as-is (e.g. `{{missing}}` stays `{{missing}}`).
 *
 * Mutation is performed **in-place** on the spec that is passed in; the caller
 * is responsible for ensuring the spec is not shared if immutability is needed.
 *
 * Pure model class — no Phaser dependency.
 */
export class ConversationVariableSubstitutor {
    private static readonly VARIABLE_PATTERN = /\{\{(\w+)\}\}/g;

    /**
     * Replace all `{{key}}` placeholders in every NPC glyph string of `spec`
     * with the matching value from `variables`.
     *
     * @param spec      The conversation spec to mutate.
     * @param variables Map of variable names to their replacement values.
     */
    static applyTo(spec: ConversationSpec, variables: Record<string, string>): void {
        for (const node of Object.values(spec.nodes)) {
            if (node.npc?.glyphs) {
                node.npc.glyphs = node.npc.glyphs.replace(
                    this.VARIABLE_PATTERN,
                    (_, key: string) => variables[key] ?? `{{${key}}}`
                );
            }
        }
    }
}
